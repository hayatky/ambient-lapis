package app

import (
	"bytes"
	"strings"
	"testing"
	"time"
)

func TestLoggerWritesUTCTimestamp(t *testing.T) {
	previous := time.Local
	time.Local = time.FixedZone("JST", 9*60*60)
	t.Cleanup(func() { time.Local = previous })

	var output bytes.Buffer
	NewLogger(&output, "info").Info("started", "event", "service_started")
	line := output.String()
	if !strings.Contains(line, `"timestamp":"`) || !strings.Contains(line, `Z"`) {
		t.Fatalf("timestamp is not UTC: %s", line)
	}
	if strings.Contains(line, "+09:00") {
		t.Fatalf("timestamp retained local offset: %s", line)
	}
}
