package food

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
	"testing"
	"time"

	"megaapp-back/internal/auth"
	clockplatform "megaapp-back/internal/platform/clock"
	"megaapp-back/internal/platform/idempotency"
	wspkg "megaapp-back/internal/ws"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
)

type fakeMetricsRecorder struct {
	counts map[string]int
}

func (f *fakeMetricsRecorder) Increment(name string) {
	if f.counts == nil {
		f.counts = make(map[string]int)
	}
	f.counts[name]++
}

func TestFoodWriteEndpointsAndWebSocketBroadcasts(t *testing.T) {
	db := openFoodTestDB(t)
	authRepo := auth.NewRepository(db)
	tokenManager := auth.NewTokenManager("test-secret", time.Hour, 24*time.Hour)
	authService := auth.NewService(authRepo, tokenManager)
	service := NewService(NewRepository(db), idempotency.NewStore(db))
	service.SetProductGenerator(fakeProductGenerator{})
	service.SetClock(fixedFoodClock{now: time.Date(2026, time.June, 20, 12, 0, 0, 0, time.UTC)})
	seedFoodDiaryAndWeightHistory(t, db, 1)
	hub := wspkg.NewHub(time.Second, wspkg.NewSyncState())
	defer func() { _ = hub.Close() }()
	clk := clockplatform.NewRealClock()
	realtime := NewWSRealtimePublisher(hub, clk)
	readHandler := NewHandler(service, realtime)
	hub.RegisterHandler("SEARCH_QUERY", NewSearchWSHandler(service, clk))
	writeHandler := NewWriteHandler(service, realtime, &fakeMetricsRecorder{})
	catalogueHandler := NewCatalogueHandler(service, realtime, &fakeMetricsRecorder{})
	wsHandler := wspkg.NewHandler(authService, hub)

	router := chi.NewRouter()
	RegisterRoutes(router, authService, readHandler)
	RegisterWriteRoutes(router, authService, writeHandler)
	RegisterCatalogueRoutes(router, authService, catalogueHandler)
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
		"operationId":     "op-create",
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
		"operationId":     "op-edit",
		"id":              10,
		"foodCatalogueId": 2,
		"foodWeight":      80,
		"historyAction":   "set",
	}, http.StatusOK)
	_ = connB.SetReadDeadline(time.Now().Add(time.Second))
	var updatedMessage map[string]any
	if err := connB.ReadJSON(&updatedMessage); err != nil {
		t.Fatalf("ReadJSON() error = %v", err)
	}
	if updatedMessage["type"] != "DIARY_ENTRY_UPDATED" {
		t.Fatalf("ws type = %v, want DIARY_ENTRY_UPDATED", updatedMessage["type"])
	}
	if payload, ok := updatedMessage["payload"].(map[string]any); !ok || payload["version"] != float64(1) {
		t.Fatalf("updatedMessage payload version = %v, want 1", updatedMessage["payload"])
	}

	assertJSONRequestStatus(t, http.MethodDelete, server.URL+"/api/food/diary/10", tokens.AccessToken, "tab-a", map[string]any{"operationId": "op-delete"}, http.StatusOK)
	assertJSONRequestStatus(t, http.MethodPost, server.URL+"/api/food/body-weight", tokens.AccessToken, "tab-a", map[string]any{
		"operationId": "op-weight",
		"dateISO":     "2026-06-18",
		"bodyWeight":  "81.0",
	}, http.StatusCreated)
	assertJSONRequestStatus(t, http.MethodDelete, server.URL+"/api/food/diary/day/2026-06-18", tokens.AccessToken, "tab-a", map[string]any{"operationId": "op-day-delete"}, http.StatusOK)
	assertJSONRequestStatus(t, http.MethodPost, server.URL+"/api/food/diary/day/2026-06-18/restore", tokens.AccessToken, "tab-a", map[string]any{
		"operationId": "op-restore",
		"entries": []map[string]any{{
			"foodCatalogueId": 1,
			"foodWeight":      120,
			"history":         []map[string]any{{"action": "init", "value": 120}},
		}},
	}, http.StatusCreated)
	assertJSONRequestStatus(t, http.MethodGet, server.URL+"/api/food/personal-kcals", tokens.AccessToken, "tab-a", nil, http.StatusOK)
}

