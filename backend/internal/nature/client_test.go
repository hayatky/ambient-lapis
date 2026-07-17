package nature

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/hayatky/ambient-lapis/backend/internal/domain"
)

func TestParseEnvironmentSelectsExplicitTargetAndNormalizesValues(t *testing.T) {
	body := []byte(`[
      {"id":"other","online":false,"newest_events":{"te":{"val":99,"created_at":"2020-01-01T00:00:00Z"}}},
      {"id":"device-target","online":true,"newest_events":{
        "te":{"val":23.5,"created_at":"2026-07-18T12:00:00.123Z"},
        "hu":{"val":61,"created_at":"2026-07-18T12:01:00Z"}
      }}
    ]`)
	reading, err := parseEnvironment(body, "device-target")
	if err != nil {
		t.Fatalf("parseEnvironment: %v", err)
	}
	if reading.DeviceID != "device-target" || reading.Online == nil || !*reading.Online {
		t.Fatalf("unexpected identity/online: %+v", reading)
	}
	if reading.TemperatureC == nil || *reading.TemperatureC != 23.5 || reading.HumidityPct == nil || *reading.HumidityPct != 61 {
		t.Fatalf("unexpected values: %+v", reading)
	}
	if got := reading.TemperatureObservedAt.Format(time.RFC3339Nano); got != "2026-07-18T12:00:00.123Z" {
		t.Fatalf("temperature observed at = %q", got)
	}
}

func TestParseEnvironmentKeepsValidPartsAndRejectsInvalidValues(t *testing.T) {
	body := []byte(`[{
      "id":"device-target","online":null,"newest_events":{
        "te":{"val":101,"created_at":"not-a-time"},
        "hu":{"val":-1,"created_at":"2026-07-18T12:01:00Z"}
      }}]`)
	reading, err := parseEnvironment(body, "device-target")
	if err != nil {
		t.Fatalf("parseEnvironment: %v", err)
	}
	if reading.Online != nil || reading.TemperatureC != nil || reading.TemperatureObservedAt != nil || reading.HumidityPct != nil {
		t.Fatalf("invalid values must be nil: %+v", reading)
	}
	if reading.HumidityObservedAt == nil {
		t.Fatal("valid humidity time must be retained")
	}
}

func TestParseEnvironmentMissingAndWrongTypedEventsAreNullable(t *testing.T) {
	reading, err := parseEnvironment([]byte(`[{"id":"device-target","newest_events":{"te":{"val":"23.5"},"hu":null}}]`), "device-target")
	if err != nil {
		t.Fatalf("parseEnvironment: %v", err)
	}
	if reading.TemperatureC != nil || reading.HumidityPct != nil {
		t.Fatalf("non-number and null must be nil: %+v", reading)
	}
}

func TestParseEnvironmentErrors(t *testing.T) {
	tests := []struct {
		name string
		body string
		code string
	}{
		{"invalid JSON", `{`, CodeInvalidJSON},
		{"wrong top level", `{}`, CodeSchemaMismatch},
		{"not found", `[{"id":"another"}]`, CodeTargetNotFound},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := parseEnvironment([]byte(test.body), "device-target")
			if ErrorCode(err) != test.code {
				t.Fatalf("error = %v, code = %q", err, ErrorCode(err))
			}
		})
	}
}

func TestNormalizeAircon(t *testing.T) {
	tests := []struct {
		name      string
		settings  string
		wantState domain.PowerState
		wantRaw   *float64
		wantC     *float64
	}{
		{"on celsius string", `{"button":"","mode":"cool","temp":"25.5","temp_unit":"c","vol":"auto","dir":"swing","dirh":"left","updated_at":"2026-07-18T12:00:00Z","extra":{"ignored":true}}`, domain.PowerStateOn, floatPtr(25.5), floatPtr(25.5)},
		{"off fahrenheit number", `{"button":"power-off","mode":"warm","temp":77,"temp_unit":"f"}`, domain.PowerStateOff, floatPtr(77), floatPtr(25)},
		{"unknown button", `{"button":"unexpected","mode":"blow","temp":"","temp_unit":"x"}`, domain.PowerStateUnknown, nil, nil},
		{"missing button", `{"mode":"vendor-mode"}`, domain.PowerStateUnknown, nil, nil},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			reading, err := normalizeAircon("aircon-target", []byte(test.settings))
			if err != nil {
				t.Fatalf("normalizeAircon: %v", err)
			}
			if reading.PowerState != test.wantState || !equalFloat(reading.TargetTemperatureRaw, test.wantRaw) || !equalFloat(reading.TargetTemperatureC, test.wantC) {
				t.Fatalf("unexpected reading: %+v", reading)
			}
			if test.name == "on celsius string" && (reading.ModeRaw == nil || *reading.ModeRaw != "cool" || reading.SettingsUpdatedAt == nil) {
				t.Fatalf("raw values were not preserved: %+v", reading)
			}
		})
	}
}

