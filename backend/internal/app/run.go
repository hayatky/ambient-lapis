package app

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"sync"
	"time"

	"github.com/hayatky/ambient-lapis/backend/internal/backup"
	"github.com/hayatky/ambient-lapis/backend/internal/collector"
	"github.com/hayatky/ambient-lapis/backend/internal/config"
	"github.com/hayatky/ambient-lapis/backend/internal/httpapi"
	"github.com/hayatky/ambient-lapis/backend/internal/nature"
	"github.com/hayatky/ambient-lapis/backend/internal/store"
)

func Run(ctx context.Context, version string) error {
	cfg, configErr := config.Load()
	logger := NewLogger(os.Stdout, cfg.LogLevel)
	readiness := NewReadiness()
	readiness.SetConfiguration(configErr == nil)
	readiness.SetDeviceTargetValid(configErr == nil)
	readiness.SetApplianceTargetValid(configErr == nil)

	var database *store.Store
	var queries httpapi.QueryService
	var scheduler *collector.Scheduler
	var backupManager *backup.Manager
	if configErr != nil {
		logger.Error("configuration invalid", "event", "configuration_invalid", "error", configErr)
	} else {
		var err error
		database, err = store.Open(ctx, cfg.DatabasePath)
		if err != nil {
			logger.Error("database initialization failed", "event", "migration_failed", "error", err)
		} else {
			readiness.SetDatabase(true)
			readiness.SetMigrations(true)
			logger.Info("database migrations ready", "event", "migration_applied")
			repairOK := repairInterruptedRuns(ctx, database, readiness, logger, time.Now().UTC())
			if repairOK {
				backupManager = &backup.Manager{Store: database, Dir: cfg.BackupDir, Location: cfg.Location}
				if err := backupManager.Ready(); err != nil {
					logger.Error("backup directory unavailable", "event", "backup_failed", "error", err)
				} else {
					readiness.SetBackupDirectory(true)
				}
				queries = NewQueryService(QueryOptions{Store: database, DeviceID: cfg.DeviceID, ApplianceID: cfg.ApplianceID,
					PollInterval: cfg.PollInterval, StaleAfter: cfg.StaleAfter, Location: cfg.Location})
				client, err := nature.NewClient(nature.Options{Token: cfg.Token, Version: version, Timeout: cfg.HTTPTimeout,
					RateLimitFallback: cfg.PollInterval, Event: natureEventLogger(logger)})
				if err != nil {
					return fmt.Errorf("create Nature client: %w", err)
				}
				runner, err := collector.New(collector.Options{Adapter: client, Store: newCollectorStoreAdapter(database, readiness), DeviceID: cfg.DeviceID,
					ApplianceID: cfg.ApplianceID, TargetStatus: readiness})
				if err != nil {
					return fmt.Errorf("create collector: %w", err)
				}
				scheduler, err = collector.NewScheduler(loggedCollector{runner: runner, logger: logger}, client, cfg.PollInterval, nil, nil)
				if err != nil {
					return fmt.Errorf("create scheduler: %w", err)
				}
			}
		}
	}

	handler := httpapi.New(httpapi.Dependencies{Version: version, Timezone: cfg.Timezone, Readiness: readiness, Queries: queries, Logger: logger})
	server := NewHTTPServer(cfg.ListenAddr, handler, logger)
	logger.Info("service started", "event", "service_started", "version", version, "listenAddr", cfg.ListenAddr)
	defer logger.Info("service stopped", "event", "service_stopped")
	if database != nil {
		defer database.Close()
	}

	workerCtx, stopWorkers := context.WithCancel(ctx)
	defer stopWorkers()
	var workers sync.WaitGroup
	if scheduler != nil {
		workers.Add(1)
		go func() {
			defer workers.Done()
			if err := scheduler.Run(workerCtx); err != nil && workerCtx.Err() == nil {
				logger.Error("scheduler stopped", "event", "scheduler_failed", "error", err)
			}
		}()
	}
	if backupManager != nil && readiness.Snapshot().BackupDirectory {
		workers.Add(1)
		go func() { defer workers.Done(); runBackups(workerCtx, backupManager, cfg.Location, logger, readiness) }()
	}
	err := server.Serve(ctx)
	stopWorkers()
	workers.Wait()
	return err
}

func natureEventLogger(logger *slog.Logger) nature.EventFunc {
	return func(event nature.Event) {
		logger.Info("Nature API event", "event", event.Name, "attempt", event.Attempt, "delayMs", event.Delay.Milliseconds(), "code", event.Code)
	}
}

type runningRepairer interface {
	CancelRunning(context.Context, time.Time) (int64, error)
}

func repairInterruptedRuns(ctx context.Context, repairer runningRepairer, readiness *Readiness, logger *slog.Logger, now time.Time) bool {
	if _, err := repairer.CancelRunning(ctx, now); err != nil {
		logger.Error("stale collection repair failed", "event", "collection_repair_failed", "error", err)
		readiness.SetDatabase(false)
		return false
	}
	return true
}
