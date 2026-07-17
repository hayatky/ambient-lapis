package nature

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"math/big"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/hayatky/ambient-lapis/backend/internal/domain"
)

const (
	DefaultBaseURL = "https://api.nature.global"
	maxBodyBytes   = 2 << 20
	maxRateWait    = 15 * time.Minute
)

type SleepFunc func(context.Context, time.Duration) error
type JitterFunc func(time.Duration) time.Duration
type NowFunc func() time.Time

type Event struct {
	Name    string
	Attempt int
	Delay   time.Duration
	Code    string
}

type EventFunc func(Event)

type Options struct {
	BaseURL           string
	Token             string
	Version           string
	Timeout           time.Duration
	Transport         http.RoundTripper
	Sleep             SleepFunc
	Jitter            JitterFunc
	Now               NowFunc
	RateLimitFallback time.Duration
	Event             EventFunc
}

type Client struct {
	baseURL           *url.URL
	token             string
	userAgent         string
	http              *http.Client
	sleep             SleepFunc
	jitter            JitterFunc
	now               NowFunc
	rateLimitFallback time.Duration
	event             EventFunc

	mu            sync.Mutex
	nextAllowedAt time.Time
}

func NewClient(options Options) (*Client, error) {
	base := options.BaseURL
	if base == "" {
		base = DefaultBaseURL
	}
	baseURL, err := url.Parse(base)
	if err != nil || baseURL.Scheme != "https" || baseURL.Host == "" {
		return nil, errors.New("Nature API base URL must be an absolute HTTPS URL")
	}
	if strings.TrimSpace(options.Token) == "" {
		return nil, errors.New("Nature API token is required")
	}
	if options.Timeout <= 0 {
		return nil, errors.New("Nature API timeout must be positive")
	}
	transport := options.Transport
	if transport == nil {
		transport = http.DefaultTransport
	}
	version := strings.TrimSpace(options.Version)
	if version == "" {
		version = "dev"
	}
	c := &Client{
		baseURL:           baseURL,
		token:             strings.TrimSpace(options.Token),
		userAgent:         "ambient-lapis/" + version,
		sleep:             options.Sleep,
		jitter:            options.Jitter,
		now:               options.Now,
		rateLimitFallback: options.RateLimitFallback,
		event:             options.Event,
	}
	if c.sleep == nil {
		c.sleep = sleepContext
	}
	if c.jitter == nil {
		c.jitter = boundedJitter
	}
	if c.now == nil {
		c.now = time.Now
	}
	if c.rateLimitFallback <= 0 {
		c.rateLimitFallback = 5 * time.Minute
	}
	if c.rateLimitFallback > maxRateWait {
		c.rateLimitFallback = maxRateWait
	}
	c.http = &http.Client{
		Transport: transport,
		Timeout:   options.Timeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) > 3 {
				return errors.New("too many redirects")
			}
			if req.URL.Scheme != "https" || !sameHost(req.URL, baseURL) {
				return errors.New("redirect must remain HTTPS on the Nature API host")
			}
			req.Header.Set("Authorization", "Bearer "+c.token)
			req.Header.Set("User-Agent", "ambient-lapis/"+version)
			return nil
		},
	}
	return c, nil
}

func (c *Client) FetchEnvironment(ctx context.Context, deviceID string) (domain.EnvironmentReading, error) {
	body, err := c.get(ctx, "/1/devices")
	if err != nil {
		return domain.EnvironmentReading{}, err
	}
	return parseEnvironmentWithEvent(body, deviceID, c.emit)
}

func (c *Client) FetchAircon(ctx context.Context, applianceID string) (domain.AirconReading, error) {
	body, err := c.get(ctx, "/1/appliances")
	if err != nil {
		return domain.AirconReading{}, err
	}
	return parseAirconWithEvent(body, applianceID, c.emit)
}

func (c *Client) NextAllowedAt() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.nextAllowedAt
}

