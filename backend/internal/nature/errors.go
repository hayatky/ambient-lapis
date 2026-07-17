package nature

import (
	"errors"
	"fmt"
	"time"
)

const (
	CodeClientError    = "client_error"
	CodeUnauthorized   = "unauthorized"
	CodeTargetNotFound = "target_not_found"
	CodeRateLimited    = "rate_limited"
	CodeUpstreamError  = "upstream_error"
	CodeTimeout        = "timeout"
	CodeNetworkError   = "network_error"
	CodeInvalidJSON    = "invalid_json"
	CodeSchemaMismatch = "schema_mismatch"
	CodeCancelled      = "cancelled"
)

type APIError struct {
	Code             string
	Detail           string
	RateLimitResetAt *time.Time
	Temporary        bool
	Cause            error
}

func (e *APIError) Error() string {
	if e.Detail != "" {
		return fmt.Sprintf("nature API %s: %s", e.Code, e.Detail)
	}
	return "nature API " + e.Code
}

func (e *APIError) Unwrap() error { return e.Cause }

func ErrorCode(err error) string {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr.Code
	}
	return CodeUpstreamError
}

func RateLimitReset(err error) *time.Time {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr.RateLimitResetAt
	}
	return nil
}
