package app

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

func Healthcheck(ctx context.Context, rawURL string) error {
	return healthcheck(ctx, rawURL, &http.Client{Timeout: 4 * time.Second})
}

type httpDoer interface {
	Do(*http.Request) (*http.Response, error)
}

func healthcheck(ctx context.Context, rawURL string, client httpDoer) error {
	target, err := url.Parse(rawURL)
	if err != nil || (target.Scheme != "http" && target.Scheme != "https") || target.Host == "" {
		return errors.New("healthcheck URL must be an absolute HTTP or HTTPS URL")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return fmt.Errorf("create healthcheck request: %w", err)
	}
	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("healthcheck request: %w", err)
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("healthcheck returned HTTP %d", response.StatusCode)
	}
	return nil
}
