package app

import "testing"

func TestReadinessKeepsTargetChecksIndependent(t *testing.T) {
	r := NewReadiness()
	r.SetConfiguration(true)
	r.SetDatabase(true)
	r.SetMigrations(true)
	r.SetBackupDirectory(true)
	r.SetDeviceTargetValid(true)
	if r.Snapshot().Ready() {
		t.Fatal("one target must not make readiness pass")
	}
	r.SetApplianceTargetValid(true)
	if !r.Snapshot().Ready() {
		t.Fatal("all checks should make readiness pass")
	}
	r.SetDeviceTargetValid(false)
	if r.Snapshot().Ready() {
		t.Fatal("device mismatch must make readiness fail")
	}
}
