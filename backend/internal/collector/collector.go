package collector

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/hayatky/ambient-lapis/backend/internal/domain"
	"github.com/hayatky/ambient-lapis/backend/internal/nature"
)

const maxErrorDetail = 2048
const storageErrorCode = "storage_error"
const storageErrorDetail = "internal storage error"

type Adapter interface {
	FetchEnvironment(context.Context, string) (domain.EnvironmentReading, error)
	FetchAircon(context.Context, string) (domain.AirconReading, error)
}

// Store deliberately exposes separate operations so that a successful endpoint
// is committed even when the other endpoint fails.
type Store interface {
	StartCollectionRun(context.Context, time.Time) (int64, error)
	SaveEnvironment(context.Context, int64, time.Time, domain.EnvironmentReading) error
	SaveAircon(context.Context, int64, time.Time, domain.AirconReading) error
	CompleteCollectionRun(context.Context, domain.CollectionResult) error
}

type TargetSelectionReporter interface {
	SetDeviceTargetValid(bool)
	SetApplianceTargetValid(bool)
}

type NowFunc func() time.Time

type Collector struct {
	adapter     Adapter
	store       Store
	deviceID    string
	applianceID string
	now         NowFunc
	reporter    TargetSelectionReporter
}

type Options struct {
	Adapter      Adapter
	Store        Store
	DeviceID     string
	ApplianceID  string
	Now          NowFunc
	TargetStatus TargetSelectionReporter
}

func New(options Options) (*Collector, error) {
	if options.Adapter == nil || options.Store == nil {
		return nil, errors.New("collector adapter and store are required")
	}
	if strings.TrimSpace(options.DeviceID) == "" || strings.TrimSpace(options.ApplianceID) == "" {
		return nil, errors.New("collector target IDs are required")
	}
	if options.Now == nil {
		options.Now = time.Now
	}
	return &Collector{
		adapter: options.Adapter, store: options.Store,
		deviceID: strings.TrimSpace(options.DeviceID), applianceID: strings.TrimSpace(options.ApplianceID),
		now: options.Now, reporter: options.TargetStatus,
	}, nil
}

func (c *Collector) Run(ctx context.Context) (domain.CollectionResult, error) {
	started := c.now().UTC()
	runID, err := c.store.StartCollectionRun(ctx, started)
	if err != nil {
		return domain.CollectionResult{}, err
	}
	result := domain.CollectionResult{
		RunID: runID, StartedAt: started, OverallStatus: domain.OverallRunning,
		Devices:    domain.EndpointResult{Status: domain.EndpointPending},
		Appliances: domain.EndpointResult{Status: domain.EndpointPending},
	}

	environment, environmentErr := c.adapter.FetchEnvironment(ctx, c.deviceID)
	if environmentErr == nil {
		c.reportDeviceTarget(true)
		fetchedAt := c.now().UTC()
		if err := c.store.SaveEnvironment(ctx, runID, fetchedAt, environment); err != nil {
			environmentErr = err
		} else {
			result.Devices.Status = domain.EndpointSuccess
		}
	}
	if environmentErr != nil {
		result.Devices = endpointError(environmentErr)
		result.RateLimitResetAt = latestReset(result.RateLimitResetAt, nature.RateLimitReset(environmentErr))
		if nature.ErrorCode(environmentErr) == nature.CodeTargetNotFound {
			c.reportDeviceTarget(false)
		}
	}

	if ctx.Err() != nil {
		result.Appliances.Status = domain.EndpointSkipped
	} else {
		aircon, airconErr := c.adapter.FetchAircon(ctx, c.applianceID)
		if airconErr == nil {
			c.reportApplianceTarget(true)
			fetchedAt := c.now().UTC()
			if err := c.store.SaveAircon(ctx, runID, fetchedAt, aircon); err != nil {
				airconErr = err
			} else {
				result.Appliances.Status = domain.EndpointSuccess
			}
		}
		if airconErr != nil {
			result.Appliances = endpointError(airconErr)
			result.RateLimitResetAt = latestReset(result.RateLimitResetAt, nature.RateLimitReset(airconErr))
			if nature.ErrorCode(airconErr) == nature.CodeTargetNotFound {
				c.reportApplianceTarget(false)
			}
		}
	}

	result.CompletedAt = c.now().UTC()
	result.OverallStatus = overallStatus(ctx, result.Devices.Status, result.Appliances.Status)
	// Completion must get a short independent opportunity after collection
	// cancellation, otherwise a running row can be left behind on graceful exit.
	completeCtx := ctx
	var cancel context.CancelFunc
	if ctx.Err() != nil {
		completeCtx, cancel = context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
	}
	if err := c.store.CompleteCollectionRun(completeCtx, result); err != nil {
		return result, err
	}
	return result, nil
}

func endpointError(err error) domain.EndpointResult {
	var apiErr *nature.APIError
	if !errors.As(err, &apiErr) {
		return domain.EndpointResult{Status: domain.EndpointError, ErrorCode: storageErrorCode, ErrorDetail: storageErrorDetail}
	}
	return domain.EndpointResult{Status: domain.EndpointError, ErrorCode: apiErr.Code, ErrorDetail: truncateUTF8(apiErr.Error(), maxErrorDetail)}
}

func truncateUTF8(value string, maximumRunes int) string {
	if utf8.RuneCountInString(value) <= maximumRunes {
		return value
	}
	runes := []rune(value)
	return string(runes[:maximumRunes])
}

func overallStatus(ctx context.Context, devices, appliances domain.EndpointStatus) domain.OverallStatus {
	if ctx.Err() != nil {
		return domain.OverallCancelled
	}
	if devices == domain.EndpointSuccess && appliances == domain.EndpointSuccess {
		return domain.OverallSuccess
	}
	if devices == domain.EndpointSuccess || appliances == domain.EndpointSuccess {
		return domain.OverallPartial
	}
	return domain.OverallError
}

func latestReset(current, candidate *time.Time) *time.Time {
	if candidate == nil || (current != nil && !candidate.After(*current)) {
		return current
	}
	return candidate
}

func (c *Collector) reportDeviceTarget(valid bool) {
	if c.reporter != nil {
		c.reporter.SetDeviceTargetValid(valid)
	}
}

func (c *Collector) reportApplianceTarget(valid bool) {
	if c.reporter != nil {
		c.reporter.SetApplianceTargetValid(valid)
	}
}
