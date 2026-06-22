package metrics

import (
	"context"
	"database/sql"
	"net/http/httptest"
	"testing"
	"time"

	"megaapp-back/internal/auth"
	"megaapp-back/internal/ws"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"

	_ "modernc.org/sqlite"
)

func TestSubscribeHandlerOnlyAcceptsAdmins(t *testing.T) {
	authService, tokenManager, realtime, server, authDB := newMetricsTestEnv(t)
	defer server.Close()

	adminUserID := registerAdminUser(t, authService, authDB, "admin")
	plainUserID := registerUser(t, authService, "plain")

	adminTokens, err := tokenManager.Issue(auth.TokenClaims{UserID: adminUserID, Username: "admin", IsAdmin: true})
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}
	plainTokens, err := tokenManager.Issue(auth.TokenClaims{UserID: plainUserID, Username: "plain", IsAdmin: false})
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	adminConn := dialMetricsWS(t, server.URL+"/api/ws?token="+adminTokens.AccessToken+"&clientId=admin-tab")
	defer func() { _ = adminConn.Close() }()
	drainMetricsMessage(t, adminConn)

	plainConn := dialMetricsWS(t, server.URL+"/api/ws?token="+plainTokens.AccessToken+"&clientId=plain-tab")
	defer func() { _ = plainConn.Close() }()
	drainMetricsMessage(t, plainConn)

	if err := adminConn.WriteJSON(map[string]any{"type": "METRICS_SUBSCRIBE", "cursor": 0}); err != nil {
		t.Fatalf("WriteJSON() error = %v", err)
	}

	var update map[string]any
	_ = adminConn.SetReadDeadline(time.Now().Add(time.Second))
	if err := adminConn.ReadJSON(&update); err != nil {
		t.Fatalf("ReadJSON() error = %v", err)
	}
	if update["type"] != "METRICS_UPDATE" {
		t.Fatalf("type = %v, want METRICS_UPDATE", update["type"])
	}

	if err := plainConn.WriteJSON(map[string]any{"type": "METRICS_SUBSCRIBE", "cursor": 0}); err != nil {
		t.Fatalf("WriteJSON() error = %v", err)
	}
	_ = plainConn.SetReadDeadline(time.Now().Add(150 * time.Millisecond))
	var plainUpdate map[string]any
	if err := plainConn.ReadJSON(&plainUpdate); err == nil {
		t.Fatalf("plain user unexpectedly received: %+v", plainUpdate)
	}

	realtime.BroadcastDetail(DetailUpdate{Points: []MetricPoint{{Name: "food_diary_entry_created", Bucket: 1, Value: 1}}})

	_ = adminConn.SetReadDeadline(time.Now().Add(time.Second))
	var broadcast map[string]any
	if err := adminConn.ReadJSON(&broadcast); err != nil {
		t.Fatalf("ReadJSON() error = %v", err)
	}
	if broadcast["type"] != "METRICS_UPDATE" {
		t.Fatalf("type = %v, want METRICS_UPDATE", broadcast["type"])
	}

	_ = plainConn.SetReadDeadline(time.Now().Add(150 * time.Millisecond))
	var plainBroadcast map[string]any
	if err := plainConn.ReadJSON(&plainBroadcast); err == nil {
		t.Fatalf("plain user unexpectedly received broadcast: %+v", plainBroadcast)
	}
}

func TestUnsubscribeStopsDetailBroadcast(t *testing.T) {
	authService, tokenManager, realtime, server, authDB := newMetricsTestEnv(t)
	defer server.Close()

	adminUserID := registerAdminUser(t, authService, authDB, "admin")
	adminTokens, err := tokenManager.Issue(auth.TokenClaims{UserID: adminUserID, Username: "admin", IsAdmin: true})
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	conn := dialMetricsWS(t, server.URL+"/api/ws?token="+adminTokens.AccessToken+"&clientId=admin-tab")
	defer func() { _ = conn.Close() }()
	drainMetricsMessage(t, conn)

	if err := conn.WriteJSON(map[string]any{"type": "METRICS_SUBSCRIBE", "cursor": 0}); err != nil {
		t.Fatalf("WriteJSON() error = %v", err)
	}
	drainMetricsMessage(t, conn)

	if err := conn.WriteJSON(map[string]any{"type": "METRICS_UNSUBSCRIBE"}); err != nil {
		t.Fatalf("WriteJSON() error = %v", err)
	}
	time.Sleep(50 * time.Millisecond)

	realtime.BroadcastDetail(DetailUpdate{Points: []MetricPoint{{Name: "food_diary_entry_created", Bucket: 1, Value: 1}}})

	_ = conn.SetReadDeadline(time.Now().Add(150 * time.Millisecond))
	var message map[string]any
	if err := conn.ReadJSON(&message); err == nil {
		t.Fatalf("unexpectedly received message after unsubscribe: %+v", message)
	}
}

