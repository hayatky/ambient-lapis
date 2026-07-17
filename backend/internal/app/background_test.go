package app

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"testing"
	"time"

	"github.com/hayatky/ambient-lapis/backend/internal/backup"
)

type backupRunnerStub struct{ hasCalls, createCalls int }

func (s *backupRunnerStub) HasDaily(time.Time) (bool, error) { s.hasCalls++; return false, nil }
func (s *backupRunnerStub) Create(context.Context, time.Time) (backup.Result, error) {
	s.createCalls++
	return backup.Result{}, nil
}

func TestBackupStartupScheduleBoundary(t *testing.T) {
	location, err := time.LoadLocation("Asia/Tokyo")
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name                string
		hour, minute        int
		wantHas, wantCreate int
		wantWait            time.Duration
	}{
		{name: "03:14 waits", hour: 3, minute: 14, wantWait: time.Minute},
		{name: "03:15 runs", hour: 3, minute: 15, wantHas: 1, wantCreate: 1, wantWait: 24 * time.Hour},
		{name: "03:16 catches up", hour: 3, minute: 16, wantHas: 1, wantCreate: 1, wantWait: 23*time.Hour + 59*time.Minute},
	} {
		t.Run(tc.name, func(t *testing.T) {
			current := time.Date(2026, 7, 18, tc.hour, tc.minute, 0, 0, location)
			runner := &backupRunnerStub{}
			var waited time.Duration
			wait := func(_ context.Context, delay time.Duration) error { waited = delay; return context.Canceled }
			logger := slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil))
			runBackupSchedule(context.Background(), runner, location, logger, fullyReady(), func() time.Time { return current }, wait)
			if runner.hasCalls != tc.wantHas || runner.createCalls != tc.wantCreate || waited != tc.wantWait {
				t.Fatalf("has=%d create=%d wait=%s", runner.hasCalls, runner.createCalls, waited)
			}
		})
	}
}

type recoveringBackupRunner struct {
	createCalls int
}

func (s *recoveringBackupRunner) HasDaily(time.Time) (bool, error) { return false, nil }
func (s *recoveringBackupRunner) Create(context.Context, time.Time) (backup.Result, error) {
	s.createCalls++
	if s.createCalls == 1 {
		return backup.Result{}, errors.New("backup write failed")
	}
	return backup.Result{}, nil
}

func TestBackupReadinessDropsOnFailureAndRecovers(t *testing.T) {
	location, err := time.LoadLocation("Asia/Tokyo")
	if err != nil {
		t.Fatal(err)
	}
	current := time.Date(2026, 7, 18, 3, 16, 0, 0, location)
	readiness := fullyReady()
	runner := &recoveringBackupRunner{}
	waits := 0
	wait := func(_ context.Context, delay time.Duration) error {
		waits++
		if waits == 1 {
			if readiness.Snapshot().Ready() {
				t.Fatal("backup failure must make /readyz unavailable")
			}
			current = current.Add(24 * time.Hour)
			return nil
		}
		return context.Canceled
	}
	logger := slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil))
	runBackupSchedule(context.Background(), runner, location, logger, readiness, func() time.Time { return current }, wait)
	if !readiness.Snapshot().Ready() {
		t.Fatal("successful backup must recover /readyz")
	}
}
