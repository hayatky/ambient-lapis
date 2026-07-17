package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/hayatky/ambient-lapis/backend/internal/app"
)

var version = "0.1.0"

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	os.Exit(app.Execute(ctx, os.Args[1:], version, os.Stderr))
}