func (c *Client) get(ctx context.Context, path string) ([]byte, error) {
	if reset := c.NextAllowedAt(); reset.After(c.now()) {
		return nil, &APIError{Code: CodeRateLimited, Detail: "request deferred by rate limit", RateLimitResetAt: ptrTime(reset)}
	}

	var retries5xx, retriesNetwork int
	for {
		body, status, err := c.do(ctx, path)
		if err == nil && status >= 200 && status < 300 {
			return body, nil
		}
		if ctx.Err() != nil {
			return nil, &APIError{Code: CodeCancelled, Detail: "request cancelled", Cause: ctx.Err()}
		}
		if err != nil {
			apiErr := classifyTransportError(err)
			if !apiErr.Temporary {
				return nil, apiErr
			}
			if retriesNetwork < 1 {
				retriesNetwork++
				delay := c.jitter(5 * time.Second)
				c.emit(Event{Name: "upstream_retry", Attempt: retriesNetwork, Delay: delay, Code: apiErr.Code})
				if sleepErr := c.sleep(ctx, delay); sleepErr != nil {
					return nil, &APIError{Code: CodeCancelled, Detail: "retry cancelled", Cause: sleepErr}
				}
				continue
			}
			return nil, apiErr
		}

		switch {
		case status == http.StatusUnauthorized || status == http.StatusForbidden:
			return nil, &APIError{Code: CodeUnauthorized, Detail: fmt.Sprintf("HTTP %d", status)}
		case status == http.StatusTooManyRequests:
			reset := c.NextAllowedAt()
			return nil, &APIError{Code: CodeRateLimited, Detail: "HTTP 429", RateLimitResetAt: optionalFuture(reset)}
		case status >= 400 && status < 500:
			return nil, &APIError{Code: CodeClientError, Detail: fmt.Sprintf("HTTP %d", status)}
		case status >= 500 && status <= 599:
			if retries5xx < 2 {
				delays := [...]time.Duration{5 * time.Second, 15 * time.Second}
				delay := c.jitter(delays[retries5xx])
				retries5xx++
				c.emit(Event{Name: "upstream_retry", Attempt: retries5xx, Delay: delay, Code: CodeUpstreamError})
				if sleepErr := c.sleep(ctx, delay); sleepErr != nil {
					return nil, &APIError{Code: CodeCancelled, Detail: "retry cancelled", Cause: sleepErr}
				}
				continue
			}
			return nil, &APIError{Code: CodeUpstreamError, Detail: fmt.Sprintf("HTTP %d", status), Temporary: true}
		default:
			return nil, &APIError{Code: CodeUpstreamError, Detail: fmt.Sprintf("unexpected HTTP %d", status)}
		}
	}
}

func (c *Client) do(ctx context.Context, path string) ([]byte, int, error) {
	endpoint := c.baseURL.ResolveReference(&url.URL{Path: path})
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("User-Agent", c.userAgent)
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	c.observeRateLimit(resp.Header, resp.StatusCode == http.StatusTooManyRequests)

	limited := io.LimitReader(resp.Body, maxBodyBytes+1)
	body, err := io.ReadAll(limited)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	if len(body) > maxBodyBytes {
		return nil, resp.StatusCode, &APIError{Code: CodeSchemaMismatch, Detail: "response exceeds 2 MiB"}
	}
	return body, resp.StatusCode, nil
}

func (c *Client) observeRateLimit(header http.Header, force bool) {
	remaining, remainingErr := strconv.Atoi(strings.TrimSpace(header.Get("X-Rate-Limit-Remaining")))
	if !force && (remainingErr != nil || remaining > 10) {
		return
	}
	now := c.now()
	reset, ok := parseReset(header.Get("X-Rate-Limit-Reset"))
	if !ok || !reset.After(now) {
		reset = now.Add(c.rateLimitFallback)
	}
	if reset.After(now.Add(maxRateWait)) {
		reset = now.Add(maxRateWait)
	}
	c.mu.Lock()
	if reset.After(c.nextAllowedAt) {
		c.nextAllowedAt = reset
	}
	c.mu.Unlock()
	c.emit(Event{Name: "upstream_rate_limited", Delay: reset.Sub(now), Code: CodeRateLimited})
}

func parseEnvironment(body []byte, targetID string) (domain.EnvironmentReading, error) {
	return parseEnvironmentWithEvent(body, targetID, nil)
}