func TestFoodDiaryEditRetryIsIdempotentOverHTTPAndWS(t *testing.T) {
	db := openFoodTestDB(t)
	authRepo := auth.NewRepository(db)
	tokenManager := auth.NewTokenManager("test-secret", time.Hour, 24*time.Hour)
	authService := auth.NewService(authRepo, tokenManager)
	service := NewService(NewRepository(db), idempotency.NewStore(db))
	hub := wspkg.NewHub(time.Second, wspkg.NewSyncState())
	defer func() { _ = hub.Close() }()
	clk := clockplatform.NewRealClock()
	realtime := NewWSRealtimePublisher(hub, clk)
	writeHandler := NewWriteHandler(service, realtime, &fakeMetricsRecorder{})
	wsHandler := wspkg.NewHandler(authService, hub)

	router := chi.NewRouter()
	RegisterWriteRoutes(router, authService, writeHandler)
	wspkg.RegisterRoutes(router, wsHandler)
	server := httptest.NewServer(router)
	defer server.Close()

	tokens, err := tokenManager.Issue(auth.TokenClaims{UserID: 1, Username: "alice"})
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	connB := dialFoodWS(t, server.URL+"/api/ws?token="+tokens.AccessToken+"&clientId=tab-b")
	defer func() { _ = connB.Close() }()
	drainFoodWSMessage(t, connB)

	editBody := map[string]any{
		"operationId":     "op-retry",
		"id":              10,
		"foodCatalogueId": 2,
		"foodWeight":      80,
		"historyAction":   "subtract",
	}

	first := decodeJSONRequest(t, http.MethodPut, server.URL+"/api/food/diary", tokens.AccessToken, "tab-a", editBody, http.StatusOK)
	if first["appliedHistoryEntry"] == nil {
		t.Fatalf("first response appliedHistoryEntry = %v, want a real entry", first["appliedHistoryEntry"])
	}
	if first["version"] != float64(1) {
		t.Fatalf("first response version = %v, want 1", first["version"])
	}
	_ = connB.SetReadDeadline(time.Now().Add(time.Second))
	var updatedMessage map[string]any
	if err := connB.ReadJSON(&updatedMessage); err != nil {
		t.Fatalf("ReadJSON() error = %v", err)
	}
	if updatedMessage["type"] != "DIARY_ENTRY_UPDATED" {
		t.Fatalf("ws type = %v, want DIARY_ENTRY_UPDATED", updatedMessage["type"])
	}

	retry := decodeJSONRequest(t, http.MethodPut, server.URL+"/api/food/diary", tokens.AccessToken, "tab-a", editBody, http.StatusOK)
	if retry["appliedHistoryEntry"] == nil {
		t.Fatalf("retry response appliedHistoryEntry = %v, want the original applied entry echoed back (same operationId)", retry["appliedHistoryEntry"])
	}
	if retry["version"] != first["version"] {
		t.Fatalf("retry response version = %v, want %v (replay echoes cached version)", retry["version"], first["version"])
	}
	_ = connB.SetReadDeadline(time.Now().Add(200 * time.Millisecond))
	var unexpectedMessage map[string]any
	if err := connB.ReadJSON(&unexpectedMessage); err == nil {
		t.Fatalf("received unexpected ws message on retry: %+v", unexpectedMessage)
	}
}