func TestParseAirconSelectsExplicitTarget(t *testing.T) {
	reading, err := parseAircon([]byte(`[
      {"id":"other","settings":{"button":"power-off"}},
      {"id":"aircon-target","settings":{"button":"","mode":"cool"}}
    ]`), "aircon-target")
	if err != nil || reading.ApplianceID != "aircon-target" || reading.PowerState != domain.PowerStateOn {
		t.Fatalf("reading=%+v err=%v", reading, err)
	}
	_, err = parseAircon([]byte(`[{"id":"other","settings":{}}]`), "aircon-target")
	if ErrorCode(err) != CodeTargetNotFound {
		t.Fatalf("error = %v", err)
	}
}

func TestClientRequestHeadersAndResponse(t *testing.T) {
	var gotAuthorization, gotUserAgent string
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuthorization = r.Header.Get("Authorization")
		gotUserAgent = r.Header.Get("User-Agent")
		if r.URL.Path != "/1/devices" {
			t.Errorf("path = %q", r.URL.Path)
		}
		io.WriteString(w, `[{"id":"device-target","online":true}]`)
	}))
	defer server.Close()
	client := testClient(t, server, Options{Version: "0.1.0"})
	if _, err := client.FetchEnvironment(context.Background(), "device-target"); err != nil {
		t.Fatalf("FetchEnvironment: %v", err)
	}
	if gotAuthorization != "Bearer test-token" || gotUserAgent != "ambient-lapis/0.1.0" {
		t.Fatalf("headers authorization=%q user-agent=%q", gotAuthorization, gotUserAgent)
	}
}

func TestClientRetries5xxWithSpecifiedDelays(t *testing.T) {
	var calls int
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		if calls < 3 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		io.WriteString(w, `[{"id":"device-target"}]`)
	}))
	defer server.Close()
	var delays []time.Duration
	client := testClient(t, server, Options{Sleep: func(_ context.Context, delay time.Duration) error {
		delays = append(delays, delay)
		return nil
	}, Jitter: func(delay time.Duration) time.Duration { return delay + time.Second }})
	if _, err := client.FetchEnvironment(context.Background(), "device-target"); err != nil {
		t.Fatalf("FetchEnvironment: %v", err)
	}
	if calls != 3 || len(delays) != 2 || delays[0] != 6*time.Second || delays[1] != 16*time.Second {
		t.Fatalf("calls=%d delays=%v", calls, delays)
	}
}

func TestClientDoesNotRetry4xxOr429(t *testing.T) {
	for _, status := range []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusTooManyRequests} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			var calls int
			server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				calls++
				w.Header().Set("X-Rate-Limit-Remaining", "0")
				w.Header().Set("X-Rate-Limit-Reset", "1784376600")
				w.WriteHeader(status)
			}))
			defer server.Close()
			client := testClient(t, server, Options{Now: func() time.Time { return time.Unix(1784376000, 0) }})
			_, err := client.FetchEnvironment(context.Background(), "device-target")
			if err == nil || calls != 1 {
				t.Fatalf("err=%v calls=%d", err, calls)
			}
		})
	}
}

func TestClientRateLimitStopsFollowingEndpointAndCapsWait(t *testing.T) {
	now := time.Unix(1784376000, 0).UTC()
	var calls int
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.Header().Set("X-Rate-Limit-Remaining", "10")
		w.Header().Set("X-Rate-Limit-Reset", strconv.FormatInt(now.Add(time.Hour).Unix(), 10))
		io.WriteString(w, `[{"id":"device-target"}]`)
	}))
	defer server.Close()
	client := testClient(t, server, Options{Now: func() time.Time { return now }})
	if _, err := client.FetchEnvironment(context.Background(), "device-target"); err != nil {
		t.Fatalf("FetchEnvironment: %v", err)
	}
	_, err := client.FetchAircon(context.Background(), "aircon-target")
	if ErrorCode(err) != CodeRateLimited || calls != 1 {
		t.Fatalf("err=%v calls=%d", err, calls)
	}
	if got := client.NextAllowedAt(); !got.Equal(now.Add(15 * time.Minute)) {
		t.Fatalf("next allowed = %v", got)
	}
}

