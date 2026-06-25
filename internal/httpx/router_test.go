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
		AppEnv:                             "test",
		AppHost:                            "127.0.0.1",
		AppPort:                            3001,
		LogLevel:                           "debug",
		DataDir:                            filepath.Join(tempDir, "data"),
		DatabaseName:                       "megaapp",
		DatabasePath:                       filepath.Join(tempDir, "data", "megaapp-test.db"),
		MigrationsDir:                      filepath.Join(tempDir, "migrations"),
		PublicDir:                          filepath.Join(tempDir, "public"),
		BackupsDir:                         filepath.Join(tempDir, "backups"),
		JWTSecret:                          "test-secret",
		FlatlineBaseURL:                    "http://127.0.0.1:1",
		FlatlinePushTimeout:                time.Second,
		FlatlinePollInterval:               time.Hour,
		FlatlinePollInitialLookback:        time.Minute,
		OpenRouterTimeout:                  time.Minute,
		OpenAITimeout:                      time.Minute,
		CoefficientsJobSchedule:            "0 1 * * *",
		CoefficientsDifferentTriesPerRound: 100,
		CoefficientsChildrenAmt:            10,
		CoefficientsBestAmt:                10,
		CoefficientsDays7:                  7,
		CoefficientsDays60:                 60,
		CoefficientsMaxTriesIfUnchanged:    20,
		QuotesJobSchedule:                  "0 3 * * *",
		QuotesFetchDays:                    7,
		QuotesRetryAttempts:                3,
		QuotesRetryDelay:                   time.Second,
		QuotesRequestTimeout:               time.Second,
		BackupJobSchedule:                  "0 2 * * *",
		BackupOperationTimeout:             5 * time.Minute,
		HTTPReadTimeout:                    time.Second,
		HTTPWriteTimeout:                   2 * time.Second,
		HTTPIdleTimeout:                    2 * time.Second,
		ShutdownTimeout:                    time.Second,
		MaxRequestBodyBytes:                1024,
		MaxMultipartBodyBytes:              8 * 1024,
		WSReadLimitBytes:                   1024,
		WSWriteTimeout:                     time.Second,
		BuildCommit:                        "test-commit",
		BuildTime:                          "test-time",
		GoVersion:                          "test-go",
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

	if body.Commit != cfg.BuildCommit {
		t.Fatalf("unexpected build info body = %+v", body)
	}

	commitResp, err := http.Get(server.URL + "/api/debug/commit-info")
	if err != nil {
		t.Fatalf("GET /api/debug/commit-info error = %v", err)
	}
	defer commitResp.Body.Close()

	if commitResp.StatusCode != http.StatusOK {
		t.Fatalf("/api/debug/commit-info status = %d, want 200", commitResp.StatusCode)
	}

	var commitBody CommitInfoResponse
	if err := json.NewDecoder(commitResp.Body).Decode(&commitBody); err != nil {
		t.Fatalf("Decode() error = %v", err)
	}

	if commitBody.CommitHash != cfg.BuildCommit || commitBody.CommitDateTime != cfg.BuildTime {
		t.Fatalf("unexpected commit info body = %+v", commitBody)
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