func TestFoodSearchAndCatalogueMutationEndpoints(t *testing.T) {
	db := openFoodTestDB(t)
	authRepo := auth.NewRepository(db)
	tokenManager := auth.NewTokenManager("test-secret", time.Hour, 24*time.Hour)
	authService := auth.NewService(authRepo, tokenManager)
	service := NewService(NewRepository(db), idempotency.NewStore(db))
	service.SetProductGenerator(fakeProductGenerator{})
	service.SetImageAnalyzer(fakeImageAnalyzer{name: "Apple"})
	hub := wspkg.NewHub(time.Second, wspkg.NewSyncState())
	defer func() { _ = hub.Close() }()
	clk := clockplatform.NewRealClock()
	realtime := NewWSRealtimePublisher(hub, clk)
	readHandler := NewHandler(service, realtime)
	hub.RegisterHandler("SEARCH_QUERY", NewSearchWSHandler(service, clk))
	catalogueHandler := NewCatalogueHandler(service, realtime, &fakeMetricsRecorder{})
	wsHandler := wspkg.NewHandler(authService, hub)

	router := chi.NewRouter()
	RegisterRoutes(router, authService, readHandler)
	RegisterCatalogueRoutes(router, authService, catalogueHandler)
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

	if err := connA.WriteJSON(map[string]any{"type": "SEARCH_QUERY", "query": "apple-semantic", "sequenceNumber": 1}); err != nil {
		t.Fatalf("WriteJSON() error = %v", err)
	}
	_ = connA.SetReadDeadline(time.Now().Add(time.Second))
	var searchMessage map[string]any
	if err := connA.ReadJSON(&searchMessage); err != nil {
		t.Fatalf("ReadJSON() error = %v", err)
	}
	if searchMessage["type"] != "SEARCH_RESULTS" {
		t.Fatalf("type = %v, want SEARCH_RESULTS", searchMessage["type"])
	}

	assertJSONRequestStatus(t, http.MethodGet, server.URL+"/api/food/search?query=apple-semantic", tokens.AccessToken, "tab-a", nil, http.StatusOK)
	assertJSONRequestStatus(t, http.MethodPost, server.URL+"/api/food/generate-product-preview", tokens.AccessToken, "tab-a", map[string]any{"description": "apple-semantic"}, http.StatusOK)
	assertJSONRequestStatus(t, http.MethodPost, server.URL+"/api/food/analyze-voice", tokens.AccessToken, "tab-a", map[string]any{"transcript": "apple-semantic"}, http.StatusOK)
	assertMultipartRequestStatus(t, server.URL+"/api/food/analyze-image", tokens.AccessToken, "tab-a", []byte("fake-image-bytes"), http.StatusOK)
	assertJSONRequestStatus(t, http.MethodPost, server.URL+"/api/food/save-product", tokens.AccessToken, "tab-a", map[string]any{
		"name":        "Orange",
		"kcals":       47,
		"protein":     1,
		"fat":         0,
		"carbs":       12,
		"fiber":       2,
		"description": "Orange fruit",
	}, http.StatusCreated)
	_ = connB.SetReadDeadline(time.Now().Add(time.Second))
	var savedMessage map[string]any
	if err := connB.ReadJSON(&savedMessage); err != nil {
		t.Fatalf("ReadJSON() error = %v", err)
	}
	if savedMessage["type"] != "CATALOGUE_ENTRY_SAVED" {
		t.Fatalf("type = %v, want CATALOGUE_ENTRY_SAVED", savedMessage["type"])
	}
	assertJSONRequestStatus(t, http.MethodDelete, server.URL+"/api/food/catalogue/3", tokens.AccessToken, "tab-a", nil, http.StatusOK)
}

