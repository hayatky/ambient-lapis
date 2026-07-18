package store

import (
	"context"
	"database/sql"
	"math"
	"path/filepath"
	"strings"
	"testing"
	"time"
	"unicode/utf8"
)

func openTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(context.Background(), filepath.Join(t.TempDir(), "test.sqlite3"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestOpenAppliesMigrationsAndPragmas(t *testing.T) {
	s := openTestStore(t)
	var journal string
	var sync, timeout, foreign int
	if err := s.db.QueryRow("PRAGMA journal_mode").Scan(&journal); err != nil {
		t.Fatal(err)
	}
	if err := s.db.QueryRow("PRAGMA synchronous").Scan(&sync); err != nil {
		t.Fatal(err)
	}
	if err := s.db.QueryRow("PRAGMA busy_timeout").Scan(&timeout); err != nil {
		t.Fatal(err)
	}
	if err := s.db.QueryRow("PRAGMA foreign_keys").Scan(&foreign); err != nil {
		t.Fatal(err)
	}
	if journal != "wal" || sync != 1 || timeout != 5000 || foreign != 1 {
		t.Fatalf("unexpected pragmas: %q %d %d %d", journal, sync, timeout, foreign)
	}
	var migrations int
	if err := s.db.QueryRow("SELECT COUNT(*) FROM schema_migrations").Scan(&migrations); err != nil || migrations != 1 {
		t.Fatalf("migration count=%d err=%v", migrations, err)
	}
}

func TestPragmasApplyToEveryPooledConnection(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	var connections []*sql.Conn
	defer func() {
		for _, connection := range connections {
			connection.Close()
		}
	}()
	for i := 0; i < 4; i++ {
		connection, err := s.db.Conn(ctx)
		if err != nil {
			t.Fatal(err)
		}
		connections = append(connections, connection)
		var timeout, foreign int
		if err := connection.QueryRowContext(ctx, "PRAGMA busy_timeout").Scan(&timeout); err != nil {
			t.Fatal(err)
		}
		if err := connection.QueryRowContext(ctx, "PRAGMA foreign_keys").Scan(&foreign); err != nil {
			t.Fatal(err)
		}
		var synchronous int
		if err := connection.QueryRowContext(ctx, "PRAGMA synchronous").Scan(&synchronous); err != nil {
			t.Fatal(err)
		}
		if timeout != 5000 || foreign != 1 || synchronous != 1 {
			t.Fatalf("connection %d pragmas: timeout=%d foreign=%d synchronous=%d", i, timeout, foreign, synchronous)
		}
	}
}

func TestWALAllowsReadDuringUncommittedWrite(t *testing.T) {
	s := openTestStore(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	writer, err := s.db.Conn(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer writer.Close()
	tx, err := writer.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `INSERT INTO collection_runs
		(started_at, overall_status, devices_status, appliances_status)
		VALUES (1, 'running', 'pending', 'pending')`); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM collection_runs").Scan(&count); err != nil {
		t.Fatalf("WAL reader blocked by writer: %v", err)
	}
	if count != 0 {
		t.Fatalf("reader observed uncommitted row: %d", count)
	}
}

func TestOpenRejectsMigrationChecksumMismatch(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.sqlite3")
	s, err := Open(context.Background(), path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`UPDATE schema_migrations SET checksum = 'tampered' WHERE version = '0001_initial.sql'`); err != nil {
		t.Fatal(err)
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	if reopened, err := Open(context.Background(), path); err == nil {
		reopened.Close()
		t.Fatal("expected checksum mismatch")
	}
}

func TestMigrationBatchRollsBackOnFailure(t *testing.T) {
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "rollback.sqlite3")))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	migrations := []migrationSource{
		{version: "0001.sql", checksum: "one", body: `CREATE TABLE schema_migrations(version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL); CREATE TABLE should_rollback(id INTEGER);`},
		{version: "0002.sql", checksum: "two", body: `THIS IS NOT SQL`},
	}
	if err := applyPendingMigrations(context.Background(), db, migrations, map[string]string{}); err == nil {
		t.Fatal("expected migration failure")
	}
	if exists, err := tableExists(context.Background(), db, "should_rollback"); err != nil || exists {
		t.Fatalf("failed migration was not rolled back: exists=%v err=%v", exists, err)
	}
}

