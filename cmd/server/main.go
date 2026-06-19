package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"megaapp-back/internal/config"
	"megaapp-back/internal/httpx"
	logplatform "megaapp-back/internal/platform/log"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	logger := logplatform.New(cfg.LogLevel)
	ctx := context.Background()

	app, err := httpx.NewApp(ctx, cfg, logger)
	if err != nil {
		logger.Error("app_init_failed", "error", err)
		os.Exit(1)
	}

	go func() {
		sigCtx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
		defer stop()
		<-sigCtx.Done()

		shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
		defer cancel()

		if err := app.Shutdown(shutdownCtx); err != nil {
			logger.Error("app_shutdown_failed", "error", err)
		}
	}()

	logger.Info("app_starting", "addr", cfg.HTTPAddress(), "env", cfg.AppEnv)
	if err := app.Start(); err != nil {
		logger.Error("app_stopped_with_error", "error", err)
		os.Exit(1)
	}
	logger.Info("app_stopped")
}
