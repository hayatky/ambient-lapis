package collector

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/hayatky/ambient-lapis/backend/internal/domain"
	"github.com/hayatky/ambient-lapis/backend/internal/nature"
)

func TestCollectorSuccessAndCallOrder(t *testing.T) {
	var calls []string
	adapter := &fakeAdapter{
		environment: domain.EnvironmentReading{DeviceID: "device"},
		aircon:      domain.AirconReading{ApplianceID: "aircon", PowerState: domain.PowerStateOn},
		calls:       &calls,
	}
	store := &fakeStore{calls: &calls}
	reporter := &fakeReporter{}
	collector := newTestCollector(t, adapter, store, reporter)
	result, err := collector.Run(context.Background())
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if result.OverallStatus != domain.OverallSuccess || result.Devices.Status != domain.EndpointSuccess || result.Appliances.Status != domain.EndpointSuccess {
		t.Fatalf("unexpected result: %+v", result)
	}
	want := "start,fetch-environment,save-environment,fetch-aircon,save-aircon,complete"
	if got := strings.Join(calls, ","); got != want {
		t.Fatalf("call order = %q, want %q", got, want)
	}
	if reporter.device == nil || !*reporter.device || reporter.appliance == nil || !*reporter.appliance {
		t.Fatalf("target selection not reported: %+v", reporter)
	}
}

func TestCollectorPartialSuccessPreservesSuccessfulSide(t *testing.T) {
	tests := []struct {
		name           string
		environmentErr error
		airconErr      error
		wantSavedEnv   bool
		wantSavedAC    bool
	}{
		{"devices success", nil, errors.New("appliance unavailable"), true, false},
		{"appliances success", errors.New("device unavailable"), nil, false, true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			adapter := &fakeAdapter{environmentErr: test.environmentErr, airconErr: test.airconErr}
			store := &fakeStore{}
			collector := newTestCollector(t, adapter, store, nil)
			result, err := collector.Run(context.Background())
			if err != nil {
				t.Fatalf("Run: %v", err)
			}
			if result.OverallStatus != domain.OverallPartial || store.savedEnvironment != test.wantSavedEnv || store.savedAircon != test.wantSavedAC {
				t.Fatalf("result=%+v store=%+v", result, store)
			}
		})
	}
}

func TestCollectorBothErrors(t *testing.T) {
	adapter := &fakeAdapter{environmentErr: errors.New("one"), airconErr: errors.New("two")}
	store := &fakeStore{}
	collector := newTestCollector(t, adapter, store, nil)
	result, err := collector.Run(context.Background())
	if err != nil || result.OverallStatus != domain.OverallError {
		t.Fatalf("result=%+v err=%v", result, err)
	}
}

func TestCollectorCancellationSkipsRemainingEndpointAndCompletes(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	adapter := &fakeAdapter{environmentFunc: func() error { cancel(); return context.Canceled }}
	store := &fakeStore{}
	collector := newTestCollector(t, adapter, store, nil)
	result, err := collector.Run(ctx)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if result.OverallStatus != domain.OverallCancelled || result.Appliances.Status != domain.EndpointSkipped || !store.completed {
		t.Fatalf("result=%+v store=%+v", result, store)
	}
}

func TestCollectorTargetNotFoundUpdatesOnlyAffectedTarget(t *testing.T) {
	adapter := &fakeAdapter{
		environmentErr: &nature.APIError{Code: nature.CodeTargetNotFound, Detail: "missing"},
		aircon:         domain.AirconReading{ApplianceID: "aircon"},
	}
	reporter := &fakeReporter{}
	collector := newTestCollector(t, adapter, &fakeStore{}, reporter)
	if _, err := collector.Run(context.Background()); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if reporter.device == nil || *reporter.device || reporter.appliance == nil || !*reporter.appliance {
		t.Fatalf("unexpected target states: %+v", reporter)
	}
}

func TestCollectorPropagatesLatestRateLimitReset(t *testing.T) {
	one := time.Date(2026, 7, 18, 12, 10, 0, 0, time.UTC)
	two := one.Add(time.Minute)
	adapter := &fakeAdapter{
		environmentErr: &nature.APIError{Code: nature.CodeRateLimited, RateLimitResetAt: &one},
		airconErr:      &nature.APIError{Code: nature.CodeRateLimited, RateLimitResetAt: &two},
	}
	collector := newTestCollector(t, adapter, &fakeStore{}, nil)
	result, err := collector.Run(context.Background())
	if err != nil || result.RateLimitResetAt == nil || !result.RateLimitResetAt.Equal(two) {
		t.Fatalf("result=%+v err=%v", result, err)
	}
}

func TestCollectorTruncatesErrorDetail(t *testing.T) {
	adapter := &fakeAdapter{environmentErr: &nature.APIError{Code: nature.CodeUpstreamError, Detail: strings.Repeat("界", 3000)}, airconErr: errors.New("other")}
	collector := newTestCollector(t, adapter, &fakeStore{}, nil)
	result, err := collector.Run(context.Background())
	if err != nil || !utf8.ValidString(result.Devices.ErrorDetail) || utf8.RuneCountInString(result.Devices.ErrorDetail) != maxErrorDetail {
		t.Fatalf("detail rune length=%d valid=%v err=%v", utf8.RuneCountInString(result.Devices.ErrorDetail), utf8.ValidString(result.Devices.ErrorDetail), err)
	}
}