func parseEnvironmentWithEvent(body []byte, targetID string, emit EventFunc) (domain.EnvironmentReading, error) {
	var devices []struct {
		ID           string                     `json:"id"`
		Online       *bool                      `json:"online"`
		NewestEvents map[string]json.RawMessage `json:"newest_events"`
	}
	if err := decodeStrictTop(body, &devices); err != nil {
		return domain.EnvironmentReading{}, err
	}
	for _, device := range devices {
		if device.ID != targetID {
			continue
		}
		reading := domain.EnvironmentReading{DeviceID: device.ID, Online: device.Online}
		reading.TemperatureC, reading.TemperatureObservedAt = parseEvent(device.NewestEvents["te"], -50, 100, emit)
		reading.HumidityPct, reading.HumidityObservedAt = parseEvent(device.NewestEvents["hu"], 0, 100, emit)
		return reading, nil
	}
	return domain.EnvironmentReading{}, &APIError{Code: CodeTargetNotFound, Detail: "configured device was not present"}
}

func parseAircon(body []byte, targetID string) (domain.AirconReading, error) {
	return parseAirconWithEvent(body, targetID, nil)
}

func parseAirconWithEvent(body []byte, targetID string, emit EventFunc) (domain.AirconReading, error) {
	var appliances []struct {
		ID       string          `json:"id"`
		Settings json.RawMessage `json:"settings"`
	}
	if err := decodeStrictTop(body, &appliances); err != nil {
		return domain.AirconReading{}, err
	}
	for _, appliance := range appliances {
		if appliance.ID != targetID {
			continue
		}
		return normalizeAirconWithEvent(appliance.ID, appliance.Settings, emit)
	}
	return domain.AirconReading{}, &APIError{Code: CodeTargetNotFound, Detail: "configured appliance was not present"}
}

func normalizeAircon(id string, raw json.RawMessage) (domain.AirconReading, error) {
	return normalizeAirconWithEvent(id, raw, nil)
}

func normalizeAirconWithEvent(id string, raw json.RawMessage, emit EventFunc) (domain.AirconReading, error) {
	if len(raw) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return domain.AirconReading{}, &APIError{Code: CodeSchemaMismatch, Detail: "appliance settings are missing"}
	}
	var settings struct {
		Button    *string         `json:"button"`
		Mode      *string         `json:"mode"`
		Temp      json.RawMessage `json:"temp"`
		TempUnit  *string         `json:"temp_unit"`
		Volume    *string         `json:"vol"`
		Direction *string         `json:"dir"`
		DirH      *string         `json:"dirh"`
		UpdatedAt *string         `json:"updated_at"`
	}
	if err := json.Unmarshal(raw, &settings); err != nil {
		return domain.AirconReading{}, &APIError{Code: CodeSchemaMismatch, Detail: "invalid appliance settings"}
	}
	button := ""
	state := domain.PowerStateUnknown
	if settings.Button != nil {
		button = *settings.Button
		switch button {
		case "":
			state = domain.PowerStateOn
		case "power-off":
			state = domain.PowerStateOff
		}
	}
	rawTemp := parseNumberOrString(settings.Temp)
	if len(settings.Temp) > 0 && rawTemp == nil && !bytes.Equal(bytes.TrimSpace(settings.Temp), []byte("null")) {
		emitEvent(emit, Event{Name: "value_rejected", Code: "invalid_temperature"})
	}
	var celsius *float64
	if rawTemp != nil && settings.TempUnit != nil {
		switch strings.ToLower(*settings.TempUnit) {
		case "c":
			celsius = ptrFloat(*rawTemp)
		case "f":
			celsius = ptrFloat((*rawTemp - 32) * 5 / 9)
		default:
			emitEvent(emit, Event{Name: "value_rejected", Code: "unsupported_temperature_unit"})
		}
	}
	updatedAt := parseTime(settings.UpdatedAt)
	if settings.UpdatedAt != nil && updatedAt == nil {
		emitEvent(emit, Event{Name: "value_rejected", Code: "invalid_time"})
	}
	return domain.AirconReading{
		ApplianceID:            id,
		SettingsUpdatedAt:      updatedAt,
		PowerState:             state,
		ButtonRaw:              button,
		ModeRaw:                settings.Mode,
		TargetTemperatureRaw:   rawTemp,
		TemperatureUnitRaw:     settings.TempUnit,
		TargetTemperatureC:     celsius,
		VolumeRaw:              settings.Volume,
		DirectionVerticalRaw:   settings.Direction,
		DirectionHorizontalRaw: settings.DirH,
	}, nil
}

