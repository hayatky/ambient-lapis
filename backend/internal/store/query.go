package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math"
	"sort"
	"time"
)

const maxQueryResults = 10000

func (s *Store) Status(ctx context.Context) (StatusSnapshot, error) {
	var result StatusSnapshot
	row := s.db.QueryRowContext(ctx, `SELECT id, started_at, completed_at, overall_status,
		devices_status, devices_error_code, appliances_status, appliances_error_code,
		rate_limit_reset_at FROM collection_runs ORDER BY started_at DESC, id DESC LIMIT 1`)
	run, err := scanRun(row)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return result, err
	}
	if err == nil {
		result.LastRun = &run
	}
	if err := scanOptionalMillis(s.db.QueryRowContext(ctx, `SELECT MAX(completed_at) FROM collection_runs WHERE overall_status = 'success'`), &result.LastFullSuccessAt); err != nil {
		return result, err
	}
	if err := scanOptionalMillis(s.db.QueryRowContext(ctx, `SELECT MAX(fetched_at) FROM environment_samples`), &result.LastEnvironmentSuccessAt); err != nil {
		return result, err
	}
	if err := scanOptionalMillis(s.db.QueryRowContext(ctx, `SELECT MAX(fetched_at) FROM aircon_samples`), &result.LastAirconSuccessAt); err != nil {
		return result, err
	}
	return result, nil
}

func (s *Store) Current(ctx context.Context, deviceID, applianceID string) (CurrentSnapshot, error) {
	var result CurrentSnapshot
	env, err := queryLatestEnvironment(ctx, s.db, deviceID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return result, err
	}
	if err == nil {
		result.Environment = &env
	}
	aircon, err := queryLatestAircon(ctx, s.db, applianceID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return result, err
	}
	if err == nil {
		result.Aircon = &aircon
	}
	return result, nil
}

