package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
)

func (s *Store) StartCollectionRun(ctx context.Context, startedAt time.Time) (int64, error) {
	var id int64
	err := s.WithWriteLock(func(db *sql.DB) error {
		result, err := db.ExecContext(ctx, `INSERT INTO collection_runs
			(started_at, overall_status, devices_status, appliances_status)
			VALUES (?, 'running', 'pending', 'pending')`, unixMilli(startedAt))
		if err != nil {
			return err
		}
		id, err = result.LastInsertId()
		return err
	})
	if err != nil {
		return 0, fmt.Errorf("start collection run: %w", err)
	}
	return id, nil
}

func (s *Store) SaveEnvironment(ctx context.Context, sample EnvironmentSample) error {
	return s.endpointTransaction(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO environment_samples
			(collection_run_id, device_id, fetched_at, device_online, temperature_c,
			temperature_observed_at, humidity_pct, humidity_observed_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, sample.RunID, sample.DeviceID,
			unixMilli(sample.FetchedAt), nullableBool(sample.Online), sample.TemperatureC,
			nullableTime(sample.TemperatureObservedAt), sample.HumidityPct,
			nullableTime(sample.HumidityObservedAt))
		if err != nil {
			return err
		}
		result, err := tx.ExecContext(ctx, `UPDATE collection_runs SET devices_status = 'success',
			devices_error_code = NULL, devices_error_detail = NULL WHERE id = ? AND overall_status = 'running'`, sample.RunID)
		if err != nil {
			return err
		}
		return requireOne(result, "running collection run")
	})
}

func (s *Store) SaveAircon(ctx context.Context, sample AirconSample) error {
	if sample.PowerState != PowerOn && sample.PowerState != PowerOff && sample.PowerState != PowerUnknown {
		return fmt.Errorf("invalid power state %q", sample.PowerState)
	}
	return s.endpointTransaction(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO aircon_samples
			(collection_run_id, appliance_id, fetched_at, settings_updated_at, power_state,
			button_raw, mode_raw, target_temperature_raw, temperature_unit_raw,
			target_temperature_c, volume_raw, direction_vertical_raw, direction_horizontal_raw)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, sample.RunID,
			sample.ApplianceID, unixMilli(sample.FetchedAt), nullableTime(sample.SettingsUpdatedAt),
			sample.PowerState, sample.ButtonRaw, sample.ModeRaw, sample.TargetTemperatureRaw,
			sample.TemperatureUnitRaw, sample.TargetTemperatureC, sample.VolumeRaw,
			sample.DirectionVerticalRaw, sample.DirectionHorizontalRaw)
		if err != nil {
			return err
		}
		result, err := tx.ExecContext(ctx, `UPDATE collection_runs SET appliances_status = 'success',
			appliances_error_code = NULL, appliances_error_detail = NULL WHERE id = ? AND overall_status = 'running'`, sample.RunID)
		if err != nil {
			return err
		}
		return requireOne(result, "running collection run")
	})
}

func (s *Store) FailDevices(ctx context.Context, runID int64, failure EndpointFailure) error {
	return s.recordFailure(ctx, runID, "devices", failure)
}

func (s *Store) FailAppliances(ctx context.Context, runID int64, failure EndpointFailure) error {
	return s.recordFailure(ctx, runID, "appliances", failure)
}

func (s *Store) recordFailure(ctx context.Context, runID int64, endpoint string, failure EndpointFailure) error {
	if endpoint != "devices" && endpoint != "appliances" {
		return errors.New("invalid endpoint")
	}
	detail := sanitizeDetail(failure.Detail)
	query := `UPDATE collection_runs SET ` + endpoint + `_status = 'error', ` + endpoint + `_error_code = ?, ` + endpoint + `_error_detail = ?, rate_limit_reset_at = COALESCE(?, rate_limit_reset_at) WHERE id = ? AND overall_status = 'running'`
	return s.WithWriteLock(func(db *sql.DB) error {
		result, err := db.ExecContext(ctx, query, nullableString(failure.Code), nullableString(detail), nullableTime(failure.RateLimitResetAt), runID)
		if err != nil {
			return err
		}
		return requireOne(result, "running collection run")
	})
}

func (s *Store) CompleteCollectionRun(ctx context.Context, runID int64, status OverallStatus, completedAt time.Time) error {
	if status != OverallSuccess && status != OverallPartial && status != OverallError && status != OverallCancelled {
		return fmt.Errorf("invalid terminal status %q", status)
	}
	return s.WithWriteLock(func(db *sql.DB) error {
		result, err := db.ExecContext(ctx, `UPDATE collection_runs SET overall_status = ?, completed_at = ?,
			devices_status = CASE WHEN ? = 'cancelled' AND devices_status = 'pending' THEN 'skipped' ELSE devices_status END,
			appliances_status = CASE WHEN ? = 'cancelled' AND appliances_status = 'pending' THEN 'skipped' ELSE appliances_status END
			WHERE id = ? AND overall_status = 'running' AND started_at <= ?`, status,
			unixMilli(completedAt), status, status, runID, unixMilli(completedAt))
		if err != nil {
			return err
		}
		return requireOne(result, "running collection run")
	})
}

