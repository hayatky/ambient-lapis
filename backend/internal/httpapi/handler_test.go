package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

var testNow = time.Date(2026, 7, 18, 12, 34, 56, 789_000_000, time.UTC)

type staticReadiness struct{ value ReadinessSnapshot }

func (r staticReadiness) Snapshot() ReadinessSnapshot { return r.value }

type queryStub struct {
	seriesQuery SeriesQuery
	err         error
}

func (q *queryStub) Status(context.Context, time.Time) (StatusData, error) {
	return StatusData{CollectionState: "initializing", PollIntervalSeconds: 300, StaleAfterSeconds: 600}, q.err
}
func (q *queryStub) Current(context.Context, time.Time) (CurrentData, error) {
	return CurrentData{Freshness: Freshness{CollectionStopped: true}}, q.err
}
func (q *queryStub) EnvironmentSeries(_ context.Context, query SeriesQuery) (EnvironmentSeriesData, error) {
	q.seriesQuery = query
	return EnvironmentSeriesData{Resolution: query.Resolution, Points: []EnvironmentPoint{}}, q.err
}
func (q *queryStub) AirconSeries(context.Context, RangeQuery) (AirconSeriesData, error) {
	return AirconSeriesData{Segments: []AirconSegment{}}, q.err
}
func (q *queryStub) DailySummary(context.Context, RangeQuery) (DailySummaryData, error) {
	return DailySummaryData{Days: []DailySummary{}}, q.err
}

func newTestHandler(readiness ReadinessSnapshot, queries QueryService) *Handler {
	return New(Dependencies{Version: "0.1.0", Clock: ClockFunc(func() time.Time { return testNow }),
		Readiness: staticReadiness{readiness}, Queries: queries,
		Logger: slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil))})
}

func allReady() ReadinessSnapshot {
	return ReadinessSnapshot{Configuration: true, TargetSelection: true, Database: true, Migrations: true, BackupDirectory: true}
}

func TestHealthAndReadiness(t *testing.T) {
	h := newTestHandler(ReadinessSnapshot{}, nil)
	health := httptest.NewRecorder()
	h.ServeHTTP(health, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if health.Code != http.StatusOK || health.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("health response: %d %v", health.Code, health.Header())
	}
	if got := health.Body.String(); !strings.Contains(got, `"version":"0.1.0"`) {
		t.Fatalf("health body: %s", got)
	}

	ready := httptest.NewRecorder()
	h.ServeHTTP(ready, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if ready.Code != http.StatusServiceUnavailable {
		t.Fatalf("ready status = %d", ready.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(ready.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["status"] != "not_ready" {
		t.Fatalf("ready body = %#v", body)
	}
}

func TestReadyWhenAllChecksPass(t *testing.T) {
	rr := httptest.NewRecorder()
	newTestHandler(allReady(), &queryStub{}).ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", rr.Code, rr.Body.String())
	}
}

func TestMethodNotAllowedAndNotFoundUseJSONEnvelope(t *testing.T) {
	h := newTestHandler(allReady(), &queryStub{})
	for _, tc := range []struct {
		method, path string
		status       int
		code         string
	}{
		{http.MethodPost, "/api/v1/status", http.StatusMethodNotAllowed, "method_not_allowed"},
		{http.MethodGet, "/missing", http.StatusNotFound, "not_found"},
	} {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(tc.method, tc.path, nil))
		if rr.Code != tc.status || !strings.Contains(rr.Body.String(), `"code":"`+tc.code+`"`) {
			t.Errorf("%s %s: %d %s", tc.method, tc.path, rr.Code, rr.Body.String())
		}
		if rr.Header().Get("Content-Type") != "application/json; charset=utf-8" {
			t.Errorf("content type = %q", rr.Header().Get("Content-Type"))
		}
	}
}

func TestStatusEnvelopeAndRequestID(t *testing.T) {
	rr := httptest.NewRecorder()
	newTestHandler(allReady(), &queryStub{}).ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/v1/status", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	id := rr.Header().Get("X-Request-Id")
	if len(id) != 32 || !strings.Contains(rr.Body.String(), `"requestId":"`+id+`"`) {
		t.Fatalf("request id/header mismatch: %q %s", id, rr.Body.String())
	}
	if rr.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("cache = %q", rr.Header().Get("Cache-Control"))
	}
}

func TestSeriesValidationAndQuery(t *testing.T) {
	stub := &queryStub{}
	h := newTestHandler(allReady(), stub)
	for _, tc := range []struct {
		query  string
		status int
		field  string
	}{
		{"", 400, "from"},
		{"?from=no&to=2026-07-18T12:00:00Z", 400, "from"},
		{"?from=2026-07-18T12:00:00Z&to=2026-07-18T12:00:00Z", 422, "from"},
		{"?from=2026-07-18T12:00:00Z&to=2026-07-18T13:00:00Z&resolution=bad", 400, "resolution"},
	} {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/v1/environment/series"+tc.query, nil))
		if rr.Code != tc.status || !strings.Contains(rr.Body.String(), `"field":"`+tc.field+`"`) {
			t.Errorf("query %q: %d %s", tc.query, rr.Code, rr.Body.String())
		}
	}

	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/v1/environment/series?from=2026-07-17T12:00:00Z&to=2026-07-18T12:00:00Z", nil))
	if rr.Code != 200 || stub.seriesQuery.Resolution != "auto" || stub.seriesQuery.Limit != MaxItems {
		t.Fatalf("response=%d query=%+v body=%s", rr.Code, stub.seriesQuery, rr.Body.String())
	}
	if rr.Header().Get("Cache-Control") != "private, max-age=30" {
		t.Fatalf("cache=%q", rr.Header().Get("Cache-Control"))
	}
}

func TestInternalErrorsAreSanitized(t *testing.T) {
	stub := &queryStub{err: errors.New("SQL SELECT secret FROM private_path")}
	rr := httptest.NewRecorder()
	newTestHandler(allReady(), stub).ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/v1/status", nil))
	if rr.Code != http.StatusInternalServerError || strings.Contains(rr.Body.String(), "SQL") || strings.Contains(rr.Body.String(), "secret") {
		t.Fatalf("response: %d %s", rr.Code, rr.Body.String())
	}
}

func TestResultTooLargeIs422(t *testing.T) {
	stub := &queryStub{err: &ServiceError{Code: "result_too_large", Message: "result exceeds 10000 items", Status: http.StatusUnprocessableEntity}}
	rr := httptest.NewRecorder()
	newTestHandler(allReady(), stub).ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/v1/status", nil))
	if rr.Code != http.StatusUnprocessableEntity || !strings.Contains(rr.Body.String(), `"code":"result_too_large"`) {
		t.Fatalf("response: %d %s", rr.Code, rr.Body.String())
	}
}
