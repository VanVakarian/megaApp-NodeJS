package metrics

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
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

	if err := adminConn.WriteJSON(map[string]any{"type": "METRICS_SUBSCRIBE"}); err != nil {
		t.Fatalf("WriteJSON() error = %v", err)
	}

	time.Sleep(50 * time.Millisecond)
	if err := plainConn.WriteJSON(map[string]any{"type": "METRICS_SUBSCRIBE"}); err != nil {
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

	if err := conn.WriteJSON(map[string]any{"type": "METRICS_SUBSCRIBE"}); err != nil {
		t.Fatalf("WriteJSON() error = %v", err)
	}
	time.Sleep(50 * time.Millisecond)

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

func TestBroadcastLatestReachesOnlyAdmins(t *testing.T) {
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

	realtime.BroadcastLatest([]int64{adminUserID}, LatestSnapshot{Services: []ServiceLatest{{Service: MainServiceName, LastBucket: 60, Metrics: map[string]float64{"food_diary_entry_created": 1}}}})

	_ = adminConn.SetReadDeadline(time.Now().Add(time.Second))
	var latest map[string]any
	if err := adminConn.ReadJSON(&latest); err != nil {
		t.Fatalf("ReadJSON() error = %v", err)
	}
	if latest["type"] != "METRICS_LATEST" {
		t.Fatalf("type = %v, want METRICS_LATEST", latest["type"])
	}

	_ = plainConn.SetReadDeadline(time.Now().Add(150 * time.Millisecond))
	var plainLatest map[string]any
	if err := plainConn.ReadJSON(&plainLatest); err == nil {
		t.Fatalf("plain user unexpectedly received latest: %+v", plainLatest)
	}
}

func TestHistoryHandlerReturnsServiceSnapshots(t *testing.T) {
	authService, tokenManager, _, wsServer, authDB := newMetricsTestEnv(t)
	defer wsServer.Close()

	adminUserID := registerAdminUser(t, authService, authDB, "admin")
	tokens, err := tokenManager.Issue(auth.TokenClaims{UserID: adminUserID, Username: "admin", IsAdmin: true})
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	now := time.Date(2026, 6, 30, 12, 0, 0, 0, time.UTC)
	flatlineServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()
		if query.Get("service") != "bot" || query.Get("names") != "a" {
			t.Fatalf("query = %s, want bot/a", query.Encode())
		}
		if query.Get("minuteSince") != strconv.FormatInt(now.Unix()-minuteHistoryWindowSeconds, 10) {
			t.Fatalf("minuteSince = %s", query.Get("minuteSince"))
		}
		_ = json.NewEncoder(w).Encode(historyResponse{
			Snapshots: []MetricSnapshot{{Granularity: GranularityMinute, Bucket: now.Unix() - 60, Metrics: map[string]float64{"a": 1}}},
		})
	}))
	defer flatlineServer.Close()

	service := NewService(MainServiceName, fixedMetricsClock{now: now}, authService)
	router := chi.NewRouter()
	RegisterRoutes(router, authService, NewHistoryHandler(service, NewFlatlineClient(flatlineServer.URL, time.Second), fixedMetricsClock{now: now}))

	req := httptest.NewRequest(http.MethodGet, "/api/metrics/history?service=bot&names=a", nil)
	req.Header.Set("Authorization", "Bearer "+tokens.AccessToken)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	var response historyResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if len(response.Snapshots) != 1 || response.Snapshots[0].Metrics["a"] != 1 {
		t.Fatalf("snapshots = %+v, want one a snapshot", response.Snapshots)
	}
}

func TestHistoryHandlerReturnsAllServiceSnapshots(t *testing.T) {
	authService, tokenManager, _, wsServer, authDB := newMetricsTestEnv(t)
	defer wsServer.Close()

	adminUserID := registerAdminUser(t, authService, authDB, "admin")
	tokens, err := tokenManager.Issue(auth.TokenClaims{UserID: adminUserID, Username: "admin", IsAdmin: true})
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	now := time.Date(2026, 6, 30, 12, 0, 0, 0, time.UTC)
	requestedServices := make(chan string, 2)
	flatlineServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()
		service := query.Get("service")
		requestedServices <- service
		if query.Get("names") != "" {
			t.Fatalf("names = %q, want empty", query.Get("names"))
		}
		_ = json.NewEncoder(w).Encode(historyResponse{
			Snapshots: []MetricSnapshot{{Granularity: GranularityMinute, Bucket: now.Unix() - 60, Metrics: map[string]float64{service: 1}}},
		})
	}))
	defer flatlineServer.Close()

	service := NewService(MainServiceName, fixedMetricsClock{now: now}, authService)
	router := chi.NewRouter()
	RegisterRoutes(router, authService, NewHistoryHandler(service, NewFlatlineClient(flatlineServer.URL, time.Second), fixedMetricsClock{now: now}))

	req := httptest.NewRequest(http.MethodGet, "/api/metrics/history?services=bot,hardware:test", nil)
	req.Header.Set("Authorization", "Bearer "+tokens.AccessToken)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	var response struct {
		Histories []ServiceHistory `json:"histories"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if len(response.Histories) != 2 || response.Histories[0].Service != "bot" || response.Histories[1].Service != "hardware:test" {
		t.Fatalf("histories = %+v, want ordered service histories", response.Histories)
	}
	if response.Histories[0].Snapshots[0].Metrics["bot"] != 1 || response.Histories[1].Snapshots[0].Metrics["hardware:test"] != 1 {
		t.Fatalf("histories = %+v, want service-specific snapshots", response.Histories)
	}

	seen := map[string]bool{<-requestedServices: true, <-requestedServices: true}
	if !seen["bot"] || !seen["hardware:test"] {
		t.Fatalf("requested services = %+v", seen)
	}
}

func TestParseHistoryServices(t *testing.T) {
	tests := []struct {
		name    string
		raw     string
		wantErr bool
	}{
		{name: "valid", raw: "bot, hardware:test"},
		{name: "deduplicated", raw: "bot,bot"},
		{name: "empty", raw: "", wantErr: true},
		{name: "empty item", raw: "bot,", wantErr: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := parseHistoryServices(test.raw)
			if (err != nil) != test.wantErr {
				t.Fatalf("parseHistoryServices(%q) error = %v, wantErr %v", test.raw, err, test.wantErr)
			}
		})
	}
}

func TestParseHistoryAnchor(t *testing.T) {
	tests := []struct {
		name    string
		raw     string
		want    int64
		wantErr bool
	}{
		{name: "fallback", want: 100},
		{name: "explicit", raw: "200", want: 200},
		{name: "invalid", raw: "nope", wantErr: true},
		{name: "zero", raw: "0", wantErr: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := parseHistoryAnchor(test.raw, 100)
			if (err != nil) != test.wantErr {
				t.Fatalf("parseHistoryAnchor(%q) error = %v, wantErr %v", test.raw, err, test.wantErr)
			}
			if got != test.want {
				t.Fatalf("parseHistoryAnchor(%q) = %d, want %d", test.raw, got, test.want)
			}
		})
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

	service := NewService(MainServiceName, fixedMetricsClock{now: time.Now()}, authService)

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
