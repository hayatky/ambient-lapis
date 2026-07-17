package app

import (
	"context"
	"time"

	"github.com/hayatky/ambient-lapis/backend/internal/domain"
	"github.com/hayatky/ambient-lapis/backend/internal/store"
)

type collectionStore interface {
	StartCollectionRun(context.Context, time.Time) (int64, error)
	SaveEnvironment(context.Context, store.EnvironmentSample) error
	SaveAircon(context.Context, store.AirconSample) error
	FinalizeCollectionRun(context.Context, store.RunFinalization) error
}

type collectorStoreAdapter struct {
	store     collectionStore
	readiness *Readiness
}

func newCollectorStoreAdapter(value collectionStore, readiness *Readiness) *collectorStoreAdapter {
	return &collectorStoreAdapter{store: value, readiness: readiness}
}

func (a *collectorStoreAdapter) StartCollectionRun(ctx context.Context, startedAt time.Time) (int64, error) {
	id, err := a.store.StartCollectionRun(ctx, startedAt)
	a.observeDatabase(err)
	return id, err
}

func (a *collectorStoreAdapter) SaveEnvironment(ctx context.Context, runID int64, fetchedAt time.Time, value domain.EnvironmentReading) error {
	err := a.store.SaveEnvironment(ctx, store.EnvironmentSample{RunID: runID, DeviceID: value.DeviceID, FetchedAt: fetchedAt,
		Online: value.Online, TemperatureC: value.TemperatureC, TemperatureObservedAt: value.TemperatureObservedAt,
		HumidityPct: value.HumidityPct, HumidityObservedAt: value.HumidityObservedAt})
	a.observeDatabase(err)
	return err
}

func (a *collectorStoreAdapter) SaveAircon(ctx context.Context, runID int64, fetchedAt time.Time, value domain.AirconReading) error {
	err := a.store.SaveAircon(ctx, store.AirconSample{RunID: runID, ApplianceID: value.ApplianceID, FetchedAt: fetchedAt,
		SettingsUpdatedAt: value.SettingsUpdatedAt, PowerState: store.PowerState(value.PowerState), ButtonRaw: value.ButtonRaw,
		ModeRaw: value.ModeRaw, TargetTemperatureRaw: value.TargetTemperatureRaw, TemperatureUnitRaw: value.TemperatureUnitRaw,
		TargetTemperatureC: value.TargetTemperatureC, VolumeRaw: value.VolumeRaw,
		DirectionVerticalRaw: value.DirectionVerticalRaw, DirectionHorizontalRaw: value.DirectionHorizontalRaw})
	a.observeDatabase(err)
	return err
}

func (a *collectorStoreAdapter) CompleteCollectionRun(ctx context.Context, result domain.CollectionResult) error {
	err := a.store.FinalizeCollectionRun(ctx, store.RunFinalization{RunID: result.RunID, CompletedAt: result.CompletedAt,
		OverallStatus: store.OverallStatus(result.OverallStatus), RateLimitResetAt: result.RateLimitResetAt,
		Devices:    store.EndpointFinalization{Status: store.EndpointStatus(result.Devices.Status), ErrorCode: result.Devices.ErrorCode, ErrorDetail: result.Devices.ErrorDetail},
		Appliances: store.EndpointFinalization{Status: store.EndpointStatus(result.Appliances.Status), ErrorCode: result.Appliances.ErrorCode, ErrorDetail: result.Appliances.ErrorDetail}})
	a.observeDatabase(err)
	return err
}

func (a *collectorStoreAdapter) observeDatabase(err error) {
	if a.readiness != nil {
		a.readiness.SetDatabase(err == nil)
	}
}
