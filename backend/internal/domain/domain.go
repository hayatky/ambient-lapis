package domain

import "time"

type PowerState string

const (
	PowerStateOn      PowerState = "on"
	PowerStateOff     PowerState = "off"
	PowerStateUnknown PowerState = "unknown"
)

type EnvironmentReading struct {
	DeviceID              string
	Online                *bool
	TemperatureC          *float64
	TemperatureObservedAt *time.Time
	HumidityPct           *float64
	HumidityObservedAt    *time.Time
}

type AirconReading struct {
	ApplianceID            string
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

type EndpointResult struct {
	Status      EndpointStatus
	ErrorCode   string
	ErrorDetail string
}

type CollectionResult struct {
	RunID            int64
	StartedAt        time.Time
	CompletedAt      time.Time
	OverallStatus    OverallStatus
	Devices          EndpointResult
	Appliances       EndpointResult
	RateLimitResetAt *time.Time
}
