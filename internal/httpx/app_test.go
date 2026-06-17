package httpx

import (
	"context"
	"io"
	"log/slog"
	"net"
	"path/filepath"
	"testing"
	"time"

	"megaapp-back/internal/config"
)

func TestAppServeAndShutdown(t *testing.T) {
	tempDir := t.TempDir()
	cfg := config.Config{
		AppEnv:          "test",
		AppHost:         "127.0.0.1",
		AppPort:         3000,
		LogLevel:        "info",
		DatabasePath:    filepath.Join(tempDir, "test.db"),
		MigrationsDir:   filepath.Join(tempDir, "migrations"),
		PublicDir:       filepath.Join(tempDir, "public"),
		ShutdownTimeout: time.Second,
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	app, err := NewApp(context.Background(), cfg, logger)
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("Listen() error = %v", err)
	}
	defer listener.Close()

	errCh := make(chan error, 1)
	go func() {
		errCh <- app.Serve(listener)
	}()

	time.Sleep(100 * time.Millisecond)

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := app.Shutdown(shutdownCtx); err != nil {
		t.Fatalf("Shutdown() error = %v", err)
	}

	if err := <-errCh; err != nil {
		t.Fatalf("Serve() error = %v", err)
	}
}
