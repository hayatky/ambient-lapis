package store

import "time"

type EndpointStatus string

const (
	EndpointPending EndpointStatus = "pending"
	EndpointSuccess EndpointStatus = "success"
	EndpointError   EndpointStatus = "error"
	EndpointSkipped EndpointStatus = "skipped"
)

type OverallStatus string

const (
	OverallRunning   OverallStatus = "running"
	OverallSuccess   OverallStatus = "success"
	OverallPartial   OverallStatus = "partial"
	OverallError     OverallStatus = "error"
	OverallCancelled OverallStatus = "cancelled"
)

type PowerState string

const (
	PowerOn      PowerState = "on"
	PowerOff     PowerState = "off"
	PowerUnknown PowerState = "unknown"
)

type EnvironmentSample struct {
	RunID                 int64
	DeviceID              string
	FetchedAt             time.Time
	Online                *bool
	TemperatureC          *float64
	TemperatureObservedAt *time.Time
	HumidityPct           *float64
	HumidityObservedAt    *time.Time
}

type AirconSample struct {
	RunID                  int64
	ApplianceID            string
	FetchedAt              time.Time
	SettingsUpdatedAt      *time.Time
	PowerState             PowerState
	ButtonRaw              string
	ModeRaw                *string
	TargetTemperatureRaw   *float64
	TemperatureUnitRaw     *string
	TargetTemperatureC     *float64
	VolumeRaw              *string
	DirectionVerticalRaw   *string
	DirectionHorizontalRaw *string
}

type EndpointFailure struct {
	Code             string
	Detail           string
	RateLimitResetAt *time.Time
}

type EndpointFinalization struct {
	Status      EndpointStatus
	ErrorCode   string
	ErrorDetail string
}

type RunFinalization struct {
	RunID            int64
	CompletedAt      time.Time
	OverallStatus    OverallStatus
	Devices          EndpointFinalization
	Appliances       EndpointFinalization
	RateLimitResetAt *time.Time
}

type Run struct {
	ID                  int64
	StartedAt           time.Time
	CompletedAt         *time.Time
	OverallStatus       OverallStatus
	DevicesStatus       EndpointStatus
	DevicesErrorCode    *string
	AppliancesStatus    EndpointStatus
	AppliancesErrorCode *string
	RateLimitResetAt    *time.Time
}

type StatusSnapshot struct {
	LastRun                  *Run
	LastFullSuccessAt        *time.Time
	LastEnvironmentSuccessAt *time.Time
	LastAirconSuccessAt      *time.Time
}

type CurrentSnapshot struct {
	Environment *EnvironmentSample
	Aircon      *AirconSample
}

type Resolution string

const (
	ResolutionRaw Resolution = "raw"
	Resolution15m Resolution = "15m"
	Resolution1h  Resolution = "1h"
	Resolution1d  Resolution = "1d"
)

type SeriesQuery struct {
	DeviceID   string
	From       time.Time
	To         time.Time
	Resolution Resolution
	StaleAfter time.Duration
	Location   *time.Location
}

type ValueStats struct {
	Avg              *float64
	Min              *float64
	Max              *float64
	SampleCount      int
	LatestObservedAt *time.Time
}

type EnvironmentPoint struct {
	Time             time.Time
	Temperature      ValueStats
	Humidity         ValueStats
	TemperatureValue *float64
	TemperatureAt    *time.Time
	HumidityValue    *float64
	HumidityAt       *time.Time
	RemoOnlineState  string
	Gap              bool
	Stale            bool
}

type RangeQuery struct {
	ID         string
	From       time.Time
	To         time.Time
	StaleAfter time.Duration
	Location   *time.Location
}

type AirconSegment struct {
	From               time.Time
	To                 time.Time
	State              string
	Mode               *string
	TargetTemperatureC *float64
}

type DailySummary struct {
	Date        string
	Temperature ValueStats
	Humidity    ValueStats
	GapMinutes  int64
}
