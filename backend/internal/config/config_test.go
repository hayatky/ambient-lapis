package config

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func TestLoadFromDefaultsAndTokenFile(t *testing.T) {
	environment := map[string]string{
		"NATURE_REMO_TOKEN_FILE":   "/run/secrets/token",
		"NATURE_REMO_DEVICE_ID":    " device-id ",
		"NATURE_REMO_APPLIANCE_ID": " appliance-id ",
	}
	cfg, err := LoadFrom(func(key string) string { return environment[key] }, func(path string) ([]byte, error) {
		if path != "/run/secrets/token" {
			t.Fatalf("unexpected path %q", path)
		}
		return []byte(" secret-value\n"), nil
	})
	if err != nil {
		t.Fatalf("LoadFrom: %v", err)
	}
	if cfg.Token != "secret-value" || cfg.DeviceID != "device-id" || cfg.ApplianceID != "appliance-id" {
		t.Fatalf("credentials were not trimmed: %+v", cfg)
	}
	if cfg.PollInterval != 5*time.Minute || cfg.HTTPTimeout != 15*time.Second || cfg.StaleAfter != 10*time.Minute {
		t.Fatalf("unexpected durations: %+v", cfg)
	}
	if cfg.DatabasePath != defaultDatabasePath || cfg.BackupDir != defaultBackupDir || cfg.Location.String() != "Asia/Tokyo" {
		t.Fatalf("unexpected defaults: %+v", cfg)
	}
}

func TestLoadFromCustomDurations(t *testing.T) {
	environment := validEnvironment()
	environment["POLL_INTERVAL"] = "7m"
	environment["HTTP_TIMEOUT"] = "45s"
	environment["STALE_AFTER"] = "14m"
	environment["LOG_LEVEL"] = "WARN"
	cfg, err := loadMap(environment)
	if err != nil {
		t.Fatalf("LoadFrom: %v", err)
	}
	if cfg.PollInterval != 7*time.Minute || cfg.HTTPTimeout != 45*time.Second || cfg.StaleAfter != 14*time.Minute || cfg.LogLevel != "warn" {
		t.Fatalf("unexpected config: %+v", cfg)
	}
}

func TestLoadFromRejectsInvalidConfiguration(t *testing.T) {
	tests := []struct {
		name       string
		mutate     func(map[string]string)
		wantDetail string
	}{
		{"both tokens", func(env map[string]string) { env["NATURE_REMO_TOKEN_FILE"] = "token-file" }, "mutually exclusive"},
		{"no token", func(env map[string]string) { delete(env, "NATURE_REMO_TOKEN") }, "one of"},
		{"missing device", func(env map[string]string) { delete(env, "NATURE_REMO_DEVICE_ID") }, "DEVICE_ID is required"},
		{"poll too short", func(env map[string]string) { env["POLL_INTERVAL"] = "59s" }, "POLL_INTERVAL must be between"},
		{"poll too long", func(env map[string]string) { env["POLL_INTERVAL"] = "25h" }, "POLL_INTERVAL must be between"},
		{"timeout too long", func(env map[string]string) { env["HTTP_TIMEOUT"] = "61s" }, "HTTP_TIMEOUT must be between"},
		{"stale too short", func(env map[string]string) { env["STALE_AFTER"] = "9m" }, "at least twice"},
		{"log level", func(env map[string]string) { env["LOG_LEVEL"] = "trace" }, "LOG_LEVEL"},
		{"timezone", func(env map[string]string) { env["TZ"] = "Mars/Olympus" }, "TZ"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			environment := validEnvironment()
			test.mutate(environment)
			_, err := loadMap(environment)
			if err == nil || !strings.Contains(err.Error(), test.wantDetail) {
				t.Fatalf("error = %v, want detail %q", err, test.wantDetail)
			}
		})
	}
}

func TestLoadFromRejectsUnreadableOrEmptyTokenFile(t *testing.T) {
	environment := validEnvironment()
	delete(environment, "NATURE_REMO_TOKEN")
	environment["NATURE_REMO_TOKEN_FILE"] = "secret"
	_, err := LoadFrom(func(key string) string { return environment[key] }, func(string) ([]byte, error) {
		return nil, errors.New("permission denied")
	})
	if err == nil || !strings.Contains(err.Error(), "unable to read NATURE_REMO_TOKEN_FILE") {
		t.Fatalf("unexpected error: %v", err)
	}
	_, err = LoadFrom(func(key string) string { return environment[key] }, func(string) ([]byte, error) { return []byte(" \n"), nil })
	if err == nil || !strings.Contains(err.Error(), "empty token") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func validEnvironment() map[string]string {
	return map[string]string{
		"NATURE_REMO_TOKEN":        "local-token",
		"NATURE_REMO_DEVICE_ID":    "device-id",
		"NATURE_REMO_APPLIANCE_ID": "appliance-id",
	}
}

func loadMap(environment map[string]string) (Config, error) {
	return LoadFrom(func(key string) string { return environment[key] }, func(string) ([]byte, error) { return nil, errors.New("unexpected read") })
}