// FinalizeCollectionRun atomically persists both endpoint outcomes and the
// terminal run state. Samples remain independently committed by SaveEnvironment
// and SaveAircon, so a failure on one endpoint cannot erase the other sample.
func (s *Store) FinalizeCollectionRun(ctx context.Context, value RunFinalization) error {
	if !validOverallStatus(value.OverallStatus) {
		return fmt.Errorf("invalid terminal status %q", value.OverallStatus)
	}
	if !validEndpointStatus(value.Devices.Status) || !validEndpointStatus(value.Appliances.Status) {
		return errors.New("invalid endpoint status")
	}
	return s.endpointTransaction(ctx, func(tx *sql.Tx) error {
		result, err := tx.ExecContext(ctx, `UPDATE collection_runs SET
			overall_status = ?, completed_at = ?,
			devices_status = ?, devices_error_code = ?, devices_error_detail = ?,
			appliances_status = ?, appliances_error_code = ?, appliances_error_detail = ?,
			rate_limit_reset_at = ?
			WHERE id = ? AND overall_status = 'running' AND started_at <= ?`,
			value.OverallStatus, unixMilli(value.CompletedAt),
			value.Devices.Status, nullableString(value.Devices.ErrorCode), nullableString(sanitizeDetail(value.Devices.ErrorDetail)),
			value.Appliances.Status, nullableString(value.Appliances.ErrorCode), nullableString(sanitizeDetail(value.Appliances.ErrorDetail)),
			nullableTime(value.RateLimitResetAt), value.RunID, unixMilli(value.CompletedAt))
		if err != nil {
			return err
		}
		return requireOne(result, "running collection run")
	})
}

func (s *Store) CancelRunning(ctx context.Context, completedAt time.Time) (int64, error) {
	var affected int64
	err := s.WithWriteLock(func(db *sql.DB) error {
		result, err := db.ExecContext(ctx, `UPDATE collection_runs SET overall_status = 'cancelled',
			completed_at = CASE WHEN started_at > ? THEN started_at ELSE ? END,
			devices_status = CASE WHEN devices_status = 'pending' THEN 'skipped' ELSE devices_status END,
			appliances_status = CASE WHEN appliances_status = 'pending' THEN 'skipped' ELSE appliances_status END
			WHERE overall_status = 'running'`, unixMilli(completedAt), unixMilli(completedAt))
		if err != nil {
			return err
		}
		affected, err = result.RowsAffected()
		return err
	})
	return affected, err
}

func (s *Store) endpointTransaction(ctx context.Context, fn func(*sql.Tx) error) error {
	return s.WithWriteLock(func(db *sql.DB) error {
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		defer tx.Rollback()
		if err := fn(tx); err != nil {
			return err
		}
		return tx.Commit()
	})
}

func requireOne(result sql.Result, subject string) error {
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n != 1 {
		return fmt.Errorf("%s not found", subject)
	}
	return nil
}

var (
	authorizationPattern = regexp.MustCompile(`(?i)authorization\s*:\s*(?:bearer\s+)?[^\s,;]+`)
	bearerPattern        = regexp.MustCompile(`(?i)\bbearer\s+[a-z0-9._~+/=-]{8,}`)
	tokenPattern         = regexp.MustCompile(`(?i)(token(?:[_ -]?(?:value|secret))?\s*[=:]\s*)[^\s,;]+`)
)

func sanitizeDetail(value string) string {
	value = authorizationPattern.ReplaceAllString(value, "Authorization: [REDACTED]")
	value = bearerPattern.ReplaceAllString(value, "Bearer [REDACTED]")
	value = tokenPattern.ReplaceAllString(value, `${1}[REDACTED]`)
	value = strings.Map(func(r rune) rune {
		if r < 0x20 && r != '\t' && r != '\n' {
			return -1
		}
		return r
	}, value)
	runes := []rune(value)
	if len(runes) > 2048 {
		value = string(runes[:2048])
	}
	return value
}

func validOverallStatus(status OverallStatus) bool {
	return status == OverallSuccess || status == OverallPartial || status == OverallError || status == OverallCancelled
}

func validEndpointStatus(status EndpointStatus) bool {
	return status == EndpointSuccess || status == EndpointError || status == EndpointSkipped
}

func unixMilli(value time.Time) int64 { return value.UTC().UnixMilli() }

func nullableTime(value *time.Time) any {
	if value == nil {
		return nil
	}
	return unixMilli(*value)
}

func nullableBool(value *bool) any {
	if value == nil {
		return nil
	}
	if *value {
		return 1
	}
	return 0
}

func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}
