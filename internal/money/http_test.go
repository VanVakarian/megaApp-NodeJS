package money

import (
	"bytes"
	"encoding/json"
	"fmt"
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

func TestMoneyRoutesTransactionsCrud(t *testing.T) {
	db := openMoneyTestDB(t)
	insertMoneyTestUser(t, db, 1, "alice")
	insertMoneyReferenceFixtures(t, db, 1)
	insertMoneyAccount(t, db, 1, 2, "Card", AccountKindCard)
	insertMoneyCategory(t, db, 1, 3, "Salary", nil, CategoryTypeIncome)

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

	assertMoneyStatus(t, http.MethodGet, server.URL+"/api/money/transactions", tokens.AccessToken, nil, http.StatusOK)

	incomeBody := map[string]any{
		"dateISO":    "2026-06-18",
		"accountId":  1,
		"amount":     1000,
		"categoryId": 3,
		"kind":       "income",
		"isGift":     true,
		"notes":      "Salary",
	}
	incomeResponse := assertMoneyJSON(t, http.MethodPost, server.URL+"/api/money/transactions", tokens.AccessToken, incomeBody, http.StatusCreated)
	incomeData := mustMoneyDataMap(t, incomeResponse)
	incomeID := int64(incomeData["id"].(float64))

	assertMoneyStatus(t, http.MethodPut, server.URL+"/api/money/transactions/"+jsonNumberID(incomeID), tokens.AccessToken, map[string]any{
		"dateISO":   "2026-06-19",
		"accountId": 1,
		"amount":    1100,
		"kind":      "income",
		"isGift":    false,
		"notes":     "Salary updated",
	}, http.StatusOK)

	transferResponse := assertMoneyJSON(t, http.MethodPost, server.URL+"/api/money/transactions", tokens.AccessToken, map[string]any{
		"dateISO":       "2026-06-20",
		"accountId":     1,
		"amount":        100,
		"twinAccountId": 2,
		"twinAmount":    95,
		"kind":          "transfer",
		"isGift":        false,
		"categoryId":    nil,
		"notes":         "Move",
	}, http.StatusCreated)
	transferData := mustMoneyDataMap(t, transferResponse)
	transferID := int64(transferData["id"].(float64))
	twinID := int64(transferData["twinId"].(float64))

	assertMoneyStatus(t, http.MethodPut, server.URL+"/api/money/transactions/"+jsonNumberID(transferID), tokens.AccessToken, map[string]any{
		"dateISO":       "2026-06-21",
		"accountId":     1,
		"amount":        120,
		"twinAccountId": 2,
		"twinAmount":    118,
		"kind":          "transfer",
		"isGift":        false,
		"categoryId":    nil,
		"notes":         "Move updated",
	}, http.StatusOK)

	assertMoneyStatus(t, http.MethodDelete, server.URL+"/api/money/transactions/"+jsonNumberID(incomeID), tokens.AccessToken, nil, http.StatusOK)
	assertMoneyStatus(t, http.MethodDelete, server.URL+"/api/money/transactions/"+jsonNumberID(transferID), tokens.AccessToken, nil, http.StatusOK)

	var count int64
	if err := db.QueryRow(`SELECT COUNT(*) FROM moneyTransaction WHERE id IN (?, ?)`, transferID, twinID).Scan(&count); err != nil {
		t.Fatalf("QueryRow() error = %v", err)
	}
	if count != 0 {
		t.Fatalf("transfer pair rows count = %d, want 0", count)
	}
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

func assertMoneyJSON(t *testing.T, method string, url string, accessToken string, body any, wantStatus int) map[string]any {
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

	var payload map[string]any
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("Decode() error = %v", err)
	}
	if response.StatusCode != wantStatus {
		t.Fatalf("%s %s status = %d, want %d, body = %+v", method, url, response.StatusCode, wantStatus, payload)
	}
	return payload
}

func mustMoneyDataMap(t *testing.T, payload map[string]any) map[string]any {
	t.Helper()
	data, ok := payload["data"].(map[string]any)
	if !ok {
		t.Fatalf("payload data = %+v, want map", payload["data"])
	}
	return data
}

func jsonNumberID(id int64) string {
	return fmt.Sprintf("%d", id)
}
