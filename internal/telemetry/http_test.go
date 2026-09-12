package telemetry

import (
	"bytes"
	"context"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"megaapp-back/internal/auth"
	"megaapp-back/internal/platform/sqlite"

	"github.com/go-chi/chi/v5"
	_ "modernc.org/sqlite"
)

func TestPostEventsStoresBatchAndReturnsNoContent(t *testing.T) {
	authService, session := openTelemetryTestSession(t)
	dir := t.TempDir()
	router := chi.NewRouter()
	RegisterRoutes(router, authService, NewHandler(true, dir))
	server := httptest.NewServer(router)
	defer server.Close()

	body := `{"events":[{"eventId":"session:1","operation":"app.route_ready","elapsedMs":12}]}`
	response := postTelemetryEvents(t, server.URL, session.Cookie, body)
	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusNoContent)
	}

	openedAt, _, err := findResumableFile(dir)
	if err != nil {
		t.Fatalf("findResumableFile() error = %v", err)
	}
	data, err := os.ReadFile(filepath.Join(dir, activeFileName(openedAt)))
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	if !bytes.Contains(data, []byte(`"eventId":"session:1"`)) {
		t.Fatalf("file = %q, missing stored event", data)
	}
}

func TestPostEventsDisabledSkipsWriteButReturnsNoContent(t *testing.T) {
	authService, session := openTelemetryTestSession(t)
	dir := t.TempDir()
	router := chi.NewRouter()
	RegisterRoutes(router, authService, NewHandler(false, dir))
	server := httptest.NewServer(router)
	defer server.Close()

	body := `{"events":[{"eventId":"session:1","operation":"app.route_ready"}]}`
	response := postTelemetryEvents(t, server.URL, session.Cookie, body)
	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusNoContent)
	}
	if _, err := os.ReadDir(dir); err == nil {
		if entries, _ := os.ReadDir(dir); len(entries) != 0 {
			t.Fatalf("expected no files written while disabled, found %d", len(entries))
		}
	}
}

func TestPostEventsRejectsInvalidBatch(t *testing.T) {
	authService, session := openTelemetryTestSession(t)
	dir := t.TempDir()
	router := chi.NewRouter()
	RegisterRoutes(router, authService, NewHandler(true, dir))
	server := httptest.NewServer(router)
	defer server.Close()

	body := `{"events":[{"operation":"app.route_ready"}]}`
	response := postTelemetryEvents(t, server.URL, session.Cookie, body)
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusBadRequest)
	}
}

func TestPostEventsRejectsMissingSession(t *testing.T) {
	authService, _ := openTelemetryTestSession(t)
	dir := t.TempDir()
	router := chi.NewRouter()
	RegisterRoutes(router, authService, NewHandler(true, dir))
	server := httptest.NewServer(router)
	defer server.Close()

	response := postTelemetryEvents(t, server.URL, "", `{"events":[{"eventId":"e","operation":"app.route_ready"}]}`)
	if response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusUnauthorized)
	}
}

func openTelemetryTestSession(t *testing.T) (*auth.Service, auth.LoginResult) {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("sql.Open() error = %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`
		CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, hashedPassword TEXT, isAdmin BOOLEAN);
		CREATE TABLE auth_sessions (id TEXT PRIMARY KEY, secretHash BLOB NOT NULL, userId INTEGER NOT NULL, createdAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL, renewedAt INTEGER NOT NULL, revokedAt INTEGER DEFAULT NULL);
	`); err != nil {
		t.Fatalf("Exec() error = %v", err)
	}
	authService := auth.NewService(auth.NewRepository(db, sqlite.WriteDB{DB: db}), auth.SessionConfig{})
	userID, err := authService.Register(context.Background(), "alice", "password123")
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}
	session, err := authService.CreateSession(context.Background(), userID)
	if err != nil {
		t.Fatalf("CreateSession() error = %v", err)
	}
	return authService, session
}

func postTelemetryEvents(t *testing.T, serverURL, sessionCookie, body string) *http.Response {
	t.Helper()
	request, err := http.NewRequest(http.MethodPost, serverURL+"/api/telemetry/events", bytes.NewReader([]byte(body)))
	if err != nil {
		t.Fatalf("NewRequest() error = %v", err)
	}
	if sessionCookie != "" {
		request.AddCookie(&http.Cookie{Name: auth.SessionCookieName, Value: sessionCookie})
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("Do() error = %v", err)
	}
	t.Cleanup(func() { _ = response.Body.Close() })
	return response
}
