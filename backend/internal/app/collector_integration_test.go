package app

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/hayatky/ambient-lapis/backend/internal/collector"
	"github.com/hayatky/ambient-lapis/backend/internal/domain"
	"github.com/hayatky/ambient-lapis/backend/internal/httpapi"
	"github.com/hayatky/ambient-lapis/backend/internal/nature"
	"github.com/hayatky/ambient-lapis/backend/internal/store"
)

type adapterStub struct {
	environment func(context.Context, string) (domain.EnvironmentReading, error)
	aircon      func(context.Context, string) (domain.AirconReading, error)
}

func (a adapterStub) FetchEnvironment(ctx context.Context, id string) (domain.EnvironmentReading, error) {
	return a.environment(ctx, id)
}
func (a adapterStub) FetchAircon(ctx context.Context, id string) (domain.AirconReading, error) {
	return a.aircon(ctx, id)
}

func TestCollectorAdapterPersistsEveryTerminalOutcome(t *testing.T) {
	for _, tc := range []struct {
		name                          string
		environmentError, airconError bool
		cancel                        bool
		want                          store.OverallStatus
	}{
		{name: "success", want: store.OverallSuccess},
		{name: "devices partial", environmentError: true, want: store.OverallPartial},
		{name: "appliances partial", airconError: true, want: store.OverallPartial},
		{name: "error", environmentError: true, airconError: true, want: store.OverallError},
		{name: "cancelled", cancel: true, want: store.OverallCancelled},
	} {
		t.Run(tc.name, func(t *testing.T) {
			database, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "integration.sqlite3"))
			if err != nil {
				t.Fatal(err)
			}
			defer database.Close()
			readiness := fullyReady()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			adapter := adapterStub{
				environment: func(context.Context, string) (domain.EnvironmentReading, error) {
					if tc.cancel {
						cancel()
						return domain.EnvironmentReading{}, &nature.APIError{Code: nature.CodeCancelled, Detail: "cancelled"}
					}
					if tc.environmentError {
						return domain.EnvironmentReading{}, errors.New("devices failed")
					}
					value := 24.5
					return domain.EnvironmentReading{DeviceID: "fixture-device", TemperatureC: &value}, nil
				},
				aircon: func(context.Context, string) (domain.AirconReading, error) {
					if tc.airconError {
						return domain.AirconReading{}, errors.New("appliances failed")
					}
					return domain.AirconReading{ApplianceID: "fixture-aircon", PowerState: domain.PowerStateOn}, nil
				},
			}
			runner, err := collector.New(collector.Options{Adapter: adapter, Store: newCollectorStoreAdapter(database, readiness), DeviceID: "fixture-device", ApplianceID: "fixture-aircon", TargetStatus: readiness})
			if err != nil {
				t.Fatal(err)
			}
			if _, err := runner.Run(ctx); err != nil {
				t.Fatal(err)
			}
			snapshot, err := database.Status(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			if snapshot.LastRun == nil || snapshot.LastRun.OverallStatus != tc.want || snapshot.LastRun.CompletedAt == nil {
				t.Fatalf("last run = %#v", snapshot.LastRun)
			}
			if !readiness.Snapshot().Database {
				t.Fatal("successful finalization should leave database ready")
			}
		})
	}
}

func TestCollectorErrorsDoNotExposeSecretInLogDatabaseOrAPI(t *testing.T) {
	path := filepath.Join(t.TempDir(), "secret.sqlite3")
	database, err := store.Open(context.Background(), path)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	const secret = "live-secret-token-value-123456789"
	detail := "Authorization: Bearer " + secret
	adapter := adapterStub{
		environment: func(context.Context, string) (domain.EnvironmentReading, error) {
			return domain.EnvironmentReading{}, &nature.APIError{Code: nature.CodeUnauthorized, Detail: detail}
		},
		aircon: func(context.Context, string) (domain.AirconReading, error) {
			return domain.AirconReading{}, &nature.APIError{Code: nature.CodeUnauthorized, Detail: detail}
		},
	}
	readiness := fullyReady()
	runner, err := collector.New(collector.Options{Adapter: adapter, Store: newCollectorStoreAdapter(database, readiness), DeviceID: "fixture-device", ApplianceID: "fixture-aircon", TargetStatus: readiness})
	if err != nil {
		t.Fatal(err)
	}
	var logs bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logs, nil))
	if _, err := (loggedCollector{runner: runner, logger: logger}).Run(context.Background()); err != nil {
		t.Fatal(err)
	}

	raw, err := sql.Open("sqlite", "file:"+filepath.ToSlash(path)+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	defer raw.Close()
	var devicesDetail, appliancesDetail string
	if err := raw.QueryRow(`SELECT devices_error_detail, appliances_error_detail FROM collection_runs ORDER BY id DESC LIMIT 1`).Scan(&devicesDetail, &appliancesDetail); err != nil {
		t.Fatal(err)
	}
	queries := NewQueryService(QueryOptions{Store: database, DeviceID: "fixture-device", ApplianceID: "fixture-aircon", PollInterval: 5 * time.Minute, StaleAfter: 10 * time.Minute, Location: time.UTC})
	handler := httpapi.New(httpapi.Dependencies{Version: "test", Readiness: readiness, Queries: queries, Logger: logger})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/v1/status", nil))
	combined := logs.String() + devicesDetail + appliancesDetail + response.Body.String()
	if strings.Contains(combined, secret) {
		t.Fatalf("secret was exposed: %s", combined)
	}
}

func fullyReady() *Readiness {
	r := NewReadiness()
	r.SetConfiguration(true)
	r.SetDeviceTargetValid(true)
	r.SetApplianceTargetValid(true)
	r.SetDatabase(true)
	r.SetMigrations(true)
	r.SetBackupDirectory(true)
	return r
}
