CREATE TABLE schema_migrations (
    version     TEXT PRIMARY KEY,
    checksum    TEXT NOT NULL,
    applied_at  INTEGER NOT NULL
);

CREATE TABLE collection_runs (
    id                       INTEGER PRIMARY KEY,
    started_at               INTEGER NOT NULL,
    completed_at             INTEGER,
    overall_status           TEXT NOT NULL CHECK (overall_status IN ('running', 'success', 'partial', 'error', 'cancelled')),
    devices_status           TEXT NOT NULL CHECK (devices_status IN ('pending', 'success', 'error', 'skipped')),
    devices_error_code       TEXT,
    devices_error_detail     TEXT,
    appliances_status        TEXT NOT NULL CHECK (appliances_status IN ('pending', 'success', 'error', 'skipped')),
    appliances_error_code    TEXT,
    appliances_error_detail  TEXT,
    rate_limit_reset_at      INTEGER,
    CHECK (completed_at IS NULL OR completed_at >= started_at),
    CHECK ((overall_status = 'running' AND completed_at IS NULL) OR (overall_status <> 'running' AND completed_at IS NOT NULL))
);

CREATE INDEX idx_collection_runs_completed ON collection_runs(completed_at DESC);
CREATE INDEX idx_collection_runs_status_completed ON collection_runs(overall_status, completed_at DESC);

CREATE TABLE environment_samples (
    id                       INTEGER PRIMARY KEY,
    collection_run_id        INTEGER NOT NULL,
    device_id                TEXT NOT NULL,
    fetched_at               INTEGER NOT NULL,
    device_online            INTEGER CHECK (device_online IN (0, 1)),
    temperature_c            REAL,
    temperature_observed_at  INTEGER,
    humidity_pct             REAL CHECK (humidity_pct IS NULL OR (humidity_pct >= 0 AND humidity_pct <= 100)),
    humidity_observed_at     INTEGER,
    FOREIGN KEY (collection_run_id) REFERENCES collection_runs(id) ON DELETE RESTRICT,
    UNIQUE (collection_run_id, device_id)
);

CREATE INDEX idx_environment_samples_device_fetched ON environment_samples(device_id, fetched_at DESC);
CREATE INDEX idx_environment_samples_temperature_observed ON environment_samples(device_id, temperature_observed_at);
CREATE INDEX idx_environment_samples_humidity_observed ON environment_samples(device_id, humidity_observed_at);

CREATE TABLE aircon_samples (
    id                        INTEGER PRIMARY KEY,
    collection_run_id         INTEGER NOT NULL,
    appliance_id              TEXT NOT NULL,
    fetched_at                INTEGER NOT NULL,
    settings_updated_at       INTEGER,
    power_state               TEXT NOT NULL CHECK (power_state IN ('on', 'off', 'unknown')),
    button_raw                TEXT NOT NULL,
    mode_raw                  TEXT,
    target_temperature_raw    REAL,
    temperature_unit_raw      TEXT,
    target_temperature_c      REAL,
    volume_raw                TEXT,
    direction_vertical_raw    TEXT,
    direction_horizontal_raw  TEXT,
    FOREIGN KEY (collection_run_id) REFERENCES collection_runs(id) ON DELETE RESTRICT,
    UNIQUE (collection_run_id, appliance_id)
);

CREATE INDEX idx_aircon_samples_appliance_fetched ON aircon_samples(appliance_id, fetched_at DESC);
CREATE INDEX idx_aircon_samples_power_fetched ON aircon_samples(appliance_id, power_state, fetched_at);
