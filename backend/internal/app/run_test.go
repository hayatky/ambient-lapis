package app

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/hayatky/ambient-lapis/backend/internal/nature"
)

type repairerStub struct{ err error }

func (r repairerStub) CancelRunning(context.Context, time.Time) (int64, error) { return 0, r.err }

func TestRepairFailurePreventsBackgroundStartup(t *testing.T) {
	readiness := fullyReady()
	logger := slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil))
	if repairInterruptedRuns(context.Background(), repairerStub{err: errors.New("write failed")}, readiness, logger, time.Now()) {
		t.Fatal("repair failure must not permit scheduler or backup startup")
	}
	if readiness.Snapshot().Database {
		t.Fatal("database should be unready")
	}
	if !repairInterruptedRuns(context.Background(), repairerStub{}, readiness, logger, time.Now()) {
		t.Fatal("successful repair should permit startup")
	}
}

func TestNatureEventsUseFixedStructuredAttributes(t *testing.T) {
	var output bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&output, nil))
	natureEventLogger(logger)(nature.Event{Name: "upstream_retry", Attempt: 2, Delay: 5 * time.Second, Code: "upstream_error"})
	text := output.String()
	for _, want := range []string{`"event":"upstream_retry"`, `"attempt":2`, `"delayMs":5000`, `"code":"upstream_error"`} {
		if !strings.Contains(text, want) {
			t.Fatalf("log %q missing %q", text, want)
		}
	}
}