func TestCollectorDoesNotPersistArbitraryNonAPIError(t *testing.T) {
	const sensitive = "SQL /private/path secret-value"
	adapter := &fakeAdapter{environmentErr: errors.New(sensitive), airconErr: errors.New(sensitive)}
	collector := newTestCollector(t, adapter, &fakeStore{}, nil)
	result, err := collector.Run(context.Background())
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	for _, endpoint := range []domain.EndpointResult{result.Devices, result.Appliances} {
		if endpoint.ErrorCode != storageErrorCode || endpoint.ErrorDetail != storageErrorDetail || strings.Contains(endpoint.ErrorDetail, sensitive) {
			t.Fatalf("unsafe endpoint error: %+v", endpoint)
		}
	}
}

func TestSchedulerImmediateThenFixedDelay(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	runner := &fakeRunner{cancel: cancel, cancelAfter: 3}
	var delays []time.Duration
	scheduler, err := NewScheduler(runner, nil, 5*time.Minute, nil, func(_ context.Context, delay time.Duration) error {
		delays = append(delays, delay)
		return nil
	})
	if err != nil {
		t.Fatalf("NewScheduler: %v", err)
	}
	if err := scheduler.Run(ctx); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if runner.calls != 3 || len(delays) != 2 || delays[0] != 5*time.Minute || delays[1] != 5*time.Minute {
		t.Fatalf("calls=%d delays=%v", runner.calls, delays)
	}
}

func TestSchedulerHonorsLaterRateLimit(t *testing.T) {
	now := time.Date(2026, 7, 18, 12, 0, 0, 0, time.UTC)
	ctx, cancel := context.WithCancel(context.Background())
	runner := &fakeRunner{cancel: cancel, cancelAfter: 2}
	limiter := fixedLimiter{next: now.Add(12 * time.Minute)}
	var delay time.Duration
	scheduler, err := NewScheduler(runner, limiter, 5*time.Minute, func() time.Time { return now }, func(_ context.Context, d time.Duration) error {
		delay = d
		return nil
	})
	if err != nil {
		t.Fatalf("NewScheduler: %v", err)
	}
	if err := scheduler.Run(ctx); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if delay != 12*time.Minute {
		t.Fatalf("delay = %v", delay)
	}
}

func newTestCollector(t *testing.T, adapter Adapter, store Store, reporter TargetSelectionReporter) *Collector {
	t.Helper()
	now := time.Date(2026, 7, 18, 12, 0, 0, 0, time.UTC)
	c, err := New(Options{Adapter: adapter, Store: store, DeviceID: "device", ApplianceID: "aircon", Now: func() time.Time {
		now = now.Add(time.Second)
		return now
	}, TargetStatus: reporter})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return c
}

type fakeAdapter struct {
	environment     domain.EnvironmentReading
	aircon          domain.AirconReading
	environmentErr  error
	airconErr       error
	environmentFunc func() error
	calls           *[]string
}

func (a *fakeAdapter) FetchEnvironment(context.Context, string) (domain.EnvironmentReading, error) {
	appendCall(a.calls, "fetch-environment")
	if a.environmentFunc != nil {
		return a.environment, a.environmentFunc()
	}
	return a.environment, a.environmentErr
}
func (a *fakeAdapter) FetchAircon(context.Context, string) (domain.AirconReading, error) {
	appendCall(a.calls, "fetch-aircon")
	return a.aircon, a.airconErr
}

type fakeStore struct {
	calls            *[]string
	savedEnvironment bool
	savedAircon      bool
	completed        bool
}

func (s *fakeStore) StartCollectionRun(context.Context, time.Time) (int64, error) {
	appendCall(s.calls, "start")
	return 42, nil
}
func (s *fakeStore) SaveEnvironment(context.Context, int64, time.Time, domain.EnvironmentReading) error {
	appendCall(s.calls, "save-environment")
	s.savedEnvironment = true
	return nil
}
func (s *fakeStore) SaveAircon(context.Context, int64, time.Time, domain.AirconReading) error {
	appendCall(s.calls, "save-aircon")
	s.savedAircon = true
	return nil
}
func (s *fakeStore) CompleteCollectionRun(_ context.Context, _ domain.CollectionResult) error {
	appendCall(s.calls, "complete")
	s.completed = true
	return nil
}

type fakeReporter struct{ device, appliance *bool }

func (r *fakeReporter) SetDeviceTargetValid(value bool)    { r.device = boolPtr(value) }
func (r *fakeReporter) SetApplianceTargetValid(value bool) { r.appliance = boolPtr(value) }

type fakeRunner struct {
	mu                 sync.Mutex
	calls, cancelAfter int
	cancel             context.CancelFunc
}

func (r *fakeRunner) Run(context.Context) (domain.CollectionResult, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.calls++
	if r.calls == r.cancelAfter {
		r.cancel()
	}
	return domain.CollectionResult{}, nil
}

type fixedLimiter struct{ next time.Time }

func (l fixedLimiter) NextAllowedAt() time.Time { return l.next }

func appendCall(calls *[]string, call string) {
	if calls != nil {
		*calls = append(*calls, call)
	}
}
func boolPtr(value bool) *bool { return &value }
