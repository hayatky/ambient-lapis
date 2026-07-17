package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"
)

type Dependencies struct {
	Version   string
	Timezone  string
	Clock     Clock
	Readiness Readiness
	Queries   QueryService
	Logger    *slog.Logger
}

type Handler struct {
	version   string
	timezone  string
	clock     Clock
	readiness Readiness
	queries   QueryService
	logger    *slog.Logger
	mux       *http.ServeMux
}

func New(deps Dependencies) *Handler {
	if deps.Version == "" {
		deps.Version = "dev"
	}
	if deps.Timezone == "" {
		deps.Timezone = Timezone
	}
	if deps.Clock == nil {
		deps.Clock = ClockFunc(time.Now)
	}
	if deps.Logger == nil {
		deps.Logger = slog.Default()
	}
	h := &Handler{
		version: deps.Version, timezone: deps.Timezone, clock: deps.Clock,
		readiness: deps.Readiness, queries: deps.Queries, logger: deps.Logger,
		mux: http.NewServeMux(),
	}
	h.mux.HandleFunc("/healthz", h.health)
	h.mux.HandleFunc("/readyz", h.ready)
	h.mux.HandleFunc("/api/v1/status", h.status)
	h.mux.HandleFunc("/api/v1/current", h.current)
	h.mux.HandleFunc("/api/v1/environment/series", h.environmentSeries)
	h.mux.HandleFunc("/api/v1/aircon/series", h.airconSeries)
	h.mux.HandleFunc("/api/v1/daily-summary", h.dailySummary)
	h.mux.HandleFunc("/", h.notFound)
	return h
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	started := h.clock.Now()
	requestID := newRequestID()
	rw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
	rw.Header().Set("X-Request-Id", requestID)
	r = r.WithContext(withRequestID(r.Context(), requestID))
	if len(r.URL.RawQuery) > 4096 {
		rw.Header().Set("Cache-Control", "no-store")
		h.writeError(rw, r, http.StatusBadRequest, "invalid_parameter", "query string is too long", "")
	} else {
		h.mux.ServeHTTP(rw, r)
	}
	h.logger.InfoContext(r.Context(), "request completed",
		"event", "request_completed", "requestId", requestID, "method", r.Method,
		"path", r.URL.Path, "status", rw.status,
		"durationMs", h.clock.Now().Sub(started).Milliseconds())
}

func (h *Handler) notFound(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	h.writeError(w, r, http.StatusNotFound, "not_found", "path not found", "")
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func (h *Handler) requireGET(w http.ResponseWriter, r *http.Request, cache string) bool {
	w.Header().Set("Cache-Control", cache)
	if r.Method == http.MethodGet {
		return true
	}
	w.Header().Set("Allow", http.MethodGet)
	h.writeError(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed", "")
	return false
}

func (h *Handler) health(w http.ResponseWriter, r *http.Request) {
	if !h.requireGET(w, r, "no-store") {
		return
	}
	h.writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "version": h.version})
}

func (h *Handler) ready(w http.ResponseWriter, r *http.Request) {
	if !h.requireGET(w, r, "no-store") {
		return
	}
	s := ReadinessSnapshot{}
	if h.readiness != nil {
		s = h.readiness.Snapshot()
	}
	checks := map[string]string{
		"configuration": statusName(s.Configuration), "targetSelection": statusName(s.TargetSelection),
		"database": statusName(s.Database), "migrations": statusName(s.Migrations),
		"backupDirectory": statusName(s.BackupDirectory),
	}
	status := http.StatusServiceUnavailable
	name := "not_ready"
	if s.Ready() {
		status, name = http.StatusOK, "ready"
	}
	h.writeJSON(w, status, map[string]any{"status": name, "checks": checks})
}

func statusName(ok bool) string {
	if ok {
		return "ok"
	}
	return "error"
}

func newRequestID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		// rand.Read only fails when the operating system CSPRNG is unavailable.
		// Avoid leaking process or host details in the fallback value.
		return "unavailable"
	}
	return hex.EncodeToString(b[:])
}

func (h *Handler) writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		h.logger.Error("response encoding failed", "event", "response_encoding_failed", "error", err)
	}
}