func TestClientRateLimitFallbackForMissingInvalidOrPastReset(t *testing.T) {
	now := time.Unix(1784376000, 0).UTC()
	for _, reset := range []string{"", "not-a-time", strconv.FormatInt(now.Add(-time.Minute).Unix(), 10)} {
		t.Run(reset, func(t *testing.T) {
			var calls int
			server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				calls++
				w.Header().Set("X-Rate-Limit-Remaining", "10")
				if reset != "" {
					w.Header().Set("X-Rate-Limit-Reset", reset)
				}
				io.WriteString(w, `[{"id":"device-target"}]`)
			}))
			defer server.Close()
			var events []Event
			client := testClient(t, server, Options{
				Now: func() time.Time { return now }, RateLimitFallback: 7 * time.Minute,
				Event: func(event Event) { events = append(events, event) },
			})
			if _, err := client.FetchEnvironment(context.Background(), "device-target"); err != nil {
				t.Fatalf("FetchEnvironment: %v", err)
			}
			_, err := client.FetchAircon(context.Background(), "aircon-target")
			if ErrorCode(err) != CodeRateLimited || calls != 1 {
				t.Fatalf("err=%v calls=%d", err, calls)
			}
			if got := client.NextAllowedAt(); !got.Equal(now.Add(7 * time.Minute)) {
				t.Fatalf("next allowed = %v", got)
			}
			if len(events) != 1 || events[0].Name != "upstream_rate_limited" || events[0].Delay != 7*time.Minute {
				t.Fatalf("events = %+v", events)
			}
		})
	}
}

func TestClient429WithoutHeadersUsesFallbackAndStopsNextEndpoint(t *testing.T) {
	now := time.Unix(1784376000, 0).UTC()
	var calls int
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer server.Close()
	client := testClient(t, server, Options{Now: func() time.Time { return now }, RateLimitFallback: 3 * time.Minute})
	_, err := client.FetchEnvironment(context.Background(), "device-target")
	if ErrorCode(err) != CodeRateLimited {
		t.Fatalf("environment error = %v", err)
	}
	_, err = client.FetchAircon(context.Background(), "aircon-target")
	if ErrorCode(err) != CodeRateLimited || calls != 1 || !client.NextAllowedAt().Equal(now.Add(3*time.Minute)) {
		t.Fatalf("aircon error=%v calls=%d next=%v", err, calls, client.NextAllowedAt())
	}
}

func TestRemainingAboveThresholdDoesNotSuppress(t *testing.T) {
	var calls int
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("X-Rate-Limit-Remaining", "11")
		w.Header().Set("X-Rate-Limit-Reset", strconv.FormatInt(time.Now().Add(time.Hour).Unix(), 10))
		if r.URL.Path == "/1/devices" {
			io.WriteString(w, `[{"id":"device-target"}]`)
		} else {
			io.WriteString(w, `[{"id":"aircon-target","settings":{"button":"power-off"}}]`)
		}
	}))
	defer server.Close()
	client := testClient(t, server, Options{})
	if _, err := client.FetchEnvironment(context.Background(), "device-target"); err != nil {
		t.Fatal(err)
	}
	if _, err := client.FetchAircon(context.Background(), "aircon-target"); err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Fatalf("calls = %d", calls)
	}
}

func TestOperationalEventsContainNoSecretMaterial(t *testing.T) {
	const token = "super-secret-test-token"
	var events []Event
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()
	client := testClient(t, server, Options{
		Sleep:  func(context.Context, time.Duration) error { return nil },
		Jitter: func(delay time.Duration) time.Duration { return delay },
		Event:  func(event Event) { events = append(events, event) },
	})
	client.token = token
	_, _ = client.FetchEnvironment(context.Background(), "private-device-id")
	if len(events) != 2 {
		t.Fatalf("events = %+v", events)
	}
	serialized := fmt.Sprintf("%+v", events)
	for _, forbidden := range []string{token, "private-device-id", "Authorization", "/1/devices"} {
		if strings.Contains(serialized, forbidden) {
			t.Fatalf("event leaked %q: %s", forbidden, serialized)
		}
	}
}