func TestFoodImageStaticRoutes(t *testing.T) {
	publicDir := t.TempDir()
	store, err := NewImageStore(publicDir)
	if err != nil {
		t.Fatalf("NewImageStore() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(publicDir, "images", "food", "1-thumb-v3.webp"), []byte("thumb"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	router := chi.NewRouter()
	RegisterImageRoutes(router, NewImageHandler(store))
	server := httptest.NewServer(router)
	defer server.Close()

	response, err := http.Get(server.URL + "/api/images/food/1-thumb-v3.webp")
	if err != nil {
		t.Fatalf("http.Get() error = %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", response.StatusCode)
	}

	response, err = http.Get(server.URL + "/api/images/food/../secret.txt")
	if err != nil {
		t.Fatalf("http.Get() error = %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", response.StatusCode)
	}
}

func TestFoodDebugRunPersonalKcalJobRoute(t *testing.T) {
	db := openFoodTestDB(t)
	seedFoodDiaryAndWeightHistory(t, db, 1)
	service := NewService(NewRepository(db), idempotency.NewStore(db))
	service.SetClock(fixedFoodClock{now: time.Date(2026, time.July, 5, 12, 0, 0, 0, time.UTC)})
	service.SetPersonalKcalConfig(testPersonalKcalConfig())
	debugHandler := NewDebugHandler(NewDebugService(NewRepository(db), t.TempDir(), nil, service, nil))

	router := chi.NewRouter()
	RegisterDebugRoutes(router, debugHandler)
	server := httptest.NewServer(router)
	defer server.Close()

	response, err := http.Get(server.URL + "/api/debug/run-personal-kcal-job")
	if err != nil {
		t.Fatalf("http.Get() error = %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", response.StatusCode)
	}

	resetResponse, err := http.Post(server.URL+"/api/debug/reset-personal-kcal/1", "application/json", nil)
	if err != nil {
		t.Fatalf("http.Post() error = %v", err)
	}
	defer resetResponse.Body.Close()
	if resetResponse.StatusCode != http.StatusOK {
		t.Fatalf("reset status = %d, want 200", resetResponse.StatusCode)
	}

	resetAllResponse, err := http.Post(server.URL+"/api/debug/reset-personal-kcal-all", "application/json", nil)
	if err != nil {
		t.Fatalf("http.Post() error = %v", err)
	}
	defer resetAllResponse.Body.Close()
	if resetAllResponse.StatusCode != http.StatusOK {
		t.Fatalf("reset-all status = %d, want 200", resetAllResponse.StatusCode)
	}
}

func TestFoodReadEndpoints(t *testing.T) {
	db := openFoodTestDB(t)
	authRepo := auth.NewRepository(db)
	tokenManager := auth.NewTokenManager("test-secret", time.Hour, 24*time.Hour)
	authService := auth.NewService(authRepo, tokenManager)
	service := NewService(NewRepository(db), idempotency.NewStore(db))
	service.SetProductGenerator(fakeProductGenerator{})
	handler := NewHandler(service, nil)
	hub := wspkg.NewHub(time.Second, wspkg.NewSyncState())
	defer func() { _ = hub.Close() }()
	clk := clockplatform.NewRealClock()
	realtime := NewWSRealtimePublisher(hub, clk)
	catalogueHandler := NewCatalogueHandler(service, realtime, &fakeMetricsRecorder{})

	router := chi.NewRouter()
	RegisterRoutes(router, authService, handler)
	RegisterCatalogueRoutes(router, authService, catalogueHandler)
	server := httptest.NewServer(router)
	defer server.Close()

	tokens, err := tokenManager.Issue(auth.TokenClaims{UserID: 1, Username: "alice"})
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	assertJSONRequestStatus(t, http.MethodGet, server.URL+"/api/food/catalogue", tokens.AccessToken, "tab-a", nil, http.StatusOK)
	assertJSONRequestStatus(t, http.MethodGet, server.URL+"/api/food/personal-kcals", tokens.AccessToken, "tab-a", nil, http.StatusOK)
	assertJSONRequestStatus(t, http.MethodGet, server.URL+"/api/food/stats", tokens.AccessToken, "tab-a", nil, http.StatusOK)
	assertJSONRequestStatus(t, http.MethodGet, server.URL+"/api/food/search?query=apple-semantic", tokens.AccessToken, "tab-a", nil, http.StatusOK)
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

func decodeJSONRequest(t *testing.T, method string, url string, accessToken string, clientID string, payload any, wantStatus int) map[string]any {
	t.Helper()

	jsonBody, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}

	request, err := http.NewRequest(method, url, bytes.NewReader(jsonBody))
	if err != nil {
		t.Fatalf("http.NewRequest() error = %v", err)
	}
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("X-Client-ID", clientID)
	request.Header.Set("Content-Type", "application/json")

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("Do() error = %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != wantStatus {
		t.Fatalf("status = %d, want %d", response.StatusCode, wantStatus)
	}

	var decoded map[string]any
	if err := json.NewDecoder(response.Body).Decode(&decoded); err != nil {
		t.Fatalf("Decode() error = %v", err)
	}
	return decoded
}

func assertMultipartRequestStatus(t *testing.T, url string, accessToken string, clientID string, fileData []byte, wantStatus int) {
	t.Helper()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	headers := make(textproto.MIMEHeader)
	headers.Set("Content-Disposition", `form-data; name="image"; filename="photo.png"`)
	headers.Set("Content-Type", "image/png")
	part, err := writer.CreatePart(headers)
	if err != nil {
		t.Fatalf("CreatePart() error = %v", err)
	}
	if _, err := part.Write(fileData); err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}

	request, err := http.NewRequest(http.MethodPost, url, &body)
	if err != nil {
		t.Fatalf("http.NewRequest() error = %v", err)
	}
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("X-Client-ID", clientID)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("Do() error = %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != wantStatus {
		t.Fatalf("status = %d, want %d", response.StatusCode, wantStatus)
	}
}

type fakeImageAnalyzer struct {
	name string
}

func (f fakeImageAnalyzer) AnalyzeFoodImage(_ context.Context, _ []byte, _ string) (string, error) {
	return f.name, nil
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
