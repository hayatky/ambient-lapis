package app

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"testing"
)

type doerFunc func(*http.Request) (*http.Response, error)

func (f doerFunc) Do(r *http.Request) (*http.Response, error) { return f(r) }

func TestHealthcheck(t *testing.T) {
	client := doerFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(nil))}, nil
	})
	if err := healthcheck(context.Background(), "http://127.0.0.1:8080/readyz", client); err != nil {
		t.Fatal(err)
	}
}

func TestHealthcheckRejectsBadURLAndStatus(t *testing.T) {
	client := doerFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 503, Body: io.NopCloser(bytes.NewReader(nil))}, nil
	})
	if err := healthcheck(context.Background(), "file:///tmp/status", client); err == nil {
		t.Fatal("expected URL error")
	}
	if err := healthcheck(context.Background(), "http://127.0.0.1:8080", client); err == nil {
		t.Fatal("expected status error")
	}
}
