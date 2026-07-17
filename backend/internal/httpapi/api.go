package httpapi

import (
	"net/http"
	"time"
)

type responseMeta struct {
	RequestID   string `json:"requestId"`
	GeneratedAt string `json:"generatedAt"`
	Timezone    string `json:"timezone,omitempty"`
	From        string `json:"from,omitempty"`
	To          string `json:"to,omitempty"`
	Limit       int    `json:"limit,omitempty"`
	Truncated   *bool  `json:"truncated,omitempty"`
}

type successResponse struct {
	Data any          `json:"data"`
	Meta responseMeta `json:"meta"`
}

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Field   string `json:"field,omitempty"`
}

type errorResponse struct {
	Error errorBody    `json:"error"`
	Meta  responseMeta `json:"meta"`
}

func (h *Handler) status(w http.ResponseWriter, r *http.Request) {
	if !h.requireGET(w, r, "no-store") || !h.requireService(w, r) {
		return
	}
	now := h.clock.Now().UTC()
	data, err := h.queries.Status(r.Context(), now)
	if err != nil {
		h.writeServiceError(w, r, err)
		return
	}
	h.writeSuccess(w, r, data, h.meta(r, now, true))
}

func (h *Handler) current(w http.ResponseWriter, r *http.Request) {
	if !h.requireGET(w, r, "no-store") || !h.requireService(w, r) {
		return
	}
	now := h.clock.Now().UTC()
	data, err := h.queries.Current(r.Context(), now)
	if err != nil {
		h.writeServiceError(w, r, err)
		return
	}
	h.writeSuccess(w, r, data, h.meta(r, now, true))
}

func (h *Handler) environmentSeries(w http.ResponseWriter, r *http.Request) {
	if !h.requireGET(w, r, "private, max-age=30") || !h.requireService(w, r) {
		return
	}
	from, to, ok := h.parseRange(w, r)
	if !ok {
		return
	}
	resolution := r.URL.Query().Get("resolution")
	if resolution == "" {
		resolution = "auto"
	}
	if !validResolution(resolution) {
		h.writeError(w, r, http.StatusBadRequest, "invalid_parameter", "resolution must be one of auto, raw, 15m, 1h, or 1d", "resolution")
		return
	}
	data, err := h.queries.EnvironmentSeries(r.Context(), SeriesQuery{RangeQuery: RangeQuery{From: from, To: to, Limit: MaxItems}, Resolution: resolution})
	if err != nil {
		h.writeServiceError(w, r, err)
		return
	}
	now := h.clock.Now().UTC()
	meta := h.meta(r, now, true)
	meta.From, meta.To, meta.Limit = formatTime(from), formatTime(to), MaxItems
	truncated := false
	meta.Truncated = &truncated
	h.writeSuccess(w, r, data, meta)
}

func (h *Handler) airconSeries(w http.ResponseWriter, r *http.Request) {
	if !h.requireGET(w, r, "private, max-age=30") || !h.requireService(w, r) {
		return
	}
	from, to, ok := h.parseRange(w, r)
	if !ok {
		return
	}
	data, err := h.queries.AirconSeries(r.Context(), RangeQuery{From: from, To: to, Limit: MaxItems})
	if err != nil {
		h.writeServiceError(w, r, err)
		return
	}
	meta := h.meta(r, h.clock.Now().UTC(), true)
	meta.Limit = MaxItems
	truncated := false
	meta.Truncated = &truncated
	h.writeSuccess(w, r, data, meta)
}

func (h *Handler) dailySummary(w http.ResponseWriter, r *http.Request) {
	if !h.requireGET(w, r, "private, max-age=30") || !h.requireService(w, r) {
		return
	}
	from, to, ok := h.parseRange(w, r)
	if !ok {
		return
	}
	data, err := h.queries.DailySummary(r.Context(), RangeQuery{From: from, To: to, Limit: MaxItems})
	if err != nil {
		h.writeServiceError(w, r, err)
		return
	}
	meta := h.meta(r, h.clock.Now().UTC(), true)
	meta.Limit = MaxItems
	truncated := false
	meta.Truncated = &truncated
	h.writeSuccess(w, r, data, meta)
}

