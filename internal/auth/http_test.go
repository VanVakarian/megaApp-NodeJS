package auth

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	_ "modernc.org/sqlite"
)

func TestAuthEndpointsAndMiddleware(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("sql.Open() error = %v", err)
	}
	defer func() { _ = db.Close() }()

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

	repo := NewRepository(db)
	service := NewService(repo, NewTokenManager("test-secret", time.Hour, 24*time.Hour))
	handler := NewHandler(service)

	router := chi.NewRouter()
	RegisterRoutes(router, handler)

	server := httptest.NewServer(router)
	defer server.Close()

	registerPayload := map[string]string{"username": "alice", "password": "password123"}
	registerResponse := doJSONRequest(t, server.URL+"/api/auth/register", registerPayload)
	if registerResponse.StatusCode != http.StatusCreated {
		t.Fatalf("register status = %d, want 201", registerResponse.StatusCode)
	}
	_ = registerResponse.Body.Close()

	loginPayload := map[string]string{"username": "alice", "password": "password123"}
	loginResponse := doJSONRequest(t, server.URL+"/api/auth/login", loginPayload)
	if loginResponse.StatusCode != http.StatusOK {
		t.Fatalf("login status = %d, want 200", loginResponse.StatusCode)
	}

	var tokens TokenPair
	if err := json.NewDecoder(loginResponse.Body).Decode(&tokens); err != nil {
		t.Fatalf("Decode() error = %v", err)
	}
	_ = loginResponse.Body.Close()

	if tokens.AccessToken == "" || tokens.RefreshToken == "" {
		t.Fatal("login returned empty tokens")
	}

	refreshPayload := map[string]string{"refreshToken": tokens.RefreshToken}
	refreshResponse := doJSONRequest(t, server.URL+"/api/auth/refresh", refreshPayload)
	if refreshResponse.StatusCode != http.StatusOK {
		t.Fatalf("refresh status = %d, want 200", refreshResponse.StatusCode)
	}
	_ = refreshResponse.Body.Close()

	verifyRequest, err := http.NewRequest(http.MethodGet, server.URL+"/api/auth/verify", nil)
	if err != nil {
		t.Fatalf("NewRequest() error = %v", err)
	}
	verifyRequest.Header.Set("Authorization", "Bearer "+tokens.AccessToken)
	verifyResponse, err := http.DefaultClient.Do(verifyRequest)
	if err != nil {
		t.Fatalf("Do() error = %v", err)
	}
	if verifyResponse.StatusCode != http.StatusOK {
		t.Fatalf("verify status = %d, want 200", verifyResponse.StatusCode)
	}
	_ = verifyResponse.Body.Close()

	protectedHandler := Middleware(service)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := UserClaimsFromContext(r.Context())
		if !ok {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"id": claims.UserID, "username": claims.Username})
	}))

	protectedRequest := httptest.NewRequest(http.MethodGet, "/protected", nil)
	protectedRequest.Header.Set("Authorization", "Bearer "+tokens.AccessToken)
	protectedRecorder := httptest.NewRecorder()
	protectedHandler.ServeHTTP(protectedRecorder, protectedRequest)
	if protectedRecorder.Code != http.StatusOK {
		t.Fatalf("protected status = %d, want 200", protectedRecorder.Code)
	}

	unauthorizedRequest := httptest.NewRequest(http.MethodGet, "/protected", nil)
	unauthorizedRecorder := httptest.NewRecorder()
	protectedHandler.ServeHTTP(unauthorizedRecorder, unauthorizedRequest)
	if unauthorizedRecorder.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d, want 401", unauthorizedRecorder.Code)
	}
}

func doJSONRequest(t *testing.T, url string, payload any) *http.Response {
	t.Helper()

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}

	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("http.Post() error = %v", err)
	}

	return resp
}