func (s *Store) EnvironmentSeries(ctx context.Context, query SeriesQuery) ([]EnvironmentPoint, error) {
	if !query.From.Before(query.To) {
		return nil, errors.New("from must be earlier than to")
	}
	statement := `SELECT collection_run_id, device_id, fetched_at,
		device_online, temperature_c, temperature_observed_at, humidity_pct, humidity_observed_at
		FROM environment_samples WHERE device_id = ? AND fetched_at >= ? AND fetched_at < ?
		ORDER BY fetched_at, id`
	args := []any{query.DeviceID, unixMilli(query.From), unixMilli(query.To)}
	if query.Resolution == ResolutionRaw {
		statement += " LIMIT ?"
		args = append(args, maxQueryResults+1)
	}
	rows, err := s.db.QueryContext(ctx, statement, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var samples []EnvironmentSample
	for rows.Next() {
		sample, err := scanEnvironment(rows)
		if err != nil {
			return nil, err
		}
		samples = append(samples, sample)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if query.Resolution == ResolutionRaw {
		return rawEnvironmentPoints(samples, query.StaleAfter), nil
	}
	return aggregateEnvironmentPoints(samples, query)
}

func rawEnvironmentPoints(samples []EnvironmentSample, staleAfter time.Duration) []EnvironmentPoint {
	points := make([]EnvironmentPoint, 0, len(samples))
	var previous *time.Time
	for _, sample := range samples {
		point := EnvironmentPoint{Time: sample.FetchedAt, TemperatureValue: sample.TemperatureC,
			TemperatureAt: sample.TemperatureObservedAt, HumidityValue: sample.HumidityPct,
			HumidityAt: sample.HumidityObservedAt, RemoOnlineState: onlineState(sample.Online)}
		if sampleHasValue(sample) {
			if previous != nil && sample.FetchedAt.Sub(*previous) > staleAfter {
				point.Gap = true
			}
			fetched := sample.FetchedAt
			previous = &fetched
		}
		points = append(points, point)
	}
	return points
}

func aggregateEnvironmentPoints(samples []EnvironmentSample, query SeriesQuery) ([]EnvironmentPoint, error) {
	start, step, next, err := bucketFunctions(query)
	if err != nil {
		return nil, err
	}
	var points []EnvironmentPoint
	index := 0
	var previousFetched *time.Time
	for bucketStart := start; bucketStart.Before(query.To); bucketStart = next(bucketStart) {
		bucketEnd := next(bucketStart)
		var bucket []EnvironmentSample
		for index < len(samples) && samples[index].FetchedAt.Before(bucketEnd) {
			if !samples[index].FetchedAt.Before(bucketStart) {
				bucket = append(bucket, samples[index])
			}
			index++
		}
		point := aggregateBucket(bucketStart, bucket)
		for _, sample := range bucket {
			if !sampleHasValue(sample) {
				continue
			}
			if previousFetched != nil && sample.FetchedAt.Sub(*previousFetched) > query.StaleAfter {
				point.Gap = true
			}
			fetched := sample.FetchedAt
			previousFetched = &fetched
		}
		points = append(points, point)
		if len(points) > maxQueryResults {
			return points, nil
		}
		if step > 0 && bucketStart.Add(step).Equal(bucketStart) {
			return nil, errors.New("invalid bucket step")
		}
	}
	return points, nil
}

func bucketFunctions(query SeriesQuery) (time.Time, time.Duration, func(time.Time) time.Time, error) {
	location := query.Location
	if location == nil {
		location = time.UTC
	}
	switch query.Resolution {
	case Resolution15m:
		step := 15 * time.Minute
		start := query.From.UTC().Truncate(step)
		return start, step, func(t time.Time) time.Time { return t.Add(step) }, nil
	case Resolution1h:
		step := time.Hour
		start := query.From.UTC().Truncate(step)
		return start, step, func(t time.Time) time.Time { return t.Add(step) }, nil
	case Resolution1d:
		local := query.From.In(location)
		start := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, location)
		return start, 0, func(t time.Time) time.Time { return t.In(location).AddDate(0, 0, 1) }, nil
	default:
		return time.Time{}, 0, nil, fmt.Errorf("invalid aggregate resolution %q", query.Resolution)
	}
}

func aggregateBucket(at time.Time, samples []EnvironmentSample) EnvironmentPoint {
	hasValue := false
	for _, sample := range samples {
		if sampleHasValue(sample) {
			hasValue = true
			break
		}
	}
	point := EnvironmentPoint{Time: at.UTC(), Gap: !hasValue, RemoOnlineState: aggregateOnline(samples)}
	point.Temperature = statsFor(samples, func(s EnvironmentSample) (*float64, *time.Time) { return s.TemperatureC, s.TemperatureObservedAt })
	point.Humidity = statsFor(samples, func(s EnvironmentSample) (*float64, *time.Time) { return s.HumidityPct, s.HumidityObservedAt })
	return point
}

func statsFor(samples []EnvironmentSample, value func(EnvironmentSample) (*float64, *time.Time)) ValueStats {
	var stats ValueStats
	var sum float64
	for _, sample := range samples {
		v, observed := value(sample)
		if v == nil || math.IsNaN(*v) || math.IsInf(*v, 0) {
			continue
		}
		if stats.Min == nil || *v < *stats.Min {
			copy := *v
			stats.Min = &copy
		}
		if stats.Max == nil || *v > *stats.Max {
			copy := *v
			stats.Max = &copy
		}
		sum += *v
		stats.SampleCount++
		if observed != nil && (stats.LatestObservedAt == nil || observed.After(*stats.LatestObservedAt)) {
			copy := *observed
			stats.LatestObservedAt = &copy
		}
	}
	if stats.SampleCount > 0 {
		avg := sum / float64(stats.SampleCount)
		stats.Avg = &avg
	}
	return stats
}

func (s *Store) AirconSeries(ctx context.Context, query RangeQuery) ([]AirconSegment, error) {
	if !query.From.Before(query.To) {
		return nil, errors.New("from must be earlier than to")
	}
	var samples []AirconSample
	previous, err := queryAirconBefore(ctx, s.db, query.ID, query.From)
	if err == nil {
		samples = append(samples, previous)
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT collection_run_id, appliance_id, fetched_at,
		settings_updated_at, power_state, button_raw, mode_raw, target_temperature_raw,
		temperature_unit_raw, target_temperature_c, volume_raw, direction_vertical_raw,
		direction_horizontal_raw FROM aircon_samples WHERE appliance_id = ? AND fetched_at >= ? AND fetched_at < ?
		ORDER BY fetched_at, id`, query.ID, unixMilli(query.From), unixMilli(query.To))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		sample, err := scanAircon(rows)
		if err != nil {
			return nil, err
		}
		samples = append(samples, sample)
	}
	return buildAirconSegments(samples, query.From, query.To, query.StaleAfter), rows.Err()
}

func buildAirconSegments(samples []AirconSample, from, to time.Time, staleAfter time.Duration) []AirconSegment {
	sort.SliceStable(samples, func(i, j int) bool { return samples[i].FetchedAt.Before(samples[j].FetchedAt) })
	var result []AirconSegment
	cursor := from
	for i, sample := range samples {
		start := sample.FetchedAt
		if start.Before(from) {
			start = from
		}
		if start.After(cursor) {
			result = appendSegment(result, AirconSegment{From: cursor, To: minTime(start, to), State: "gap"})
			if len(result) > maxQueryResults {
				return result
			}
		}
		end := sample.FetchedAt.Add(staleAfter)
		if i+1 < len(samples) && samples[i+1].FetchedAt.Before(end) {
			end = samples[i+1].FetchedAt
		}
		end = minTime(end, to)
		if start.Before(end) {
			result = appendSegment(result, AirconSegment{From: start, To: end, State: string(sample.PowerState), Mode: sample.ModeRaw, TargetTemperatureC: sample.TargetTemperatureC})
			cursor = end
			if len(result) > maxQueryResults {
				return result
			}
		}
	}
	if cursor.Before(to) && len(result) <= maxQueryResults {
		result = appendSegment(result, AirconSegment{From: cursor, To: to, State: "gap"})
	}
	return result
}

func appendSegment(segments []AirconSegment, next AirconSegment) []AirconSegment {
	if !next.From.Before(next.To) {
		return segments
	}
	if len(segments) > 0 {
		last := &segments[len(segments)-1]
		if last.To.Equal(next.From) && last.State == next.State && equalString(last.Mode, next.Mode) && equalFloat(last.TargetTemperatureC, next.TargetTemperatureC) {
			last.To = next.To
			return segments
		}
	}
	return append(segments, next)
}

func (s *Store) DailySummary(ctx context.Context, query RangeQuery) ([]DailySummary, error) {
	location := query.Location
	if location == nil {
		location = time.UTC
	}
	fromLocal := query.From.In(location)
	toLocal := query.To.In(location)
	start := time.Date(fromLocal.Year(), fromLocal.Month(), fromLocal.Day(), 0, 0, 0, 0, location)
	end := time.Date(toLocal.Year(), toLocal.Month(), toLocal.Day(), 0, 0, 0, 0, location)
	if !toLocal.Equal(end) {
		end = end.AddDate(0, 0, 1)
	}
	if !start.Before(end) {
		return nil, errors.New("from must be earlier than to")
	}
	rows, err := s.db.QueryContext(ctx, `SELECT collection_run_id, device_id, fetched_at,
		device_online, temperature_c, temperature_observed_at, humidity_pct, humidity_observed_at
		FROM environment_samples WHERE device_id = ? AND fetched_at >= ? AND fetched_at < ?
		ORDER BY fetched_at, id`, query.ID, unixMilli(start.Add(-query.StaleAfter)), unixMilli(end))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var samples []EnvironmentSample
	for rows.Next() {
		sample, err := scanEnvironment(rows)
		if err != nil {
			return nil, err
		}
		samples = append(samples, sample)
	}
	var summaries []DailySummary
	for day := start; day.Before(end); day = day.AddDate(0, 0, 1) {
		dayEnd := day.AddDate(0, 0, 1)
		periodStart := maxTime(day, query.From)
		periodEnd := minTime(dayEnd, query.To)
		if !periodStart.Before(periodEnd) {
			continue
		}
		var inDay []EnvironmentSample
		var coverageSamples []EnvironmentSample
		for _, sample := range samples {
			if !sample.FetchedAt.Before(periodStart) && sample.FetchedAt.Before(periodEnd) {
				inDay = append(inDay, sample)
			}
			if sample.FetchedAt.Add(query.StaleAfter).After(periodStart) && sample.FetchedAt.Before(periodEnd) {
				coverageSamples = append(coverageSamples, sample)
			}
		}
		summaries = append(summaries, DailySummary{Date: day.Format("2006-01-02"),
			Temperature: statsFor(inDay, func(s EnvironmentSample) (*float64, *time.Time) { return s.TemperatureC, s.TemperatureObservedAt }),
			Humidity:    statsFor(inDay, func(s EnvironmentSample) (*float64, *time.Time) { return s.HumidityPct, s.HumidityObservedAt }),
			GapMinutes:  gapMinutes(coverageSamples, periodStart, periodEnd, query.StaleAfter)})
		if len(summaries) > maxQueryResults {
			return nil, errors.New("result too large")
		}
	}
	return summaries, rows.Err()
}

func gapMinutes(samples []EnvironmentSample, from, to time.Time, staleAfter time.Duration) int64 {
	covered := time.Duration(0)
	cursor := from
	for _, sample := range samples {
		start := maxTime(sample.FetchedAt, from)
		end := minTime(sample.FetchedAt.Add(staleAfter), to)
		if end.Before(cursor) || end.Equal(cursor) {
			continue
		}
		if start.Before(cursor) {
			start = cursor
		}
		if start.Before(end) {
			covered += end.Sub(start)
			cursor = end
		}
	}
	missing := to.Sub(from) - covered
	if missing < 0 {
		missing = 0
	}
	return int64(math.Ceil(missing.Minutes()))
}

type scanner interface{ Scan(...any) error }

func scanRun(row scanner) (Run, error) {
	var run Run
	var started int64
	var completed, reset sql.NullInt64
	var devicesCode, appliancesCode sql.NullString
	err := row.Scan(&run.ID, &started, &completed, &run.OverallStatus, &run.DevicesStatus,
		&devicesCode, &run.AppliancesStatus, &appliancesCode, &reset)
	if err != nil {
		return run, err
	}
	run.StartedAt = fromMillis(started)
	run.CompletedAt = optionalMillis(completed)
	run.DevicesErrorCode = optionalString(devicesCode)
	run.AppliancesErrorCode = optionalString(appliancesCode)
	run.RateLimitResetAt = optionalMillis(reset)
	return run, nil
}

func scanEnvironment(row scanner) (EnvironmentSample, error) {
	var sample EnvironmentSample
	var fetched int64
	var online, temperatureAt, humidityAt sql.NullInt64
	var temperatureValue, humidityValue sql.NullFloat64
	err := row.Scan(&sample.RunID, &sample.DeviceID, &fetched, &online, &temperatureValue, &temperatureAt, &humidityValue, &humidityAt)
	if err != nil {
		return sample, err
	}
	sample.FetchedAt = fromMillis(fetched)
	sample.Online = optionalBool(online)
	sample.TemperatureC = optionalFloat(temperatureValue)
	sample.TemperatureObservedAt = optionalMillis(temperatureAt)
	sample.HumidityPct = optionalFloat(humidityValue)
	sample.HumidityObservedAt = optionalMillis(humidityAt)
	return sample, nil
}

func scanAircon(row scanner) (AirconSample, error) {
	var sample AirconSample
	var fetched int64
	var updated sql.NullInt64
	var mode, unit, volume, vertical, horizontal sql.NullString
	var rawTemp, tempC sql.NullFloat64
	err := row.Scan(&sample.RunID, &sample.ApplianceID, &fetched, &updated, &sample.PowerState,
		&sample.ButtonRaw, &mode, &rawTemp, &unit, &tempC, &volume, &vertical, &horizontal)
	if err != nil {
		return sample, err
	}
	sample.FetchedAt = fromMillis(fetched)
	sample.SettingsUpdatedAt = optionalMillis(updated)
	sample.ModeRaw = optionalString(mode)
	sample.TargetTemperatureRaw = optionalFloat(rawTemp)
	sample.TemperatureUnitRaw = optionalString(unit)
	sample.TargetTemperatureC = optionalFloat(tempC)
	sample.VolumeRaw = optionalString(volume)
	sample.DirectionVerticalRaw = optionalString(vertical)
	sample.DirectionHorizontalRaw = optionalString(horizontal)
	return sample, nil
}

func queryLatestEnvironment(ctx context.Context, db *sql.DB, id string) (EnvironmentSample, error) {
	return scanEnvironment(db.QueryRowContext(ctx, `SELECT collection_run_id, device_id, fetched_at,
		device_online, temperature_c, temperature_observed_at, humidity_pct, humidity_observed_at
		FROM environment_samples WHERE device_id = ? ORDER BY fetched_at DESC, id DESC LIMIT 1`, id))
}

func queryLatestAircon(ctx context.Context, db *sql.DB, id string) (AirconSample, error) {
	return scanAircon(db.QueryRowContext(ctx, `SELECT collection_run_id, appliance_id, fetched_at,
		settings_updated_at, power_state, button_raw, mode_raw, target_temperature_raw,
		temperature_unit_raw, target_temperature_c, volume_raw, direction_vertical_raw,
		direction_horizontal_raw FROM aircon_samples WHERE appliance_id = ? ORDER BY fetched_at DESC, id DESC LIMIT 1`, id))
}

func queryAirconBefore(ctx context.Context, db *sql.DB, id string, before time.Time) (AirconSample, error) {
	return scanAircon(db.QueryRowContext(ctx, `SELECT collection_run_id, appliance_id, fetched_at,
		settings_updated_at, power_state, button_raw, mode_raw, target_temperature_raw,
		temperature_unit_raw, target_temperature_c, volume_raw, direction_vertical_raw,
		direction_horizontal_raw FROM aircon_samples WHERE appliance_id = ? AND fetched_at < ?
		ORDER BY fetched_at DESC, id DESC LIMIT 1`, id, unixMilli(before)))
}

func scanOptionalMillis(row scanner, target **time.Time) error {
	var value sql.NullInt64
	if err := row.Scan(&value); err != nil {
		return err
	}
	*target = optionalMillis(value)
	return nil
}

func fromMillis(value int64) time.Time { return time.UnixMilli(value).UTC() }
func optionalMillis(value sql.NullInt64) *time.Time {
	if !value.Valid {
		return nil
	}
	v := fromMillis(value.Int64)
	return &v
}
func optionalString(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	v := value.String
	return &v
}
func optionalFloat(value sql.NullFloat64) *float64 {
	if !value.Valid {
		return nil
	}
	v := value.Float64
	return &v
}
func optionalBool(value sql.NullInt64) *bool {
	if !value.Valid {
		return nil
	}
	v := value.Int64 != 0
	return &v
}
func onlineState(value *bool) string {
	if value == nil {
		return "unknown"
	}
	if *value {
		return "online"
	}
	return "offline"
}
func aggregateOnline(samples []EnvironmentSample) string {
	hasOnline, hasOffline, hasUnknown := false, false, false
	for _, sample := range samples {
		if sample.Online == nil {
			hasUnknown = true
		} else if *sample.Online {
			hasOnline = true
		} else {
			hasOffline = true
		}
	}
	if hasOnline && !hasOffline && !hasUnknown {
		return "online"
	}
	if hasOffline && !hasOnline && !hasUnknown {
		return "offline"
	}
	if hasOnline || hasOffline {
		return "mixed"
	}
	return "unknown"
}
func sampleHasValue(sample EnvironmentSample) bool {
	return validFloat(sample.TemperatureC) || validFloat(sample.HumidityPct)
}
func validFloat(value *float64) bool {
	return value != nil && !math.IsNaN(*value) && !math.IsInf(*value, 0)
}
func equalString(a, b *string) bool {
	return (a == nil && b == nil) || (a != nil && b != nil && *a == *b)
}
func equalFloat(a, b *float64) bool {
	return (a == nil && b == nil) || (a != nil && b != nil && *a == *b)
}
func minTime(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}
func maxTime(a, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}
