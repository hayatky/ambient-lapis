package collector

import (
	"context"
	"errors"
	"time"

	"github.com/hayatky/ambient-lapis/backend/internal/domain"
)

type Runner interface {
	Run(context.Context) (domain.CollectionResult, error)
}

type RateLimiter interface {
	NextAllowedAt() time.Time
}

type WaitFunc func(context.Context, time.Duration) error

type Scheduler struct {
	runner   Runner
	limiter  RateLimiter
	interval time.Duration
	now      NowFunc
	wait     WaitFunc
}

func NewScheduler(runner Runner, limiter RateLimiter, interval time.Duration, now NowFunc, wait WaitFunc) (*Scheduler, error) {
	if runner == nil || interval <= 0 {
		return nil, errors.New("scheduler runner and positive interval are required")
	}
	if now == nil {
		now = time.Now
	}
	if wait == nil {
		wait = waitContext
	}
	return &Scheduler{runner: runner, limiter: limiter, interval: interval, now: now, wait: wait}, nil
}

// Run performs the first collection immediately and then uses fixed delay: the
// interval starts only after the previous run completes.
func (s *Scheduler) Run(ctx context.Context) error {
	for {
		if ctx.Err() != nil {
			return nil
		}
		_, _ = s.runner.Run(ctx) // a collection failure must not stop future cycles
		if ctx.Err() != nil {
			return nil
		}
		delay := s.interval
		if s.limiter != nil {
			untilReset := s.limiter.NextAllowedAt().Sub(s.now())
			if untilReset > delay {
				delay = untilReset
			}
		}
		if err := s.wait(ctx, delay); err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return err
		}
	}
}

func waitContext(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
