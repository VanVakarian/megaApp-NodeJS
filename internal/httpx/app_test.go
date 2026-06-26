package httpx

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"megaapp-back/internal/config"

	"github.com/gorilla/websocket"
)

func TestAppWebSocketUpgradeWorksThroughMiddleware(t *testing.T) {
	tempDir := t.TempDir()
	cfg := appTestConfig(tempDir)

	prepareAppTestFiles(t, cfg)

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	app, err := NewApp(context.Background(), cfg, logger)
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}
	defer func() { _ = app.Shutdown(context.Background()) }()

	server := httptest.NewServer(app.Handler)
	defer server.Close()

	registerBody, err := json.Marshal(map[string]string{"username": "alice", "password": "password123"})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	registerResponse, err := http.Post(server.URL+"/api/auth/register", "application/json", bytes.NewReader(registerBody))
	if err != nil {
		t.Fatalf("http.Post() error = %v", err)
	}
	_ = registerResponse.Body.Close()
	if registerResponse.StatusCode != http.StatusCreated {
		t.Fatalf("register status = %d, want 201", registerResponse.StatusCode)
	}

	loginBody, err := json.Marshal(map[string]string{"username": "alice", "password": "password123"})
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	loginResponse, err := http.Post(server.URL+"/api/auth/login", "application/json", bytes.NewReader(loginBody))
	if err != nil {
		t.Fatalf("http.Post() error = %v", err)
	}
	defer loginResponse.Body.Close()
	if loginResponse.StatusCode != http.StatusOK {
		t.Fatalf("login status = %d, want 200", loginResponse.StatusCode)
	}

	var tokens struct {
		AccessToken string `json:"accessToken"`
	}
	if err := json.NewDecoder(loginResponse.Body).Decode(&tokens); err != nil {
		t.Fatalf("Decode() error = %v", err)
	}

	wsURL := "ws" + server.URL[len("http"):] + "/api/ws?token=" + tokens.AccessToken + "&clientId=tab-a"
	conn, response, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		statusCode := 0
		if response != nil {
			statusCode = response.StatusCode
		}
		t.Fatalf("Dial() error = %v, status = %d", err, statusCode)
	}
	defer func() { _ = conn.Close() }()

	var message map[string]any
	if err := conn.ReadJSON(&message); err != nil {
		t.Fatalf("ReadJSON() error = %v", err)
	}
	if message["type"] != "SYNC_STATUS" {
		t.Fatalf("message type = %v, want SYNC_STATUS", message["type"])
	}
}

func TestAppServeAndShutdown(t *testing.T) {
	tempDir := t.TempDir()
	cfg := appTestConfig(tempDir)

	prepareAppTestFiles(t, cfg)

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

func TestAppRejectsOversizedRequestBody(t *testing.T) {
	tempDir := t.TempDir()
	cfg := appTestConfig(tempDir)
	cfg.MaxRequestBodyBytes = 64

	prepareAppTestFiles(t, cfg)

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	app, err := NewApp(context.Background(), cfg, logger)
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}
	defer func() { _ = app.Shutdown(context.Background()) }()

	server := httptest.NewServer(app.Handler)
	defer server.Close()

	oversizedBody := `{"username":"` + strings.Repeat("a", 200) + `","password":"password123"}`
	response, err := http.Post(server.URL+"/api/auth/register", "application/json", strings.NewReader(oversizedBody))
	if err != nil {
		t.Fatalf("http.Post() error = %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want 413", response.StatusCode)
	}
}

func appTestConfig(tempDir string) config.Config {
	return config.Config{
		AppEnv:                              "test",
		AppHost:                             "127.0.0.1",
		AppPort:                             3001,
		LogLevel:                            "info",
		DataDir:                             filepath.Join(tempDir, "data"),
		DatabaseName:                        "megaapp",
		DatabasePath:                        filepath.Join(tempDir, "data", "megaapp-test.db"),
		MigrationsDir:                       filepath.Join(tempDir, "migrations"),
		PublicDir:                           filepath.Join(tempDir, "public"),
		BackupsDir:                          filepath.Join(tempDir, "backups"),
		JWTSecret:                           "test-secret",
		FlatlineBaseURL:                     "http://127.0.0.1:1",
		FlatlinePushTimeout:                 time.Second,
		FlatlinePollInterval:                time.Hour,
		FlatlinePollInitialLookback:         time.Minute,
		OpenRouterTimeout:                   time.Minute,
		OpenAITimeout:                       time.Minute,
		PersonalKcalJobSchedule:             "0 2 1 * *",
		PersonalKcalLookbackMonths:          3,
		PersonalKcalDecayRate:               0.6,
		PersonalKcalCoverageThreshold:       0.5,
		PersonalKcalMaxMonthlyChangePercent: 10,
		PersonalKcalAnchorLambda:            3,
		PersonalKcalEvidenceHalfKcal:        333,
		PersonalKcalCoefLogStep:             0.03,
		PersonalKcalNormStep:                33,
		PersonalKcalXStep:                   33,
		PersonalKcalPopulation:              33,
		PersonalKcalMaxGenerations:          333,
		PersonalKcalMaxStale:                33,
		QuotesJobSchedule:                   "0 3 * * *",
		QuotesFetchDays:                     7,
		QuotesRetryAttempts:                 3,
		QuotesRetryDelay:                    time.Second,
		QuotesRequestTimeout:                time.Second,
		HTTPReadTimeout:                     time.Second,
		HTTPWriteTimeout:                    2 * time.Second,
		HTTPIdleTimeout:                     2 * time.Second,
		ShutdownTimeout:                     time.Second,
		MaxRequestBodyBytes:                 1024,
		MaxMultipartBodyBytes:               8 * 1024,
		WSReadLimitBytes:                    1024,
		WSWriteTimeout:                      time.Second,
	}
}

func prepareAppTestFiles(t *testing.T, cfg config.Config) {
	t.Helper()

	if err := os.MkdirAll(cfg.MigrationsDir, 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.MkdirAll(cfg.PublicDir, 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(cfg.MigrationsDir, "000001_auth_and_settings.sql"), []byte(`
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT,
			hashedPassword TEXT,
			isAdmin BOOLEAN
		);
		CREATE TABLE IF NOT EXISTS settings (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			usersId INTEGER,
			darkTheme BOOLEAN,
			selectedChapterFood BOOLEAN,
			selectedChapterMoney BOOLEAN,
			liteVersion BOOLEAN,
			height INTEGER
		);
	`), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
}
