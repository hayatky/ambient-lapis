//go:build live

package nature_test

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/hayatky/ambient-lapis/backend/internal/config"
	"github.com/hayatky/ambient-lapis/backend/internal/nature"
)

func TestLiveNatureAPIReadOnly(t *testing.T) {
	if os.Getenv("LIVE_NATURE_API") != "1" {
		t.Skip("set LIVE_NATURE_API=1 to enable the read-only live smoke test")
	}
	cfg, err := config.Load()
	if err != nil {
		t.Fatal("live Nature API configuration is incomplete")
	}
	client, err := nature.NewClient(nature.Options{
		Token: cfg.Token, Version: "live-test", Timeout: cfg.HTTPTimeout,
		RateLimitFallback: cfg.PollInterval,
		Sleep: func(context.Context, time.Duration) error {
			return errors.New("live smoke test does not retry")
		},
	})
	if err != nil {
		t.Fatal("live Nature API client initialization failed")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	environment, err := client.FetchEnvironment(ctx, cfg.DeviceID)
	if err != nil {
		t.Fatal("live devices request or normalization failed")
	}
	if environment.DeviceID == "" {
		t.Fatal("live devices response did not contain the configured target")
	}
	aircon, err := client.FetchAircon(ctx, cfg.ApplianceID)
	if err != nil {
		t.Fatal("live appliances request or normalization failed")
	}
	if aircon.ApplianceID == "" {
		t.Fatal("live appliances response did not contain the configured target")
	}
}
