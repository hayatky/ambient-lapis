package app

import (
	"context"
	"net/http"
	"time"

	"github.com/hayatky/ambient-lapis/backend/internal/httpapi"
	"github.com/hayatky/ambient-lapis/backend/internal/store"
)

type QueryStore interface {
	Status(context.Context) (store.StatusSnapshot, error)
	Current(context.Context, string, string) (store.CurrentSnapshot, error)
	EnvironmentSeries(context.Context, store.SeriesQuery) ([]store.EnvironmentPoint, error)
	AirconSeries(context.Context, store.RangeQuery) ([]store.AirconSegment, error)
	DailySummary(context.Context, store.RangeQuery) ([]store.DailySummary, error)
}

type QueryOptions struct {
	Store        QueryStore
	DeviceID     string
	ApplianceID  string
	PollInterval time.Duration
	StaleAfter   time.Duration
	Location     *time.Location
}

type QueryService struct{ options QueryOptions }

func NewQueryService(options QueryOptions) *QueryService { return &QueryService{options: options} }

func (s *QueryService) Status(ctx context.Context, now time.Time) (httpapi.StatusData, error) {
	snapshot, err := s.options.Store.Status(ctx)
	if err != nil {
		return httpapi.StatusData{}, err
	}
	data := httpapi.StatusData{
		CollectionState:          "initializing",
		LastFullSuccessAt:        timeString(snapshot.LastFullSuccessAt),
		LastEnvironmentSuccessAt: timeString(snapshot.LastEnvironmentSuccessAt),
		LastAirconSuccessAt:      timeString(snapshot.LastAirconSuccessAt),
		PollIntervalSeconds:      int64(s.options.PollInterval / time.Second),
		StaleAfterSeconds:        int64(s.options.StaleAfter / time.Second),
	}
	if snapshot.LastRun != nil {
		run := snapshot.LastRun
		errors := make([]string, 0, 2)
		if run.DevicesErrorCode != nil {
			errors = append(errors, *run.DevicesErrorCode)
		}
		if run.AppliancesErrorCode != nil {
			errors = append(errors, *run.AppliancesErrorCode)
		}
		data.LastRun = &httpapi.LastRun{StartedAt: formatUTC(run.StartedAt), CompletedAt: timeString(run.CompletedAt),
			OverallStatus: string(run.OverallStatus), DevicesStatus: string(run.DevicesStatus),
			AppliancesStatus: string(run.AppliancesStatus), ErrorCodes: errors}
		if snapshot.LastFullSuccessAt == nil || now.Sub(*snapshot.LastFullSuccessAt) > s.options.StaleAfter {
			data.CollectionState = "stopped"
		} else if run.OverallStatus == store.OverallSuccess || run.OverallStatus == store.OverallRunning {
			data.CollectionState = "healthy"
		} else {
			data.CollectionState = "degraded"
		}
	}
	return data, nil
}

func (s *QueryService) Current(ctx context.Context, now time.Time) (httpapi.CurrentData, error) {
	snapshot, err := s.options.Store.Current(ctx, s.options.DeviceID, s.options.ApplianceID)
	if err != nil {
		return httpapi.CurrentData{}, err
	}
	status, err := s.options.Store.Status(ctx)
	if err != nil {
		return httpapi.CurrentData{}, err
	}
	data := httpapi.CurrentData{Freshness: httpapi.Freshness{LastFullSuccessAt: timeString(status.LastFullSuccessAt), CollectionStopped: status.LastFullSuccessAt == nil || now.Sub(*status.LastFullSuccessAt) > s.options.StaleAfter}}
	if value := snapshot.Environment; value != nil {
		data.Environment = &httpapi.CurrentEnvironment{FetchedAt: formatUTC(value.FetchedAt), RemoOnline: value.Online,
			Temperature: httpapi.CurrentTemperature{ValueC: value.TemperatureC, ObservedAt: timeString(value.TemperatureObservedAt), Stale: isStale(now, value.TemperatureObservedAt, s.options.StaleAfter)},
			Humidity:    httpapi.CurrentHumidity{ValuePct: value.HumidityPct, ObservedAt: timeString(value.HumidityObservedAt), Stale: isStale(now, value.HumidityObservedAt, s.options.StaleAfter)}}
	}
	if value := snapshot.Aircon; value != nil {
		mode := ""
		if value.ModeRaw != nil {
			mode = *value.ModeRaw
		}
		label, known := modeLabel(mode)
		data.Aircon = &httpapi.CurrentAircon{FetchedAt: formatUTC(value.FetchedAt), RecognitionState: string(value.PowerState),
			Mode: httpapi.Mode{Raw: mode, Label: label, Known: known}, TargetTemperatureC: value.TargetTemperatureC,
			Volume: value.VolumeRaw, DirectionVertical: value.DirectionVerticalRaw,
			DirectionHorizontal: value.DirectionHorizontalRaw, SettingsUpdatedAt: timeString(value.SettingsUpdatedAt)}
	}
	return data, nil
}