func TestBroadcastHealthReachesOnlyAdmins(t *testing.T) {
	authService, tokenManager, realtime, server, authDB := newMetricsTestEnv(t)
	defer server.Close()

	adminUserID := registerAdminUser(t, authService, authDB, "admin")
	plainUserID := registerUser(t, authService, "plain")

	adminTokens, err := tokenManager.Issue(auth.TokenClaims{UserID: adminUserID, Username: "admin", IsAdmin: true})
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}
	plainTokens, err := tokenManager.Issue(auth.TokenClaims{UserID: plainUserID, Username: "plain", IsAdmin: false})
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	adminConn := dialMetricsWS(t, server.URL+"/api/ws?token="+adminTokens.AccessToken+"&clientId=admin-tab")
	defer func() { _ = adminConn.Close() }()
	drainMetricsMessage(t, adminConn)

	plainConn := dialMetricsWS(t, server.URL+"/api/ws?token="+plainTokens.AccessToken+"&clientId=plain-tab")
	defer func() { _ = plainConn.Close() }()
	drainMetricsMessage(t, plainConn)

	realtime.BroadcastHealth([]int64{adminUserID}, HealthStatus{Services: []ServiceHealth{{Service: MainServiceName, Severity: "ok"}}})

	_ = adminConn.SetReadDeadline(time.Now().Add(time.Second))
	var health map[string]any
	if err := adminConn.ReadJSON(&health); err != nil {
		t.Fatalf("ReadJSON() error = %v", err)
	}
	if health["type"] != "METRICS_HEALTH" {
		t.Fatalf("type = %v, want METRICS_HEALTH", health["type"])
	}

	_ = plainConn.SetReadDeadline(time.Now().Add(150 * time.Millisecond))
	var plainHealth map[string]any
	if err := plainConn.ReadJSON(&plainHealth); err == nil {
		t.Fatalf("plain user unexpectedly received health: %+v", plainHealth)
	}
}

func newMetricsTestEnv(t *testing.T) (*auth.Service, *auth.TokenManager, *Realtime, *httptest.Server, *sql.DB) {
	t.Helper()

	authDB, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("sql.Open() error = %v", err)
	}
	t.Cleanup(func() { _ = authDB.Close() })

	if _, err := authDB.Exec(`
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
	authService := auth.NewService(auth.NewRepository(authDB), tokenManager)

	metricsDB := openMetricsTestDB(t)
	repo := NewRepository(metricsDB)
	service := NewService(repo, fixedMetricsClock{now: time.Now()}, authService)

	hub := ws.NewHub(time.Second, ws.NewSyncState())
	t.Cleanup(func() { _ = hub.Close() })
	realtime := NewRealtime(hub)

	hub.RegisterHandler("METRICS_SUBSCRIBE", NewSubscribeHandler(service, realtime))
	hub.RegisterHandler("METRICS_UNSUBSCRIBE", NewUnsubscribeHandler(realtime))

	wsHandler := ws.NewHandler(authService, hub)
	router := chi.NewRouter()
	ws.RegisterRoutes(router, wsHandler)
	server := httptest.NewServer(router)

	return authService, tokenManager, realtime, server, authDB
}

func registerUser(t *testing.T, authService *auth.Service, username string) int64 {
	t.Helper()

	userID, err := authService.Register(context.Background(), username, "password123")
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}
	return userID
}

func registerAdminUser(t *testing.T, authService *auth.Service, authDB *sql.DB, username string) int64 {
	t.Helper()

	userID := registerUser(t, authService, username)

	if _, err := authDB.Exec(`UPDATE users SET isAdmin = 1 WHERE id = ?`, userID); err != nil {
		t.Fatalf("Exec() error = %v", err)
	}

	return userID
}

func dialMetricsWS(t *testing.T, httpURL string) *websocket.Conn {
	t.Helper()

	wsURL := "ws" + httpURL[len("http"):]
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Dial() error = %v", err)
	}

	return conn
}

func drainMetricsMessage(t *testing.T, conn *websocket.Conn) {
	t.Helper()

	_ = conn.SetReadDeadline(time.Now().Add(time.Second))
	var message map[string]any
	if err := conn.ReadJSON(&message); err != nil {
		t.Fatalf("ReadJSON() error = %v", err)
	}
}
