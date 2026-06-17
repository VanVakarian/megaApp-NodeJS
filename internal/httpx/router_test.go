package httpx

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"megaapp-back/internal/config"
)

func TestOpsRoutes(t *testing.T) {
	tempDir := t.TempDir()
	cfg := config.Config{
		AppEnv:          "test",
		AppHost:         "127.0.0.1",
		AppPort:         3000,
		LogLevel:        "debug",
		DatabasePath:    filepath.Join(tempDir, "test.db"),
		MigrationsDir:   filepath.Join(tempDir, "migrations"),
		PublicDir:       filepath.Join(tempDir, "public"),
		ShutdownTimeout: time.Second,
		BuildVersion:    "test-version",
		BuildCommit:     "test-commit",
		BuildTime:       "test-time",
		GoVersion:       "test-go",
	}

	if err := os.MkdirAll(cfg.MigrationsDir, 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.MkdirAll(cfg.PublicDir, 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	app, err := NewApp(context.Background(), cfg, logger)
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}
	defer func() { _ = app.Shutdown(context.Background()) }()

	server := httptest.NewServer(app.Handler)
	defer server.Close()

	assertStatus(t, server.URL+"/health", http.StatusOK, "ok")
	assertStatus(t, server.URL+"/readiness", http.StatusOK, "ready")

	resp, err := http.Get(server.URL + "/build-info")
	if err != nil {
		t.Fatalf("GET /build-info error = %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("/build-info status = %d, want 200", resp.StatusCode)
	}

	var body BuildInfoResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("Decode() error = %v", err)
	}

	if body.Version != cfg.BuildVersion || body.Commit != cfg.BuildCommit {
		t.Fatalf("unexpected build info body = %+v", body)
	}
}

func assertStatus(t *testing.T, url string, wantStatus int, wantBodyStatus string) {
	t.Helper()

	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("GET %s error = %v", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != wantStatus {
		t.Fatalf("GET %s status = %d, want %d", url, resp.StatusCode, wantStatus)
	}

	var body StatusResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("Decode() error = %v", err)
	}

	if body.Status != wantBodyStatus {
		t.Fatalf("GET %s body status = %q, want %q", url, body.Status, wantBodyStatus)
	}
}