func (s *QueryService) EnvironmentSeries(ctx context.Context, query httpapi.SeriesQuery) (httpapi.EnvironmentSeriesData, error) {
	resolution, err := selectResolution(query.Resolution, query.To.Sub(query.From))
	if err != nil {
		return httpapi.EnvironmentSeriesData{}, err
	}
	points, err := s.options.Store.EnvironmentSeries(ctx, store.SeriesQuery{DeviceID: s.options.DeviceID, From: query.From, To: query.To, Resolution: resolution, StaleAfter: s.options.StaleAfter, Location: s.options.Location})
	if err != nil {
		return httpapi.EnvironmentSeriesData{}, err
	}
	if len(points) > query.Limit {
		return httpapi.EnvironmentSeriesData{}, resultTooLarge()
	}
	result := make([]httpapi.EnvironmentPoint, 0, len(points))
	for _, point := range points {
		item := httpapi.EnvironmentPoint{Time: formatUTC(point.Time), RemoOnlineState: point.RemoOnlineState, Gap: point.Gap, Stale: point.Stale}
		if resolution == store.ResolutionRaw {
			item.Temperature = httpapi.RawSeriesMetric{Value: point.TemperatureValue, ObservedAt: timeString(point.TemperatureAt)}
			item.Humidity = httpapi.RawSeriesMetric{Value: point.HumidityValue, ObservedAt: timeString(point.HumidityAt)}
		} else {
			item.Temperature = aggregateMetric(point.Temperature)
			item.Humidity = aggregateMetric(point.Humidity)
		}
		result = append(result, item)
	}
	return httpapi.EnvironmentSeriesData{Resolution: string(resolution), Points: result}, nil
}

func (s *QueryService) AirconSeries(ctx context.Context, query httpapi.RangeQuery) (httpapi.AirconSeriesData, error) {
	segments, err := s.options.Store.AirconSeries(ctx, store.RangeQuery{ID: s.options.ApplianceID, From: query.From, To: query.To, StaleAfter: s.options.StaleAfter, Location: s.options.Location})
	if err != nil {
		return httpapi.AirconSeriesData{}, err
	}
	if len(segments) > query.Limit {
		return httpapi.AirconSeriesData{}, resultTooLarge()
	}
	result := make([]httpapi.AirconSegment, 0, len(segments))
	for _, segment := range segments {
		result = append(result, httpapi.AirconSegment{From: formatUTC(segment.From), To: formatUTC(segment.To), State: segment.State, Mode: segment.Mode, TargetTemperatureC: segment.TargetTemperatureC})
	}
	return httpapi.AirconSeriesData{Segments: result}, nil
}

func (s *QueryService) DailySummary(ctx context.Context, query httpapi.RangeQuery) (httpapi.DailySummaryData, error) {
	days, err := s.options.Store.DailySummary(ctx, store.RangeQuery{ID: s.options.DeviceID, From: query.From, To: query.To, StaleAfter: s.options.StaleAfter, Location: s.options.Location})
	if err != nil {
		return httpapi.DailySummaryData{}, err
	}
	if len(days) > query.Limit {
		return httpapi.DailySummaryData{}, resultTooLarge()
	}
	result := make([]httpapi.DailySummary, 0, len(days))
	for _, day := range days {
		result = append(result, httpapi.DailySummary{Date: day.Date, Temperature: dailyMetric(day.Temperature), Humidity: dailyMetric(day.Humidity), GapMinutes: day.GapMinutes})
	}
	return httpapi.DailySummaryData{Days: result}, nil
}

func selectResolution(requested string, span time.Duration) (store.Resolution, error) {
	if requested == "auto" {
		switch {
		case span <= 48*time.Hour:
			requested = "raw"
		case span <= 14*24*time.Hour:
			requested = "15m"
		case span <= 90*24*time.Hour:
			requested = "1h"
		default:
			requested = "1d"
		}
	}
	limits := map[string]struct {
		resolution store.Resolution
		maximum    time.Duration
	}{
		"raw": {store.ResolutionRaw, 48 * time.Hour}, "15m": {store.Resolution15m, 14 * 24 * time.Hour},
		"1h": {store.Resolution1h, 90 * 24 * time.Hour}, "1d": {store.Resolution1d, 10 * 366 * 24 * time.Hour},
	}
	choice := limits[requested]
	if span > choice.maximum {
		return "", &httpapi.ServiceError{Code: "range_too_large", Message: "range exceeds the selected resolution limit", Field: "to", Status: http.StatusUnprocessableEntity}
	}
	return choice.resolution, nil
}

func aggregateMetric(value store.ValueStats) httpapi.AggregateSeriesMetric {
	return httpapi.AggregateSeriesMetric{Average: value.Avg, Minimum: value.Min, Maximum: value.Max, SampleCount: int64(value.SampleCount), LatestObservedAt: timeString(value.LatestObservedAt)}
}
func dailyMetric(value store.ValueStats) *httpapi.DailySummaryMetric {
	return &httpapi.DailySummaryMetric{Average: value.Avg, Minimum: value.Min, Maximum: value.Max, SampleCount: int64(value.SampleCount)}
}
func timeString(value *time.Time) *string {
	if value == nil {
		return nil
	}
	text := formatUTC(*value)
	return &text
}
func formatUTC(value time.Time) string { return value.UTC().Format(time.RFC3339Nano) }
func isStale(now time.Time, observed *time.Time, threshold time.Duration) bool {
	return observed == nil || now.Sub(*observed) > threshold
}
func resultTooLarge() error {
	return &httpapi.ServiceError{Code: "result_too_large", Message: "result exceeds 10000 items", Status: http.StatusUnprocessableEntity}
}

func modeLabel(raw string) (string, bool) {
	switch raw {
	case "cool":
		return "冷房", true
	case "warm":
		return "暖房", true
	case "dry":
		return "除湿", true
	case "blow":
		return "送風", true
	case "auto":
		return "自動", true
	default:
		return raw, false
	}
}
