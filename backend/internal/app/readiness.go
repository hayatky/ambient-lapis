package app

import (
	"sync"

	"github.com/hayatky/ambient-lapis/backend/internal/httpapi"
)

// Readiness is shared by startup, the collector's target-selection callbacks,
// and the HTTP server. Device and appliance selection are tracked separately so
// one successful endpoint cannot conceal a known mismatch on the other.
type Readiness struct {
	mu sync.RWMutex

	configuration   bool
	deviceTarget    bool
	applianceTarget bool
	database        bool
	migrations      bool
	backupDirectory bool
}

func NewReadiness() *Readiness { return &Readiness{} }

func (r *Readiness) SetConfiguration(ok bool)     { r.mu.Lock(); r.configuration = ok; r.mu.Unlock() }
func (r *Readiness) SetDeviceTargetValid(ok bool) { r.mu.Lock(); r.deviceTarget = ok; r.mu.Unlock() }
func (r *Readiness) SetApplianceTargetValid(ok bool) {
	r.mu.Lock()
	r.applianceTarget = ok
	r.mu.Unlock()
}
func (r *Readiness) SetDatabase(ok bool)        { r.mu.Lock(); r.database = ok; r.mu.Unlock() }
func (r *Readiness) SetMigrations(ok bool)      { r.mu.Lock(); r.migrations = ok; r.mu.Unlock() }
func (r *Readiness) SetBackupDirectory(ok bool) { r.mu.Lock(); r.backupDirectory = ok; r.mu.Unlock() }

func (r *Readiness) Snapshot() httpapi.ReadinessSnapshot {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return httpapi.ReadinessSnapshot{
		Configuration:   r.configuration,
		TargetSelection: r.deviceTarget && r.applianceTarget,
		Database:        r.database,
		Migrations:      r.migrations,
		BackupDirectory: r.backupDirectory,
	}
}