func decodeStrictTop(body []byte, destination any) error {
	decoder := json.NewDecoder(bytes.NewReader(body))
	if err := decoder.Decode(destination); err != nil {
		var syntaxErr *json.SyntaxError
		if errors.As(err, &syntaxErr) || errors.Is(err, io.ErrUnexpectedEOF) {
			return &APIError{Code: CodeInvalidJSON, Detail: "response is not valid JSON", Cause: err}
		}
		return &APIError{Code: CodeSchemaMismatch, Detail: "response has an unexpected top-level structure", Cause: err}
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return &APIError{Code: CodeInvalidJSON, Detail: "response contains trailing JSON"}
	}
	return nil
}

func parseEvent(raw json.RawMessage, minimum, maximum float64, emit EventFunc) (*float64, *time.Time) {
	if len(raw) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil, nil
	}
	var event struct {
		Value     json.RawMessage `json:"val"`
		CreatedAt *string         `json:"created_at"`
	}
	if json.Unmarshal(raw, &event) != nil {
		emitEvent(emit, Event{Name: "value_rejected", Code: "invalid_event"})
		return nil, nil
	}
	value := parseJSONNumber(event.Value)
	if len(event.Value) > 0 && value == nil && !bytes.Equal(bytes.TrimSpace(event.Value), []byte("null")) {
		emitEvent(emit, Event{Name: "value_rejected", Code: "invalid_value"})
	} else if value != nil && (*value < minimum || *value > maximum) {
		emitEvent(emit, Event{Name: "value_rejected", Code: "value_out_of_range"})
		value = nil
	}
	observedAt := parseTime(event.CreatedAt)
	if event.CreatedAt != nil && observedAt == nil {
		emitEvent(emit, Event{Name: "value_rejected", Code: "invalid_time"})
	}
	return value, observedAt
}

func parseJSONNumber(raw json.RawMessage) *float64 {
	if len(raw) == 0 {
		return nil
	}
	var number float64
	if json.Unmarshal(raw, &number) != nil || math.IsNaN(number) || math.IsInf(number, 0) {
		return nil
	}
	return &number
}

func parseNumberOrString(raw json.RawMessage) *float64 {
	if number := parseJSONNumber(raw); number != nil {
		return number
	}
	var text string
	if json.Unmarshal(raw, &text) != nil || strings.TrimSpace(text) == "" {
		return nil
	}
	number, err := strconv.ParseFloat(strings.TrimSpace(text), 64)
	if err != nil || math.IsNaN(number) || math.IsInf(number, 0) {
		return nil
	}
	return &number
}

func parseTime(value *string) *time.Time {
	if value == nil {
		return nil
	}
	parsed, err := time.Parse(time.RFC3339Nano, *value)
	if err != nil {
		return nil
	}
	parsed = parsed.UTC()
	return &parsed
}

func classifyTransportError(err error) *APIError {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return &APIError{Code: CodeTimeout, Detail: "request timed out", Temporary: true, Cause: err}
	}
	return &APIError{Code: CodeNetworkError, Detail: "network request failed", Temporary: true, Cause: err}
}

func parseReset(value string) (time.Time, bool) {
	seconds, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	if err != nil {
		return time.Time{}, false
	}
	return time.Unix(seconds, 0).UTC(), true
}

func sameHost(a, b *url.URL) bool {
	return strings.EqualFold(a.Hostname(), b.Hostname()) && a.Port() == b.Port()
}
func ptrTime(value time.Time) *time.Time { return &value }
func ptrFloat(value float64) *float64    { return &value }
func optionalFuture(value time.Time) *time.Time {
	if value.IsZero() {
		return nil
	}
	return &value
}

func sleepContext(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func boundedJitter(delay time.Duration) time.Duration {
	if delay <= 0 {
		return delay
	}
	n, err := rand.Int(rand.Reader, big.NewInt(41))
	if err != nil {
		return delay
	}
	percent := 80 + n.Int64()
	return time.Duration(int64(delay) * percent / 100)
}

func (c *Client) emit(event Event) {
	emitEvent(c.event, event)
}

func emitEvent(callback EventFunc, event Event) {
	if callback != nil {
		callback(event)
	}
}
