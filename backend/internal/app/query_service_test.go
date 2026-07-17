package app

import (
	"context"
	"testing"
	"time"

	"github.com/hayatky/ambient-lapis/backend/internal/httpapi"
	"github.com/hayatky/ambient-lapis/backend/internal/store"
)

type queryStoreStub struct {
	status      store.StatusSnapshot
	current     store.CurrentSnapshot
	seriesQuery store.SeriesQuery
	points      []store.EnvironmentPoint
	segments    []store.AirconSegment
}

func (s *queryStoreStub) Status(context.Context) (store.StatusSnapshot, error) { return s.status, nil }
func (s *queryStoreStub) Current(context.Context, string, string) (store.CurrentSnapshot, error) {
	return s.current, nil
}
func (s *queryStoreStub) EnvironmentSeries(_ context.Context, q store.SeriesQuery) ([]store.EnvironmentPoint, error) {
	s.seriesQuery = q
	return s.points, nil
}
func (s *queryStoreStub) AirconSeries(context.Context, store.RangeQuery) ([]store.AirconSegment, error) {
	return s.segments, nil
}
func (s *queryStoreStub) DailySummary(context.Context, store.RangeQuery) ([]store.DailySummary, error) {
	return []store.DailySummary{}, nil
}

func TestQueryServiceStatusFreshnessBoundary(t *testing.T) {
	now := time.Date(2026, 7, 18, 12, 0, 0, 0, time.UTC)
	completed := now.Add(-time.Minute)
	full := now.Add(-10 * time.Minute)
	stub := &queryStoreStub{status: store.StatusSnapshot{LastFullSuccessAt: &full, LastRun: &store.Run{StartedAt: completed, CompletedAt: &completed, OverallStatus: store.OverallSuccess, DevicesStatus: store.EndpointSuccess, AppliancesStatus: store.EndpointSuccess}}}
	service := NewQueryService(QueryOptions{Store: stub, PollInterval: 5 * time.Minute, StaleAfter: 10 * time.Minute})
	data, err := service.Status(context.Background(), now)
	if err != nil || data.CollectionState != "healthy" {
		t.Fatalf("at boundary: data=%+v err=%v", data, err)
	}
	data, err = service.Status(context.Background(), now.Add(time.Nanosecond))
	if err != nil || data.CollectionState != "stopped" {
		t.Fatalf("past boundary: data=%+v err=%v", data, err)
	}
}

func TestQueryServiceAutoResolutionBoundaries(t *testing.T) {
	stub := &queryStoreStub{}
	service := NewQueryService(QueryOptions{Store: stub, DeviceID: "device", StaleAfter: 10 * time.Minute, Location: time.UTC})
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	for _, tc := range []struct {
		span time.Duration
		want store.Resolution
	}{
		{48 * time.Hour, store.ResolutionRaw},
		{48*time.Hour + time.Nanosecond, store.Resolution15m},
		{14*24*time.Hour + time.Nanosecond, store.Resolution1h},
		{90*24*time.Hour + time.Nanosecond, store.Resolution1d},
	} {
		_, err := service.EnvironmentSeries(context.Background(), httpapi.SeriesQuery{RangeQuery: httpapi.RangeQuery{From: start, To: start.Add(tc.span), Limit: httpapi.MaxItems}, Resolution: "auto"})
		if err != nil || stub.seriesQuery.Resolution != tc.want {
			t.Errorf("span=%s resolution=%s err=%v", tc.span, stub.seriesQuery.Resolution, err)
		}
	}
}

func TestModeLabelsDoNotGuessUnknownValues(t *testing.T) {
	if label, known := modeLabel("vendor-mode"); known || label != "vendor-mode" {
		t.Fatalf("label=%q known=%v", label, known)
	}
	if label, known := modeLabel("warm"); !known || label != "暖房" {
		t.Fatalf("label=%q known=%v", label, known)
	}
}

func TestQueryServiceMapsMoreThan10000ResultsToTypedError(t *testing.T) {
	stub := &queryStoreStub{points: make([]store.EnvironmentPoint, httpapi.MaxItems+1), segments: make([]store.AirconSegment, httpapi.MaxItems+1)}
	service := NewQueryService(QueryOptions{Store: stub, StaleAfter: 10 * time.Minute, Location: time.UTC})
	from := time.Date(2026, 7, 18, 0, 0, 0, 0, time.UTC)
	_, err := service.EnvironmentSeries(context.Background(), httpapi.SeriesQuery{RangeQuery: httpapi.RangeQuery{From: from, To: from.Add(time.Hour), Limit: httpapi.MaxItems}, Resolution: "raw"})
	assertResultTooLarge(t, err)
	_, err = service.AirconSeries(context.Background(), httpapi.RangeQuery{From: from, To: from.Add(time.Hour), Limit: httpapi.MaxItems})
	assertResultTooLarge(t, err)
}

func assertResultTooLarge(t *testing.T, err error) {
	t.Helper()
	serviceErr, ok := httpapi.AsServiceError(err)
	if !ok || serviceErr.Code != "result_too_large" || serviceErr.Status != 422 {
		t.Fatalf("error = %#v", err)
	}
}
