package ws

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"megaapp-back/internal/auth"
	"megaapp-back/internal/platform/sqlite"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	_ "modernc.org/sqlite"
)

func TestConnectSendsSyncStatusAndSupportsHeartbeat(t *testing.T) {
	authService, tokenManager := openWSTestAuthService(t)
	hub := NewHub(50*time.Millisecond, NewSyncState())
	defer func() { _ = hub.Close() }()

	handler := NewHandler(authService, hub)
	router := chi.NewRouter()
	RegisterRoutes(router, handler)
	server := httptest.NewServer(router)
	defer server.Close()

	userID, err := authService.Register(context.Background(), "alice", "password123")
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}
	hub.syncState.Set(userID, 123)

	tokens, err := tokenManager.Issue(auth.TokenClaims{UserID: userID, Username: "alice"})
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	conn := dialWS(t, server.URL+"/api/ws?token="+tokens.AccessToken+"&clientId=tab-a")
	defer func() { _ = conn.Close() }()

	var syncStatus map[string]any
	if err := conn.ReadJSON(&syncStatus); err != nil {
		t.Fatalf("ReadJSON() error = %v", err)
	}
	if syncStatus["type"] != "SYNC_STATUS" {
		t.Fatalf("type = %v, want SYNC_STATUS", syncStatus["type"])
	}
	payload, ok := syncStatus["payload"].(map[string]any)
	if !ok {
		t.Fatalf("payload = %T, want map", syncStatus["payload"])
	}
	if payload["userDataLastModifiedTs"] != float64(123) {
		t.Fatalf("userDataLastModifiedTs = %v, want 123", payload["userDataLastModifiedTs"])
	}

	var ping map[string]any
	if err := conn.ReadJSON(&ping); err != nil {
		t.Fatalf("ReadJSON() error = %v", err)
	}
	if ping["type"] != "PING" {
		t.Fatalf("type = %v, want PING", ping["type"])
	}
	if err := conn.WriteJSON(map[string]string{"type": "PONG"}); err != nil {
		t.Fatalf("WriteJSON() error = %v", err)
	}
}

func TestConnectRejectsInvalidToken(t *testing.T) {
	authService, _ := openWSTestAuthService(t)
	hub := NewHub(time.Second, NewSyncState())
	defer func() { _ = hub.Close() }()

	handler := NewHandler(authService, hub)
	router := chi.NewRouter()
	RegisterRoutes(router, handler)
	server := httptest.NewServer(router)
	defer server.Close()

	wsURL := "ws" + server.URL[len("http"):] + "/api/ws?token=bad"
	_, response, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err == nil {
		t.Fatal("Dial() error = nil, want error")
	}
	if response == nil || response.StatusCode != http.StatusUnauthorized {
		statusCode := 0
		if response != nil {
			statusCode = response.StatusCode
		}
		t.Fatalf("status = %d, want 401", statusCode)
	}
}

func TestBroadcastToUserExcludesSenderClientID(t *testing.T) {
	authService, tokenManager := openWSTestAuthService(t)
	hub := NewHub(time.Second, NewSyncState())
	defer func() { _ = hub.Close() }()

	handler := NewHandler(authService, hub)
	router := chi.NewRouter()
	RegisterRoutes(router, handler)
	server := httptest.NewServer(router)
	defer server.Close()

	userID, err := authService.Register(context.Background(), "alice", "password123")
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}
	tokens, err := tokenManager.Issue(auth.TokenClaims{UserID: userID, Username: "alice"})
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	connA := dialWS(t, server.URL+"/api/ws?token="+tokens.AccessToken+"&clientId=tab-a")
	defer func() { _ = connA.Close() }()
	connB := dialWS(t, server.URL+"/api/ws?token="+tokens.AccessToken+"&clientId=tab-b")
	defer func() { _ = connB.Close() }()

	drainInitialMessage(t, connA)
	drainInitialMessage(t, connB)

	hub.BroadcastToUser(userID, map[string]any{"type": "SYNC_STATUS", "payload": map[string]any{"userDataLastModifiedTs": 999}}, "tab-a")

	_ = connA.SetReadDeadline(time.Now().Add(150 * time.Millisecond))
	var aMessage map[string]any
	if err := connA.ReadJSON(&aMessage); err == nil {
		bytes, _ := json.Marshal(aMessage)
		t.Fatalf("sender received unexpected message: %s", bytes)
	}

	_ = connB.SetReadDeadline(time.Now().Add(time.Second))
	var bMessage map[string]any
	if err := connB.ReadJSON(&bMessage); err != nil {
		t.Fatalf("ReadJSON() error = %v", err)
	}
	if bMessage["type"] != "SYNC_STATUS" {
		t.Fatalf("type = %v, want SYNC_STATUS", bMessage["type"])
	}
}

func openWSTestAuthService(t *testing.T) (*auth.Service, *auth.TokenManager) {
	t.Helper()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("sql.Open() error = %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	if _, err := db.Exec(`
		CREATE TABLE users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT,
			hashedPassword TEXT,
			isAdmin BOOLEAN
		);
	`); err != nil {
		t.Fatalf("Exec() error = %v", err)
	}

	tokenManager := auth.NewTokenManager("test-secret", time.Hour, 24*time.Hour)
	return auth.NewService(auth.NewRepository(db, sqlite.WriteDB{DB: db}), tokenManager), tokenManager
}

func dialWS(t *testing.T, httpURL string) *websocket.Conn {
	t.Helper()

	wsURL := "ws" + httpURL[len("http"):]
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Dial() error = %v", err)
	}

	return conn
}

func drainInitialMessage(t *testing.T, conn *websocket.Conn) {
	t.Helper()

	_ = conn.SetReadDeadline(time.Now().Add(time.Second))
	var message map[string]any
	if err := conn.ReadJSON(&message); err != nil {
		t.Fatalf("ReadJSON() error = %v", err)
	}
}
