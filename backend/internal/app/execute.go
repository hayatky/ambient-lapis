package app

import (
	"context"
	"flag"
	"fmt"
	"io"
)

func Execute(ctx context.Context, args []string, version string, stderr io.Writer) int {
	if len(args) > 0 && args[0] == "healthcheck" {
		flags := flag.NewFlagSet("healthcheck", flag.ContinueOnError)
		flags.SetOutput(stderr)
		url := flags.String("url", "http://127.0.0.1:8080/readyz", "readiness URL")
		if err := flags.Parse(args[1:]); err != nil {
			return 2
		}
		if flags.NArg() != 0 {
			fmt.Fprintln(stderr, "healthcheck accepts no positional arguments")
			return 2
		}
		if err := Healthcheck(ctx, *url); err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
		return 0
	}
	if len(args) != 0 {
		fmt.Fprintln(stderr, "unexpected arguments")
		return 2
	}
	if err := Run(ctx, version); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	return 0
}
