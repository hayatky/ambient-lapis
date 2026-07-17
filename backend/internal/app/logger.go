package app

import (
	"io"
	"log/slog"
)

func NewLogger(output io.Writer, level string) *slog.Logger {
	var slogLevel slog.Level
	switch level {
	case "debug":
		slogLevel = slog.LevelDebug
	case "warn":
		slogLevel = slog.LevelWarn
	case "error":
		slogLevel = slog.LevelError
	default:
		slogLevel = slog.LevelInfo
	}
	handler := slog.NewJSONHandler(output, &slog.HandlerOptions{
		Level: slogLevel,
		ReplaceAttr: func(_ []string, attr slog.Attr) slog.Attr {
			if attr.Key == slog.TimeKey {
				attr.Key = "timestamp"
				attr.Value = slog.TimeValue(attr.Value.Time().UTC())
			}
			return attr
		},
	})
	return slog.New(handler).With("service", "remo-api")
}
