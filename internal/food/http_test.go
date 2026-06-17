package food

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"megaapp-back/internal/auth"

	"github.com/go-chi/chi/v5"
)

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

	_, err := authService.Register(t.Context(), "bob", "password123")
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}
	tokens, err := tokenManager.Issue(auth.TokenClaims{UserID: 1, Username: "alice"})
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	assertGetStatus(t, server.URL+"/api/food/catalogue", tokens.AccessToken, http.StatusOK)
	assertGetStatus(t, server.URL+"/api/food/coefficients", tokens.AccessToken, http.StatusOK)
	assertGetStatus(t, server.URL+"/api/food/stats", tokens.AccessToken, http.StatusOK)
	assertGetStatus(t, server.URL+"/api/food/diary-full-update?date=2026-06-17&offset=1", tokens.AccessToken, http.StatusOK)

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

func assertGetStatus(t *testing.T, url string, accessToken string, wantStatus int) {
	t.Helper()

	request, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		t.Fatalf("http.NewRequest() error = %v", err)
	}
	request.Header.Set("Authorization", "Bearer "+accessToken)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("Do() error = %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != wantStatus {
		t.Fatalf("status = %d, want %d", response.StatusCode, wantStatus)
	}
}
