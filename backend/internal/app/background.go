package app

import (
	"context"
	"log/slog"
	"time"

	"github.com/hayatky/ambient-lapis/backend/internal/backup"
	"github.com/hayatky/ambient-lapis/backend/internal/domain"
)

type loggedCollector struct {
	runner interface {
		Run(context.Context) (domain.CollectionResult, error)
	}
	logger *slog.Logger
}

func (c loggedCollector) Run(ctx context.Context) (domain.CollectionResult, error) {
	started := time.Now()
	c.logger.InfoContext(ctx, "collection started", "event", "collection_started")
	result, err := c.runner.Run(ctx)
	attrs := []any{"event", "collection_completed", "runId", result.RunID,
		"overallStatus", result.OverallStatus, "devicesStatus", result.Devices.Status,
		"appliancesStatus", result.Appliances.Status, "durationMs", time.Since(started).Milliseconds()}
	if err != nil {
		attrs = append(attrs, "error", err)
		c.logger.ErrorContext(ctx, "collection failed", attrs...)
		return result, err
	}
	c.logger.InfoContext(ctx, "collection completed", attrs...)
	return result, nil
}

func runBackups(ctx context.Context, manager *backup.Manager, location *time.Location, logger *slog.Logger, readiness *Readiness) {
	runBackupSchedule(ctx, manager, location, logger, readiness, time.Now, waitFor)
}

type backupRunner interface {
	HasDaily(time.Time) (bool, error)
	Create(context.Context, time.Time) (backup.Result, error)
}

type backupClock func() time.Time
type backupWait func(context.Context, time.Duration) error

func runBackupSchedule(ctx context.Context, manager backupRunner, location *time.Location, logger *slog.Logger, readiness *Readiness, now backupClock, wait backupWait) {
	for {
		current := now()
		scheduled := backupTimeForDay(current, location)
		if current.Before(scheduled) {
			if wait(ctx, scheduled.Sub(current)) != nil {
				return
			}
			continue
		}
		hasDaily, err := manager.HasDaily(current)
		setBackupReadiness(readiness, err == nil)
		if err != nil || !hasDaily {
			logger.InfoContext(ctx, "backup started", "event", "backup_started")
			result, createErr := manager.Create(ctx, current)
			if createErr != nil {
				setBackupReadiness(readiness, false)
				if ctx.Err() == nil {
					logger.ErrorContext(ctx, "backup failed", "event", "backup_failed", "error", createErr)
				}
			} else {
				setBackupReadiness(readiness, true)
				logger.InfoContext(ctx, "backup completed", "event", "backup_completed")
				if len(result.Pruned) > 0 {
					logger.InfoContext(ctx, "backup retention pruned", "event", "retention_pruned", "count", len(result.Pruned))
				}
			}
		}
		current = now()
		delay := nextBackupTime(current, location).Sub(current)
		if delay < 0 {
			delay = 0
		}
		if wait(ctx, delay) != nil {
			return
		}
	}
}

func setBackupReadiness(readiness *Readiness, ready bool) {
	if readiness != nil {
		readiness.SetBackupDirectory(ready)
	}
}

func waitFor(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func backupTimeForDay(now time.Time, location *time.Location) time.Time {
	local := now.In(location)
	return time.Date(local.Year(), local.Month(), local.Day(), 3, 15, 0, 0, location)
}

func nextBackupTime(now time.Time, location *time.Location) time.Time {
	local := now.In(location)
	next := backupTimeForDay(local, location)
	if !next.After(local) {
		next = next.AddDate(0, 0, 1)
	}
	return next
}
