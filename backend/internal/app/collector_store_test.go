package app

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/hayatky/ambient-lapis/backend/internal/domain"
	"github.com/hayatky/ambient-lapis/backend/internal/store"
)

type failingCollectionStore struct{ err error }

func (s failingCollectionStore) StartCollectionRun(context.Context, time.Time) (int64, error) {
	return 0, s.err
}
func (s failingCollectionStore) SaveEnvironment(context.Context, store.EnvironmentSample) error {
	return s.err
}
func (s failingCollectionStore) SaveAircon(context.Context, store.AirconSample) error { return s.err }
func (s failingCollectionStore) FinalizeCollectionRun(context.Context, store.RunFinalization) error {
	return s.err
}

func TestCollectorStoreFailureDropsDatabaseReadiness(t *testing.T) {
	readiness := fullyReady()
	adapter := newCollectorStoreAdapter(failingCollectionStore{err: errors.New("disk unavailable")}, readiness)
	if _, err := adapter.StartCollectionRun(context.Background(), time.Now()); err == nil {
		t.Fatal("expected failure")
	}
	if readiness.Snapshot().Database {
		t.Fatal("database must become unready")
	}
	readiness.SetDatabase(true)
	if err := adapter.SaveEnvironment(context.Background(), 1, time.Now(), domain.EnvironmentReading{}); err == nil {
		t.Fatal("expected failure")
	}
	if readiness.Snapshot().Database {
		t.Fatal("database must become unready")
	}
	readiness.SetDatabase(true)
	if err := adapter.CompleteCollectionRun(context.Background(), domain.CollectionResult{}); err == nil {
		t.Fatal("expected failure")
	}
	if readiness.Snapshot().Database {
		t.Fatal("database must become unready")
	}
}

type recoveringCollectionStore struct{ err error }

func (s *recoveringCollectionStore) StartCollectionRun(context.Context, time.Time) (int64, error) {
	return 1, s.err
}
func (s *recoveringCollectionStore) SaveEnvironment(context.Context, store.EnvironmentSample) error {
	return s.err
}
func (s *recoveringCollectionStore) SaveAircon(context.Context, store.AirconSample) error {
	return s.err
}
func (s *recoveringCollectionStore) FinalizeCollectionRun(context.Context, store.RunFinalization) error {
	return s.err
}

func TestCollectorStoreSuccessfulProbeRecoversDatabaseReadiness(t *testing.T) {
	readiness := fullyReady()
	backend := &recoveringCollectionStore{err: errors.New("temporary failure")}
	adapter := newCollectorStoreAdapter(backend, readiness)
	_, _ = adapter.StartCollectionRun(context.Background(), time.Now())
	if readiness.Snapshot().Database {
		t.Fatal("database should be unready after failure")
	}
	backend.err = nil
	if _, err := adapter.StartCollectionRun(context.Background(), time.Now()); err != nil {
		t.Fatal(err)
	}
	if !readiness.Snapshot().Database {
		t.Fatal("successful database operation should recover readiness")
	}
}
