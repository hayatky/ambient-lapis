package config

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"time"
)

const (
	defaultDatabasePath = "/data/ambient-lapis.sqlite3"
	defaultBackupDir    = "/backups"
	defaultPollInterval = 5 * time.Minute
	defaultHTTPTimeout  = 15 * time.Second
	defaultListenAddr   = ":8080"
	defaultLogLevel     = "info"
	defaultTimezone     = "Asia/Tokyo"
)

type Config struct {
	Token       string
	DeviceID    string
	ApplianceID string

	DatabasePath string
	BackupDir    string
	PollInterval time.Duration
	HTTPTimeout  time.Duration
	StaleAfter   time.Duration
	ListenAddr   string
	LogLevel     string
	Timezone     string
	Location     *time.Location
}

type Getenv func(string) string
type ReadFile func(string) ([]byte, error)

func Load() (Config, error) {
	return LoadFrom(os.Getenv, os.ReadFile)
}

func LoadFrom(getenv Getenv, readFile ReadFile) (Config, error) {
	var cfg Config
	var problems []error

	tokenFile := strings.TrimSpace(getenv("NATURE_REMO_TOKEN_FILE"))
	directToken := strings.TrimSpace(getenv("NATURE_REMO_TOKEN"))
	switch {
	case tokenFile != "" && directToken != "":
		problems = append(problems, errors.New("NATURE_REMO_TOKEN_FILE and NATURE_REMO_TOKEN are mutually exclusive"))
	case tokenFile == "" && directToken == "":
		problems = append(problems, errors.New("one of NATURE_REMO_TOKEN_FILE or NATURE_REMO_TOKEN is required"))
	case tokenFile != "":
		contents, err := readFile(tokenFile)
		if err != nil {
			problems = append(problems, errors.New("unable to read NATURE_REMO_TOKEN_FILE"))
		} else {
			cfg.Token = strings.TrimSpace(string(contents))
			if cfg.Token == "" {
				problems = append(problems, errors.New("NATURE_REMO_TOKEN_FILE contains an empty token"))
			}
		}
	default:
		cfg.Token = directToken
	}

	cfg.DeviceID = strings.TrimSpace(getenv("NATURE_REMO_DEVICE_ID"))
	if cfg.DeviceID == "" {
		problems = append(problems, errors.New("NATURE_REMO_DEVICE_ID is required"))
	}
	cfg.ApplianceID = strings.TrimSpace(getenv("NATURE_REMO_APPLIANCE_ID"))
	if cfg.ApplianceID == "" {
		problems = append(problems, errors.New("NATURE_REMO_APPLIANCE_ID is required"))
	}

	cfg.DatabasePath = valueOrDefault(getenv("DATABASE_PATH"), defaultDatabasePath)
	cfg.BackupDir = valueOrDefault(getenv("BACKUP_DIR"), defaultBackupDir)
	cfg.ListenAddr = valueOrDefault(getenv("LISTEN_ADDR"), defaultListenAddr)
	if cfg.DatabasePath == "" || cfg.BackupDir == "" || cfg.ListenAddr == "" {
		problems = append(problems, errors.New("DATABASE_PATH, BACKUP_DIR, and LISTEN_ADDR must not be empty"))
	}

	cfg.PollInterval = parseDuration(getenv, "POLL_INTERVAL", defaultPollInterval, time.Minute, 24*time.Hour, &problems)
	cfg.HTTPTimeout = parseDuration(getenv, "HTTP_TIMEOUT", defaultHTTPTimeout, time.Nanosecond, time.Minute, &problems)

	staleRaw := strings.TrimSpace(getenv("STALE_AFTER"))
	if staleRaw == "" {
		cfg.StaleAfter = max(10*time.Minute, 2*cfg.PollInterval)
	} else {
		stale, err := time.ParseDuration(staleRaw)
		if err != nil {
			problems = append(problems, fmt.Errorf("STALE_AFTER: %w", err))
		} else if stale < 2*cfg.PollInterval {
			problems = append(problems, errors.New("STALE_AFTER must be at least twice POLL_INTERVAL"))
		} else {
			cfg.StaleAfter = stale
		}
	}

	cfg.LogLevel = strings.ToLower(valueOrDefault(getenv("LOG_LEVEL"), defaultLogLevel))
	switch cfg.LogLevel {
	case "debug", "info", "warn", "error":
	default:
		problems = append(problems, errors.New("LOG_LEVEL must be debug, info, warn, or error"))
	}

	cfg.Timezone = valueOrDefault(getenv("TZ"), defaultTimezone)
	location, err := time.LoadLocation(cfg.Timezone)
	if err != nil {
		problems = append(problems, fmt.Errorf("TZ: %w", err))
	} else {
		cfg.Location = location
	}

	return cfg, errors.Join(problems...)
}

func valueOrDefault(value, fallback string) string {
	if value = strings.TrimSpace(value); value != "" {
		return value
	}
	return fallback
}

func parseDuration(getenv Getenv, name string, fallback, minimum, maximum time.Duration, problems *[]error) time.Duration {
	raw := strings.TrimSpace(getenv(name))
	if raw == "" {
		return fallback
	}
	value, err := time.ParseDuration(raw)
	if err != nil {
		*problems = append(*problems, fmt.Errorf("%s: %w", name, err))
		return fallback
	}
	if value < minimum || value > maximum {
		*problems = append(*problems, fmt.Errorf("%s must be between %s and %s", name, minimum, maximum))
	}
	return value
}
