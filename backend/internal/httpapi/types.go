package httpapi

import (
	"context"
	"errors"
	"time"
)

const (
	Timezone = "Asia/Tokyo"
	MaxItems = 10_000
)

type Clock interface {
	Now() time.Time
}

type ClockFunc func() time.Time

func (f ClockFunc) Now() time.Time { return f() }

type Readiness interface {
	Snapshot() ReadinessSnapshot
}

type ReadinessSnapshot struct {
	Configuration   bool `json:"-"`
	TargetSelection bool `json:"-"`
	Database        bool `json:"-"`
	Migrations      bool `json:"-"`
	BackupDirectory bool `json:"-"`
}

func (s ReadinessSnapshot) Ready() bool {
	return s.Configuration && s.TargetSelection && s.Database && s.Migrations && s.BackupDirectory
}

type QueryService interface {
	Status(context.Context, time.Time) (StatusData, error)
	Current(context.Context, time.Time) (CurrentData, error)
	EnvironmentSeries(context.Context, SeriesQuery) (EnvironmentSeriesData, error)
	AirconSeries(context.Context, RangeQuery) (AirconSeriesData, error)
	DailySummary(context.Context, RangeQuery) (DailySummaryData, error)
}

type RangeQuery struct {
	From  time.Time
	To    time.Time
	Limit int
}

type SeriesQuery struct {
	RangeQuery
	Resolution string
}

type StatusData struct {
	CollectionState          string   `json:"collectionState"`
	LastFullSuccessAt        *string  `json:"lastFullSuccessAt"`
	LastEnvironmentSuccessAt *string  `json:"lastEnvironmentSuccessAt"`
	LastAirconSuccessAt      *string  `json:"lastAirconSuccessAt"`
	LastRun                  *LastRun `json:"lastRun"`
	PollIntervalSeconds      int64    `json:"pollIntervalSeconds"`
	StaleAfterSeconds        int64    `json:"staleAfterSeconds"`
}

type LastRun struct {
	StartedAt        string   `json:"startedAt"`
	CompletedAt      *string  `json:"completedAt"`
	OverallStatus    string   `json:"overallStatus"`
	DevicesStatus    string   `json:"devicesStatus"`
	AppliancesStatus string   `json:"appliancesStatus"`
	ErrorCodes       []string `json:"errorCodes"`
}

type CurrentData struct {
	Environment *CurrentEnvironment `json:"environment"`
	Aircon      *CurrentAircon      `json:"aircon"`
	Freshness   Freshness           `json:"freshness"`
}

type CurrentEnvironment struct {
	FetchedAt   string             `json:"fetchedAt"`
	RemoOnline  *bool              `json:"remoOnline"`
	Temperature CurrentTemperature `json:"temperature"`
	Humidity    CurrentHumidity    `json:"humidity"`
}

type CurrentTemperature struct {
	ValueC     *float64 `json:"valueC"`
	ObservedAt *string  `json:"observedAt"`
	Stale      bool     `json:"stale"`
}

type CurrentHumidity struct {
	ValuePct   *float64 `json:"valuePct"`
	ObservedAt *string  `json:"observedAt"`
	Stale      bool     `json:"stale"`
}

type CurrentAircon struct {
	FetchedAt           string   `json:"fetchedAt"`
	RecognitionState    string   `json:"recognitionState"`
	Mode                Mode     `json:"mode"`
	TargetTemperatureC  *float64 `json:"targetTemperatureC"`
	Volume              *string  `json:"volume"`
	DirectionVertical   *string  `json:"directionVertical"`
	DirectionHorizontal *string  `json:"directionHorizontal"`
	SettingsUpdatedAt   *string  `json:"settingsUpdatedAt"`
}

type Mode struct {
	Raw   string `json:"raw"`
	Label string `json:"label"`
	Known bool   `json:"known"`
}

type Freshness struct {
	CollectionStopped bool    `json:"collectionStopped"`
	LastFullSuccessAt *string `json:"lastFullSuccessAt"`
}

type EnvironmentSeriesData struct {
	Resolution string             `json:"resolution"`
	Points     []EnvironmentPoint `json:"points"`
}

type AirconSeriesData struct {
	Segments []AirconSegment `json:"segments"`
}

type DailySummaryData struct {
	Days []DailySummary `json:"days"`
}

type EnvironmentPoint struct {
	Time            string `json:"time"`
	Temperature     any    `json:"temperature"`
	Humidity        any    `json:"humidity"`
	RemoOnlineState string `json:"remoOnlineState"`
	Gap             bool   `json:"gap"`
	Stale           bool   `json:"stale"`
}

// SeriesMetric supports both the raw (value, observedAt) and aggregated
// (avg, min, max, sampleCount, latestObservedAt) API representations.
type RawSeriesMetric struct {
	Value      *float64 `json:"value"`
	ObservedAt *string  `json:"observedAt"`
}

type AggregateSeriesMetric struct {
	Average          *float64 `json:"avg"`
	Minimum          *float64 `json:"min"`
	Maximum          *float64 `json:"max"`
	SampleCount      int64    `json:"sampleCount"`
	LatestObservedAt *string  `json:"latestObservedAt"`
}

type AirconSegment struct {
	From               string   `json:"from"`
	To                 string   `json:"to"`
	State              string   `json:"state"`
	Mode               *string  `json:"mode"`
	TargetTemperatureC *float64 `json:"targetTemperatureC"`
}

type DailySummary struct {
	Date        string              `json:"date"`
	Temperature *DailySummaryMetric `json:"temperature"`
	Humidity    *DailySummaryMetric `json:"humidity"`
	GapMinutes  int64               `json:"gapMinutes"`
}

type DailySummaryMetric struct {
	Average     *float64 `json:"avg"`
	Minimum     *float64 `json:"min"`
	Maximum     *float64 `json:"max"`
	SampleCount int64    `json:"sampleCount"`
}

type ServiceError struct {
	Code    string
	Message string
	Field   string
	Status  int
	Err     error
}

func (e *ServiceError) Error() string {
	if e.Err != nil {
		return e.Err.Error()
	}
	return e.Message
}

func (e *ServiceError) Unwrap() error { return e.Err }

func AsServiceError(err error) (*ServiceError, bool) {
	var target *ServiceError
	ok := errors.As(err, &target)
	return target, ok
}
