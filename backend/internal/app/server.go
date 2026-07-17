package app

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"time"
)

const shutdownTimeout = 20 * time.Second

type HTTPServer struct {
	server *http.Server
	logger *slog.Logger
}

func NewHTTPServer(address string, handler http.Handler, logger *slog.Logger) *HTTPServer {
	return &HTTPServer{server: &http.Server{
		Addr: address, Handler: handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}, logger: logger}
}

// Serve starts accepting before it blocks. Cancellation stops new requests and
// gives in-flight handlers up to 20 seconds to finish.
func (s *HTTPServer) Serve(ctx context.Context) error {
	listener, err := net.Listen("tcp", s.server.Addr)
	if err != nil {
		return err
	}
	errCh := make(chan error, 1)
	go func() { errCh <- s.server.Serve(listener) }()
	select {
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		if err := s.server.Shutdown(shutdownCtx); err != nil {
			s.logger.Error("HTTP shutdown failed", "event", "http_shutdown_failed", "error", err)
			_ = s.server.Close()
			return err
		}
		err := <-errCh
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}
