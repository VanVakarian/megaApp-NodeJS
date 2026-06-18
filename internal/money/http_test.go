package money

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"megaapp-back/internal/auth"

	"github.com/go-chi/chi/v5"
)

func TestMoneyRoutesSnapshotAndReferenceCrud(t *testing.T) {
	db := openMoneyTestDB(t)
	insertMoneyTestUser(t, db, 1, "alice")
	insertMoneyReferenceFixtures(t, db, 1)
	insertMoneyReadFixtures(t, db, 1)
	insertMoneyBrokerageAccount(t, db, 1, 2, "Brokerage", AccountKindBrokerage)

	authRepo := auth.NewRepository(db)
	tokenManager := auth.NewTokenManager("test-secret", time.Hour, 24*time.Hour)
	authService := auth.NewService(authRepo, tokenManager)
	handler := NewHandler(NewService(NewRepository(db)))

	router := chi.NewRouter()
	RegisterRoutes(router, authService, handler)
	server := httptest.NewServer(router)
	defer server.Close()

	tokens, err := tokenManager.Issue(auth.TokenClaims{UserID: 1, Username: "alice"})
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	assertMoneyStatus(t, http.MethodGet, server.URL+"/api/money/snapshot", tokens.AccessToken, nil, http.StatusOK)
	assertMoneyStatus(t, http.MethodGet, server.URL+"/api/money/organizations", tokens.AccessToken, nil, http.StatusOK)
	assertMoneyStatus(t, http.MethodGet, server.URL+"/api/money/currencies", tokens.AccessToken, nil, http.StatusOK)
	assertMoneyStatus(t, http.MethodGet, server.URL+"/api/money/categories", tokens.AccessToken, nil, http.StatusOK)
	assertMoneyStatus(t, http.MethodGet, server.URL+"/api/money/accounts", tokens.AccessToken, nil, http.StatusOK)
	assertMoneyStatus(t, http.MethodGet, server.URL+"/api/money/assets", tokens.AccessToken, nil, http.StatusOK)

	assertMoneyStatus(t, http.MethodPost, server.URL+"/api/money/organizations", tokens.AccessToken, map[string]any{"title": "Wallet"}, http.StatusCreated)
	assertMoneyStatus(t, http.MethodPut, server.URL+"/api/money/organizations/1", tokens.AccessToken, map[string]any{"title": "Updated Bank"}, http.StatusOK)

	assertMoneyStatus(t, http.MethodPost, server.URL+"/api/money/currencies", tokens.AccessToken, map[string]any{
		"title":         "Dollar",
		"ticker":        "USD",
		"symbol":        "$",
		"symbolPosEnum": "before",
		"whitespace":    false,
	}, http.StatusCreated)
	assertMoneyStatus(t, http.MethodPut, server.URL+"/api/money/currencies/1", tokens.AccessToken, map[string]any{
		"title":         "Ruble Updated",
		"ticker":        "RUB",
		"symbol":        "₽",
		"symbolPosEnum": "before",
		"whitespace":    false,
	}, http.StatusOK)

	assertMoneyStatus(t, http.MethodPost, server.URL+"/api/money/categories", tokens.AccessToken, map[string]any{
		"name":         "Salary",
		"categoryType": "income",
	}, http.StatusCreated)
	assertMoneyStatus(t, http.MethodPut, server.URL+"/api/money/categories/2", tokens.AccessToken, map[string]any{
		"name":         "Groceries Updated",
		"categoryType": "expense",
		"parentId":     1,
	}, http.StatusOK)

	assertMoneyStatus(t, http.MethodPost, server.URL+"/api/money/accounts", tokens.AccessToken, map[string]any{
		"title":          "Card",
		"currencyId":     1,
		"isInvest":       false,
		"isArchived":     false,
		"kind":           "card",
		"organizationId": 1,
	}, http.StatusCreated)
	assertMoneyStatus(t, http.MethodPut, server.URL+"/api/money/accounts/1", tokens.AccessToken, map[string]any{
		"title":          "Wallet Updated",
		"currencyId":     1,
		"isInvest":       false,
		"isArchived":     false,
		"kind":           "cash",
		"organizationId": 1,
	}, http.StatusOK)

	assertMoneyStatus(t, http.MethodPost, server.URL+"/api/money/assets", tokens.AccessToken, map[string]any{
		"title":          "Apple",
		"ticker":         "AAPL",
		"type":           "stock",
		"accountIds":     []int64{2, 2},
		"suspendedSince": "2026-06-01",
	}, http.StatusCreated)
	assertMoneyStatus(t, http.MethodPut, server.URL+"/api/money/assets/2", tokens.AccessToken, map[string]any{
		"title":          "Bitcoin",
		"ticker":         "BTC",
		"type":           "crypto",
		"accountIds":     []int64{2},
		"suspendedSince": nil,
		"suspendedUntil": nil,
	}, http.StatusOK)

	assertMoneyStatus(t, http.MethodDelete, server.URL+"/api/money/organizations/1", tokens.AccessToken, nil, http.StatusConflict)
	assertMoneyStatus(t, http.MethodDelete, server.URL+"/api/money/currencies/1", tokens.AccessToken, nil, http.StatusConflict)
	assertMoneyStatus(t, http.MethodDelete, server.URL+"/api/money/categories/1", tokens.AccessToken, nil, http.StatusConflict)
	assertMoneyStatus(t, http.MethodDelete, server.URL+"/api/money/accounts/1", tokens.AccessToken, nil, http.StatusConflict)
	assertMoneyStatus(t, http.MethodDelete, server.URL+"/api/money/assets/1", tokens.AccessToken, nil, http.StatusConflict)
	assertMoneyStatus(t, http.MethodDelete, server.URL+"/api/money/assets/2", tokens.AccessToken, nil, http.StatusOK)

	assertMoneyStatus(t, http.MethodDelete, server.URL+"/api/money/organizations/2", tokens.AccessToken, nil, http.StatusOK)
	assertMoneyStatus(t, http.MethodDelete, server.URL+"/api/money/currencies/2", tokens.AccessToken, nil, http.StatusOK)
	assertMoneyStatus(t, http.MethodDelete, server.URL+"/api/money/categories/3", tokens.AccessToken, nil, http.StatusOK)
	assertMoneyStatus(t, http.MethodDelete, server.URL+"/api/money/accounts/2", tokens.AccessToken, nil, http.StatusOK)
}

func assertMoneyStatus(t *testing.T, method string, url string, accessToken string, body any, wantStatus int) {
	t.Helper()

	var requestBody *bytes.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("json.Marshal() error = %v", err)
		}
		requestBody = bytes.NewReader(encoded)
	} else {
		requestBody = bytes.NewReader(nil)
	}

	request, err := http.NewRequest(method, url, requestBody)
	if err != nil {
		t.Fatalf("http.NewRequest() error = %v", err)
	}
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("Content-Type", "application/json")

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("Do() error = %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != wantStatus {
		var payload map[string]any
		_ = json.NewDecoder(response.Body).Decode(&payload)
		t.Fatalf("%s %s status = %d, want %d, body = %+v", method, url, response.StatusCode, wantStatus, payload)
	}
}
