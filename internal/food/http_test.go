package food

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"megaapp-back/internal/auth"
	wspkg "megaapp-back/internal/ws"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
)

func TestFoodWriteEndpointsAndWebSocketBroadcasts(t *testing.T) {
	db := openFoodTestDB(t)
	authRepo := auth.NewRepository(db)
	tokenManager := auth.NewTokenManager("test-secret", time.Hour, 24*time.Hour)
	authService := auth.NewService(authRepo, tokenManager)
	service := NewService(NewRepository(db))
	readHandler := NewHandler(service)
	hub := wspkg.NewHub(time.Second, wspkg.NewSyncState())
	defer func() { _ = hub.Close() }()
	writeHandler := NewWriteHandler(service, hub)
	wsHandler := wspkg.NewHandler(authService, hub)

	router := chi.NewRouter()
	RegisterRoutes(router, authService, readHandler)
	RegisterWriteRoutes(router, authService, writeHandler)
	wspkg.RegisterRoutes(router, wsHandler)
	server := httptest.NewServer(router)
	defer server.Close()

	tokens, err := tokenManager.Issue(auth.TokenClaims{UserID: 1, Username: "alice"})
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	connA := dialFoodWS(t, server.URL+"/api/ws?token="+tokens.AccessToken+"&clientId=tab-a")
	defer func() { _ = connA.Close() }()
	connB := dialFoodWS(t, server.URL+"/api/ws?token="+tokens.AccessToken+"&clientId=tab-b")
	defer func() { _ = connB.Close() }()
	drainFoodWSMessage(t, connA)
	drainFoodWSMessage(t, connB)

	createBody := map[string]any{
		"dateISO":         "2026-06-18",
		"foodCatalogueId": 1,
		"foodWeight":      120,
		"history":         []map[string]any{{"action": "init", "value": 120}},
	}
	assertJSONRequestStatus(t, http.MethodPost, server.URL+"/api/food/diary/", tokens.AccessToken, "tab-a", createBody, http.StatusCreated)

	_ = connA.SetReadDeadline(time.Now().Add(150 * time.Millisecond))
	var senderMessage map[string]any
	if err := connA.ReadJSON(&senderMessage); err == nil {
		t.Fatalf("sender received unexpected ws message: %+v", senderMessage)
	}

	_ = connB.SetReadDeadline(time.Now().Add(time.Second))
	var receiverMessage map[string]any
	if err := connB.ReadJSON(&receiverMessage); err != nil {
		t.Fatalf("ReadJSON() error = %v", err)
	}
	if receiverMessage["type"] != "DIARY_ENTRY_CREATED" {
		t.Fatalf("ws type = %v, want DIARY_ENTRY_CREATED", receiverMessage["type"])
	}

	assertJSONRequestStatus(t, http.MethodPut, server.URL+"/api/food/diary", tokens.AccessToken, "tab-a", map[string]any{
		"id":              10,
		"foodCatalogueId": 2,
		"foodWeight":      80,
		"history":         []map[string]any{{"action": "set", "value": 80}},
	}, http.StatusOK)

	assertJSONRequestStatus(t, http.MethodDelete, server.URL+"/api/food/diary/10", tokens.AccessToken, "tab-a", nil, http.StatusOK)
	assertJSONRequestStatus(t, http.MethodPost, server.URL+"/api/food/body-weight", tokens.AccessToken, "tab-a", map[string]any{
		"dateISO":    "2026-06-18",
		"bodyWeight": "81.0",
	}, http.StatusCreated)
	assertJSONRequestStatus(t, http.MethodDelete, server.URL+"/api/food/diary/day/2026-06-18", tokens.AccessToken, "tab-a", nil, http.StatusOK)
	assertJSONRequestStatus(t, http.MethodPost, server.URL+"/api/food/diary/day/2026-06-18/restore", tokens.AccessToken, "tab-a", map[string]any{
		"entries": []map[string]any{{
			"foodCatalogueId": 1,
			"foodWeight":      120,
			"history":         []map[string]any{{"action": "init", "value": 120}},
		}},
	}, http.StatusCreated)
	assertJSONRequestStatus(t, http.MethodGet, server.URL+"/api/food/coefficients-gen", tokens.AccessToken, "tab-a", nil, http.StatusOK)
}

func TestFoodReadEndpoints(t *testing.T) {
	db := openFoodTestDB(t)
	authRepo := auth.NewRepository(db)
	tokenManager := auth.NewTokenManager("test-secret", time.Hour, 24*time.Hour)
	authService := auth.NewService(authRepo, tokenManager)
	service := NewService(NewRepository(db))
	handler := NewHandler(service)

	router := chi.NewRouter()
	RegisterRoutes(router, authService, handler)
	server := httptest.NewServer(router)
	defer server.Close()

	tokens, err := tokenManager.Issue(auth.TokenClaims{UserID: 1, Username: "alice"})
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	assertJSONRequestStatus(t, http.MethodGet, server.URL+"/api/food/catalogue", tokens.AccessToken, "tab-a", nil, http.StatusOK)
	assertJSONRequestStatus(t, http.MethodGet, server.URL+"/api/food/coefficients", tokens.AccessToken, "tab-a", nil, http.StatusOK)
	assertJSONRequestStatus(t, http.MethodGet, server.URL+"/api/food/stats", tokens.AccessToken, "tab-a", nil, http.StatusOK)
	assertJSONRequestStatus(t, http.MethodGet, server.URL+"/api/food/diary-full-update?date=2026-06-17&offset=1", tokens.AccessToken, "tab-a", nil, http.StatusOK)

	request, err := http.NewRequest(http.MethodGet, server.URL+"/api/food/catalogue/1", nil)
	if err != nil {
		t.Fatalf("http.NewRequest() error = %v", err)
	}
	request.Header.Set("Authorization", "Bearer "+tokens.AccessToken)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("Do() error = %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", response.StatusCode)
	}

	var payload map[string]any
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("Decode() error = %v", err)
	}
	if payload["result"] != true {
		t.Fatalf("result = %v, want true", payload["result"])
	}
}

func assertJSONRequestStatus(t *testing.T, method string, url string, accessToken string, clientID string, payload any, wantStatus int) {
	t.Helper()

	var body *bytes.Reader
	if payload == nil {
		body = bytes.NewReader(nil)
	} else {
		jsonBody, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("Marshal() error = %v", err)
		}
		body = bytes.NewReader(jsonBody)
	}

	request, err := http.NewRequest(method, url, body)
	if err != nil {
		t.Fatalf("http.NewRequest() error = %v", err)
	}
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("X-Client-ID", clientID)
	if payload != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("Do() error = %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != wantStatus {
		t.Fatalf("status = %d, want %d", response.StatusCode, wantStatus)
	}
}

func dialFoodWS(t *testing.T, httpURL string) *websocket.Conn {
	t.Helper()

	wsURL := "ws" + httpURL[len("http"):]
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Dial() error = %v", err)
	}
	return conn
}

func drainFoodWSMessage(t *testing.T, conn *websocket.Conn) {
	t.Helper()

	_ = conn.SetReadDeadline(time.Now().Add(time.Second))
	var message map[string]any
	if err := conn.ReadJSON(&message); err != nil {
		t.Fatalf("ReadJSON() error = %v", err)
	}
}