func (h *Handler) requireService(w http.ResponseWriter, r *http.Request) bool {
	if h.queries != nil && h.readiness != nil && h.readiness.Snapshot().Ready() {
		return true
	}
	h.writeError(w, r, http.StatusServiceUnavailable, "not_ready", "service is not ready", "")
	return false
}

func (h *Handler) parseRange(w http.ResponseWriter, r *http.Request) (time.Time, time.Time, bool) {
	values := r.URL.Query()
	fromRaw, toRaw := values.Get("from"), values.Get("to")
	if fromRaw == "" {
		h.writeError(w, r, http.StatusBadRequest, "invalid_parameter", "from is required", "from")
		return time.Time{}, time.Time{}, false
	}
	if toRaw == "" {
		h.writeError(w, r, http.StatusBadRequest, "invalid_parameter", "to is required", "to")
		return time.Time{}, time.Time{}, false
	}
	from, err := time.Parse(time.RFC3339, fromRaw)
	if err != nil {
		h.writeError(w, r, http.StatusBadRequest, "invalid_parameter", "from must be an RFC 3339 timestamp", "from")
		return time.Time{}, time.Time{}, false
	}
	to, err := time.Parse(time.RFC3339, toRaw)
	if err != nil {
		h.writeError(w, r, http.StatusBadRequest, "invalid_parameter", "to must be an RFC 3339 timestamp", "to")
		return time.Time{}, time.Time{}, false
	}
	if !from.Before(to) {
		h.writeError(w, r, http.StatusUnprocessableEntity, "invalid_range", "from must be earlier than to", "from")
		return time.Time{}, time.Time{}, false
	}
	if to.After(from.AddDate(10, 0, 0)) {
		h.writeError(w, r, http.StatusUnprocessableEntity, "range_too_large", "range must not exceed 10 years", "to")
		return time.Time{}, time.Time{}, false
	}
	return from.UTC(), to.UTC(), true
}

func validResolution(value string) bool {
	switch value {
	case "auto", "raw", "15m", "1h", "1d":
		return true
	}
	return false
}

func (h *Handler) meta(r *http.Request, now time.Time, includeTimezone bool) responseMeta {
	m := responseMeta{RequestID: requestIDFrom(r.Context()), GeneratedAt: formatTime(now)}
	if includeTimezone {
		m.Timezone = h.timezone
	}
	return m
}

func formatTime(value time.Time) string { return value.UTC().Format(time.RFC3339Nano) }

func (h *Handler) writeSuccess(w http.ResponseWriter, r *http.Request, data any, meta responseMeta) {
	h.writeJSON(w, http.StatusOK, successResponse{Data: data, Meta: meta})
}

func (h *Handler) writeServiceError(w http.ResponseWriter, r *http.Request, err error) {
	if serviceErr, ok := AsServiceError(err); ok {
		status := serviceErr.Status
		if status < 400 || status > 599 {
			status = http.StatusInternalServerError
		}
		message := serviceErr.Message
		if message == "" {
			message = "request failed"
		}
		h.writeError(w, r, status, serviceErr.Code, message, serviceErr.Field)
		return
	}
	h.logger.ErrorContext(r.Context(), "API query failed", "event", "api_query_failed", "requestId", requestIDFrom(r.Context()), "error", err)
	h.writeError(w, r, http.StatusInternalServerError, "internal_error", "internal server error", "")
}

func (h *Handler) writeError(w http.ResponseWriter, r *http.Request, status int, code, message, field string) {
	h.writeJSON(w, status, errorResponse{Error: errorBody{Code: code, Message: message, Field: field}, Meta: h.meta(r, h.clock.Now().UTC(), false)})
}