func TestCollectionPartialSuccessAndRecovery(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	started := time.Date(2026, 7, 18, 1, 0, 0, 0, time.UTC)
	runID, err := s.StartCollectionRun(ctx, started)
	if err != nil {
		t.Fatal(err)
	}
	online, temperature := true, 26.4
	observed := started.Add(-time.Minute)
	if err := s.SaveEnvironment(ctx, EnvironmentSample{RunID: runID, DeviceID: "device-test", FetchedAt: started.Add(time.Second), Online: &online, TemperatureC: &temperature, TemperatureObservedAt: &observed}); err != nil {
		t.Fatal(err)
	}
	if err := s.FailAppliances(ctx, runID, EndpointFailure{Code: "timeout", Detail: "upstream timeout"}); err != nil {
		t.Fatal(err)
	}
	if err := s.CompleteCollectionRun(ctx, runID, OverallPartial, started.Add(2*time.Second)); err != nil {
		t.Fatal(err)
	}

	status, err := s.Status(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if status.LastRun == nil || status.LastRun.OverallStatus != OverallPartial || status.LastRun.DevicesStatus != EndpointSuccess || status.LastRun.AppliancesStatus != EndpointError {
		t.Fatalf("unexpected status: %#v", status.LastRun)
	}
	current, err := s.Current(ctx, "device-test", "aircon-test")
	if err != nil {
		t.Fatal(err)
	}
	if current.Environment == nil || current.Aircon != nil || current.Environment.HumidityPct != nil {
		t.Fatalf("partial success was not preserved: %#v", current)
	}

	abandoned, err := s.StartCollectionRun(ctx, started.Add(time.Hour))
	if err != nil || abandoned == 0 {
		t.Fatal(err)
	}
	if n, err := s.CancelRunning(ctx, started.Add(2*time.Hour)); err != nil || n != 1 {
		t.Fatalf("cancelled=%d err=%v", n, err)
	}
}

func TestSaveRejectsInvalidStateAndRollsBack(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	now := time.Now().UTC()
	runID, err := s.StartCollectionRun(ctx, now)
	if err != nil {
		t.Fatal(err)
	}
	err = s.SaveAircon(ctx, AirconSample{RunID: runID, ApplianceID: "ac", FetchedAt: now, PowerState: "invalid"})
	if err == nil {
		t.Fatal("expected invalid state error")
	}
	var count int
	if err := s.db.QueryRow("SELECT COUNT(*) FROM aircon_samples").Scan(&count); err != nil || count != 0 {
		t.Fatalf("count=%d err=%v", count, err)
	}
}

func TestCompleteCancelledMarksPendingEndpointsSkipped(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	now := time.Date(2026, 7, 18, 0, 0, 0, 0, time.UTC)
	runID, err := s.StartCollectionRun(ctx, now)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.CompleteCollectionRun(ctx, runID, OverallCancelled, now.Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	var devices, appliances string
	if err := s.db.QueryRow(`SELECT devices_status, appliances_status FROM collection_runs WHERE id = ?`, runID).Scan(&devices, &appliances); err != nil {
		t.Fatal(err)
	}
	if devices != "skipped" || appliances != "skipped" {
		t.Fatalf("devices=%q appliances=%q", devices, appliances)
	}
}

func TestFinalizeCollectionRunAtomicallyPersistsOutcomesAndRedactsSecrets(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	now := time.Date(2026, 7, 18, 0, 0, 0, 0, time.UTC)
	runID, err := s.StartCollectionRun(ctx, now)
	if err != nil {
		t.Fatal(err)
	}
	reset := now.Add(5 * time.Minute)
	secret := "Authorization: " + "Bearer " + "abcdefghijklmnopqrstuvwxyz token_secret=another-secret"
	err = s.FinalizeCollectionRun(ctx, RunFinalization{RunID: runID, CompletedAt: now.Add(time.Second), OverallStatus: OverallError,
		Devices:    EndpointFinalization{Status: EndpointError, ErrorCode: "network_error", ErrorDetail: secret},
		Appliances: EndpointFinalization{Status: EndpointError, ErrorCode: "timeout", ErrorDetail: secret}, RateLimitResetAt: &reset})
	if err != nil {
		t.Fatal(err)
	}
	var overall, devices, appliances, deviceDetail, applianceDetail string
	var resetMillis int64
	if err := s.db.QueryRow(`SELECT overall_status, devices_status, appliances_status,
		devices_error_detail, appliances_error_detail, rate_limit_reset_at FROM collection_runs WHERE id = ?`, runID).
		Scan(&overall, &devices, &appliances, &deviceDetail, &applianceDetail, &resetMillis); err != nil {
		t.Fatal(err)
	}
	if overall != "error" || devices != "error" || appliances != "error" || resetMillis != reset.UnixMilli() {
		t.Fatalf("unexpected finalization: %s %s %s %d", overall, devices, appliances, resetMillis)
	}
	for _, detail := range []string{deviceDetail, applianceDetail} {
		if detail != "Authorization: [REDACTED] token_secret=[REDACTED]" {
			t.Fatalf("secret was not redacted: %q", detail)
		}
	}
	long := strings.Repeat("界", 3000)
	if got := sanitizeDetail(long); len([]rune(got)) != 2048 || !utf8.ValidString(got) {
		t.Fatalf("truncate is not UTF-8 safe: runes=%d valid=%v", len([]rune(got)), utf8.ValidString(got))
	}
}

func TestFinalizeCollectionRunRollsBackInvalidCompletion(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	now := time.Date(2026, 7, 18, 0, 0, 0, 0, time.UTC)
	runID, err := s.StartCollectionRun(ctx, now)
	if err != nil {
		t.Fatal(err)
	}
	err = s.FinalizeCollectionRun(ctx, RunFinalization{RunID: runID, CompletedAt: now.Add(-time.Second), OverallStatus: OverallError,
		Devices:    EndpointFinalization{Status: EndpointError, ErrorCode: "network_error"},
		Appliances: EndpointFinalization{Status: EndpointError, ErrorCode: "timeout"}})
	if err == nil {
		t.Fatal("expected completed_at constraint failure")
	}
	var overall, devices, appliances string
	if err := s.db.QueryRow(`SELECT overall_status, devices_status, appliances_status FROM collection_runs WHERE id = ?`, runID).Scan(&overall, &devices, &appliances); err != nil {
		t.Fatal(err)
	}
	if overall != "running" || devices != "pending" || appliances != "pending" {
		t.Fatalf("failed finalization partially updated row: %s %s %s", overall, devices, appliances)
	}
}

func TestEnvironmentSeriesRawAndBuckets(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	base := time.Date(2026, 7, 18, 0, 0, 0, 0, time.UTC)
	values := []struct {
		offset time.Duration
		temp   float64
		online *bool
		obsAge time.Duration
	}{{time.Minute, 20, boolPtr(true), time.Minute}, {6 * time.Minute, 22, boolPtr(false), time.Minute}, {31 * time.Minute, 24, nil, 20 * time.Minute}}
	for _, value := range values {
		run, err := s.StartCollectionRun(ctx, base.Add(value.offset))
		if err != nil {
			t.Fatal(err)
		}
		observed := base.Add(value.offset - value.obsAge)
		if err := s.SaveEnvironment(ctx, EnvironmentSample{RunID: run, DeviceID: "device", FetchedAt: base.Add(value.offset), Online: value.online, TemperatureC: &value.temp, TemperatureObservedAt: &observed}); err != nil {
			t.Fatal(err)
		}
	}
	raw, err := s.EnvironmentSeries(ctx, SeriesQuery{DeviceID: "device", From: base, To: base.Add(time.Hour), Resolution: ResolutionRaw, StaleAfter: 10 * time.Minute})
	if err != nil {
		t.Fatal(err)
	}
	if len(raw) != 3 || !raw[2].Gap || raw[1].RemoOnlineState != "offline" {
		t.Fatalf("unexpected raw points: %#v", raw)
	}
	buckets, err := s.EnvironmentSeries(ctx, SeriesQuery{DeviceID: "device", From: base, To: base.Add(time.Hour), Resolution: Resolution15m, StaleAfter: 10 * time.Minute})
	if err != nil {
		t.Fatal(err)
	}
	if len(buckets) != 4 || buckets[0].Temperature.SampleCount != 2 || math.Abs(*buckets[0].Temperature.Avg-21) > 0.001 || buckets[0].RemoOnlineState != "mixed" || !buckets[1].Gap {
		t.Fatalf("unexpected buckets: %#v", buckets)
	}
}

func TestEnvironmentSeriesKeepsUnchangedSuccessfulSamplesWithoutGap(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	base := time.Date(2026, 7, 18, 0, 0, 0, 0, time.UTC)
	temperature := 26.2
	humidity := 58.0
	observed := base
	for i := 0; i < 3; i++ {
		fetched := base.Add(time.Duration(i*5) * time.Minute)
		run, err := s.StartCollectionRun(ctx, fetched)
		if err != nil {
			t.Fatal(err)
		}
		if err := s.SaveEnvironment(ctx, EnvironmentSample{RunID: run, DeviceID: "device", FetchedAt: fetched,
			TemperatureC: &temperature, TemperatureObservedAt: &observed,
			HumidityPct: &humidity, HumidityObservedAt: &observed}); err != nil {
			t.Fatal(err)
		}
	}
	points, err := s.EnvironmentSeries(ctx, SeriesQuery{DeviceID: "device", From: base,
		To: base.Add(15 * time.Minute), Resolution: ResolutionRaw, StaleAfter: 10 * time.Minute})
	if err != nil || len(points) != 3 {
		t.Fatalf("points=%#v err=%v", points, err)
	}
	for _, point := range points {
		if point.Gap || point.TemperatureAt == nil || !point.TemperatureAt.Equal(observed) {
			t.Fatalf("unchanged successful sample was not preserved normally: %#v", point)
		}
	}
}

func TestRawGapContinuityIgnoresNullOnlySamples(t *testing.T) {
	base := time.Date(2026, 7, 18, 0, 0, 0, 0, time.UTC)
	value := 20.0
	points := rawEnvironmentPoints([]EnvironmentSample{
		{FetchedAt: base, TemperatureC: &value},
		{FetchedAt: base.Add(8 * time.Minute)},
		{FetchedAt: base.Add(12 * time.Minute), TemperatureC: &value},
	}, 10*time.Minute)
	if len(points) != 3 || points[1].Gap || !points[2].Gap {
		t.Fatalf("null-only sample incorrectly maintained continuity: %#v", points)
	}
}

func TestAggregateGapContinuityIgnoresNullOnlySamples(t *testing.T) {
	base := time.Date(2026, 7, 18, 0, 0, 0, 0, time.UTC)
	value := 20.0
	points, err := aggregateEnvironmentPoints([]EnvironmentSample{
		{FetchedAt: base.Add(time.Minute), TemperatureC: &value},
		{FetchedAt: base.Add(8 * time.Minute)},
		{FetchedAt: base.Add(12 * time.Minute), HumidityPct: &value},
	}, SeriesQuery{From: base, To: base.Add(15 * time.Minute), Resolution: Resolution15m, StaleAfter: 10 * time.Minute})
	if err != nil || len(points) != 1 || !points[0].Gap {
		t.Fatalf("null-only sample incorrectly maintained aggregate continuity: %#v err=%v", points, err)
	}
}

func TestAggregateBucketWithOnlyNullValuesIsGap(t *testing.T) {
	base := time.Date(2026, 7, 18, 0, 0, 0, 0, time.UTC)
	points, err := aggregateEnvironmentPoints([]EnvironmentSample{{FetchedAt: base.Add(time.Minute)}},
		SeriesQuery{From: base, To: base.Add(15 * time.Minute), Resolution: Resolution15m, StaleAfter: 10 * time.Minute})
	if err != nil || len(points) != 1 || !points[0].Gap {
		t.Fatalf("null-only bucket must be a gap: %#v err=%v", points, err)
	}
}

func TestAggregateAndAirconDoNotLimitInputSamples(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	base := time.Date(2026, 7, 18, 0, 0, 0, 0, time.UTC)
	if _, err := s.db.ExecContext(ctx, `WITH RECURSIVE seq(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM seq WHERE x < 10001)
		INSERT INTO collection_runs(id, started_at, completed_at, overall_status, devices_status, appliances_status)
		SELECT x, ? + x, ? + x, 'success', 'success', 'success' FROM seq`, base.UnixMilli(), base.UnixMilli()); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.ExecContext(ctx, `INSERT INTO environment_samples(collection_run_id, device_id, fetched_at, temperature_c)
		SELECT id, 'bulk-device', started_at, 20 FROM collection_runs`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.ExecContext(ctx, `INSERT INTO aircon_samples(collection_run_id, appliance_id, fetched_at, power_state, button_raw, mode_raw)
		SELECT id, 'bulk-aircon', started_at, 'on', '', 'cool' FROM collection_runs`); err != nil {
		t.Fatal(err)
	}
	points, err := s.EnvironmentSeries(ctx, SeriesQuery{DeviceID: "bulk-device", From: base, To: base.Add(15 * time.Minute), Resolution: Resolution15m, StaleAfter: time.Minute})
	if err != nil || len(points) != 1 || points[0].Temperature.SampleCount != 10001 {
		t.Fatalf("aggregate input was limited: points=%d count=%d err=%v", len(points), points[0].Temperature.SampleCount, err)
	}
	raw, err := s.EnvironmentSeries(ctx, SeriesQuery{DeviceID: "bulk-device", From: base, To: base.Add(15 * time.Minute), Resolution: ResolutionRaw, StaleAfter: time.Minute})
	if err != nil || len(raw) != maxQueryResults+1 {
		t.Fatalf("raw boundary=%d err=%v", len(raw), err)
	}
	segments, err := s.AirconSeries(ctx, RangeQuery{ID: "bulk-aircon", From: base, To: base.Add(15 * time.Minute), StaleAfter: time.Minute})
	if err != nil || len(segments) != 3 || segments[1].State != "on" {
		t.Fatalf("aircon input was limited: segments=%d err=%v", len(segments), err)
	}
}

func TestGeneratedResultCapsAtOneOverPublicLimit(t *testing.T) {
	base := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
	points, err := aggregateEnvironmentPoints(nil, SeriesQuery{From: base, To: base.Add((maxQueryResults + 2) * 15 * time.Minute), Resolution: Resolution15m, StaleAfter: time.Minute})
	if err != nil || len(points) != maxQueryResults+1 {
		t.Fatalf("aggregate points=%d err=%v", len(points), err)
	}
	modeA, modeB := "a", "b"
	samples := make([]AirconSample, 0, maxQueryResults+2)
	for i := 0; i < maxQueryResults+2; i++ {
		mode := &modeA
		if i%2 == 1 {
			mode = &modeB
		}
		samples = append(samples, AirconSample{FetchedAt: base.Add(time.Duration(i) * time.Second), PowerState: PowerOn, ModeRaw: mode})
	}
	segments := buildAirconSegments(samples, base, base.Add(time.Duration(maxQueryResults+3)*time.Second), time.Second)
	if len(segments) != maxQueryResults+1 {
		t.Fatalf("aircon segments=%d", len(segments))
	}
}

func TestAirconSegmentsSplitSettingsAndGap(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	base := time.Date(2026, 7, 18, 0, 0, 0, 0, time.UTC)
	insertAircon := func(at time.Time, state PowerState, mode string, temperature float64) {
		run, err := s.StartCollectionRun(ctx, at)
		if err != nil {
			t.Fatal(err)
		}
		if err := s.SaveAircon(ctx, AirconSample{RunID: run, ApplianceID: "ac", FetchedAt: at, PowerState: state, ButtonRaw: "", ModeRaw: &mode, TargetTemperatureC: &temperature}); err != nil {
			t.Fatal(err)
		}
	}
	insertAircon(base.Add(-5*time.Minute), PowerOn, "cool", 26)
	insertAircon(base.Add(5*time.Minute), PowerOn, "cool", 25)
	insertAircon(base.Add(30*time.Minute), PowerOff, "cool", 25)
	segments, err := s.AirconSeries(ctx, RangeQuery{ID: "ac", From: base, To: base.Add(45 * time.Minute), StaleAfter: 10 * time.Minute})
	if err != nil {
		t.Fatal(err)
	}
	if len(segments) != 5 || segments[0].State != "on" || segments[1].State != "on" || segments[2].State != "gap" || segments[3].State != "off" || segments[4].State != "gap" {
		t.Fatalf("unexpected segments: %#v", segments)
	}
}

func TestDailySummaryUsesTokyoCalendarAndGap(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	tokyo, err := time.LoadLocation("Asia/Tokyo")
	if err != nil {
		t.Fatal(err)
	}
	day := time.Date(2026, 7, 18, 0, 0, 0, 0, tokyo)
	for i, temp := range []float64{20, 24} {
		at := day.Add(time.Hour + time.Duration(i*5)*time.Minute)
		run, err := s.StartCollectionRun(ctx, at)
		if err != nil {
			t.Fatal(err)
		}
		if err := s.SaveEnvironment(ctx, EnvironmentSample{RunID: run, DeviceID: "device", FetchedAt: at, TemperatureC: &temp}); err != nil {
			t.Fatal(err)
		}
	}
	days, err := s.DailySummary(ctx, RangeQuery{ID: "device", From: day.Add(time.Hour), To: day.Add(2 * time.Hour), StaleAfter: 10 * time.Minute, Location: tokyo})
	if err != nil {
		t.Fatal(err)
	}
	if len(days) != 1 || days[0].Date != "2026-07-18" || *days[0].Temperature.Avg != 22 || days[0].GapMinutes != 45 {
		t.Fatalf("unexpected daily summary: %#v", days)
	}
}

func TestDailyGapIncludesCoverageFromPreviousDay(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	tokyo, err := time.LoadLocation("Asia/Tokyo")
	if err != nil {
		t.Fatal(err)
	}
	day := time.Date(2026, 7, 18, 0, 0, 0, 0, tokyo)
	at := day.Add(-5 * time.Minute)
	run, err := s.StartCollectionRun(ctx, at)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.SaveEnvironment(ctx, EnvironmentSample{RunID: run, DeviceID: "device", FetchedAt: at}); err != nil {
		t.Fatal(err)
	}
	days, err := s.DailySummary(ctx, RangeQuery{ID: "device", From: day, To: day.Add(time.Hour), StaleAfter: 10 * time.Minute, Location: tokyo})
	if err != nil {
		t.Fatal(err)
	}
	if len(days) != 1 || days[0].GapMinutes != 55 {
		t.Fatalf("unexpected previous-day coverage: %#v", days)
	}
}

func TestDatabaseConstraints(t *testing.T) {
	s := openTestStore(t)
	_, err := s.db.Exec(`INSERT INTO environment_samples
		(collection_run_id, device_id, fetched_at, humidity_pct) VALUES (999, 'x', 0, 101)`)
	if err == nil {
		t.Fatal("expected foreign key or humidity constraint")
	}
	if _, err := s.db.Exec(`INSERT INTO collection_runs(started_at, completed_at, overall_status, devices_status, appliances_status)
		VALUES (10, 9, 'success', 'success', 'success')`); err == nil {
		t.Fatal("expected completed_at constraint")
	}
}

func boolPtr(v bool) *bool { return &v }

var _ *sql.DB