func TestValueRejectedEventsDoNotContainValuesOrIDs(t *testing.T) {
	var events []Event
	_, err := parseEnvironmentWithEvent([]byte(`[{"id":"private-id","newest_events":{"te":{"val":101,"created_at":"bad"},"hu":{"val":"secret-value"}}}]`), "private-id", func(event Event) {
		events = append(events, event)
	})
	if err != nil || len(events) != 3 {
		t.Fatalf("err=%v events=%+v", err, events)
	}
	serialized := fmt.Sprintf("%+v", events)
	if strings.Contains(serialized, "101") || strings.Contains(serialized, "private-id") || strings.Contains(serialized, "secret-value") {
		t.Fatalf("events leaked input: %s", serialized)
	}
}

func TestBoundedJitter(t *testing.T) {
	base := 10 * time.Second
	for range 100 {
		got := boundedJitter(base)
		if got < 8*time.Second || got > 12*time.Second {
			t.Fatalf("jitter = %v", got)
		}
	}
}

func TestSyntheticFixtures(t *testing.T) {
	devices, err := os.ReadFile("testdata/devices.json")
	if err != nil {
		t.Fatal(err)
	}
	environment, err := parseEnvironment(devices, "00000000-0000-4000-8000-000000000001")
	if err != nil || environment.TemperatureC == nil || environment.HumidityPct == nil || environment.Online == nil {
		t.Fatalf("synthetic device fixture contract failed: %v", err)
	}
	appliances, err := os.ReadFile("testdata/appliances.json")
	if err != nil {
		t.Fatal(err)
	}
	aircon, err := parseAircon(appliances, "00000000-0000-4000-8000-000000000002")
	if err != nil || aircon.PowerState != domain.PowerStateOn || aircon.TargetTemperatureC == nil {
		t.Fatalf("synthetic appliance fixture contract failed: %v", err)
	}
}

func TestClientResponseLimit(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		io.WriteString(w, strings.Repeat("x", maxBodyBytes+1))
	}))
	defer server.Close()
	client := testClient(t, server, Options{})
	_, err := client.FetchEnvironment(context.Background(), "device-target")
	if ErrorCode(err) != CodeSchemaMismatch {
		t.Fatalf("error = %v", err)
	}
}

func TestClientRetriesNetworkErrorOnceAndClassifiesTimeout(t *testing.T) {
	transport := &failingTransport{err: timeoutError{}}
	var sleeps int
	client, err := NewClient(Options{
		Token: "test-token", Timeout: time.Second, Transport: transport,
		Sleep: func(context.Context, time.Duration) error { sleeps++; return nil },
	})
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	_, err = client.FetchEnvironment(context.Background(), "device-target")
	if ErrorCode(err) != CodeTimeout || transport.calls != 2 || sleeps != 1 {
		t.Fatalf("error=%v calls=%d sleeps=%d", err, transport.calls, sleeps)
	}
}

func TestClientCancellationStopsRetry(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(500) }))
	defer server.Close()
	ctx, cancel := context.WithCancel(context.Background())
	client := testClient(t, server, Options{Sleep: func(context.Context, time.Duration) error {
		cancel()
		return context.Canceled
	}})
	_, err := client.FetchEnvironment(ctx, "device-target")
	if ErrorCode(err) != CodeCancelled {
		t.Fatalf("error = %v", err)
	}
}

func testClient(t *testing.T, server *httptest.Server, options Options) *Client {
	t.Helper()
	options.BaseURL = server.URL
	options.Token = "test-token"
	options.Timeout = time.Second
	options.Transport = server.Client().Transport
	client, err := NewClient(options)
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	return client
}

type failingTransport struct {
	mu    sync.Mutex
	calls int
	err   error
}

func (t *failingTransport) RoundTrip(*http.Request) (*http.Response, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.calls++
	return nil, t.err
}

type timeoutError struct{}

func (timeoutError) Error() string   { return "timeout" }
func (timeoutError) Timeout() bool   { return true }
func (timeoutError) Temporary() bool { return true }

var _ net.Error = timeoutError{}

func floatPtr(value float64) *float64 { return &value }
func equalFloat(a, b *float64) bool {
	return (a == nil && b == nil) || (a != nil && b != nil && *a == *b)
}
