package metrics

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"
	"time"

	"megaapp-back/internal/auth"
	"megaapp-back/internal/ws"

	"github.com/go-chi/chi/v5"

	_ "modernc.org/sqlite"
)

// TestSubscribeHandlerSendsPerGranularityFloorsToFlatline is the regression
// test for the production incident this replaces: METRICS_SUBSCRIBE used to
// fetch Flatline's entire retained history (cursor=0, no other bound) and
// filter it down in Go afterwards — at real data volume (weeks of minute
// rows across every service) that response was tens of MB and blew the HTTP
// client's timeout, silently failing the whole backfill. Bounds now travel
// in the request itself so Flatline only has to seek its index, not scan
// and ship everything.
func TestSubscribeHandlerSendsPerGranularityFloorsToFlatline(t *testing.T) {
	now := time.Date(2026, 6, 30, 12, 0, 0, 0, time.UTC)
	clock := fixedMetricsClock{now: now}

	var receivedQuery url.Values
	flatlineServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedQuery = r.URL.Query()
		_ = json.NewEncoder(w).Encode(sinceResponse{Points: nil})
	}))
	defer flatlineServer.Close()

	authDB, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("sql.Open() error = %v", err)
	}
	defer authDB.Close()
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
	adminUserID := registerAdminUser(t, authService, authDB, "admin")
	adminTokens, err := tokenManager.Issue(auth.TokenClaims{UserID: adminUserID, Username: "admin", IsAdmin: true})
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}

	service := NewService(MainServiceName, clock, authService)
	hub := ws.NewHub(time.Second, ws.NewSyncState())
	defer hub.Close()
	realtime := NewRealtime(hub)
	flatlineClient := NewFlatlineClient(flatlineServer.URL, time.Second)

	hub.RegisterHandler("METRICS_SUBSCRIBE", NewSubscribeHandler(service, realtime, flatlineClient, clock, discardLogger()))

	wsHandler := ws.NewHandler(authService, hub)
	router := chi.NewRouter()
	ws.RegisterRoutes(router, wsHandler)
	server := httptest.NewServer(router)
	defer server.Close()

	conn := dialMetricsWS(t, server.URL+"/api/ws?token="+adminTokens.AccessToken+"&clientId=admin-tab")
	defer conn.Close()
	drainMetricsMessage(t, conn)

	if err := conn.WriteJSON(map[string]any{"type": "METRICS_SUBSCRIBE"}); err != nil {
		t.Fatalf("WriteJSON() error = %v", err)
	}
	drainMetricsMessage(t, conn)

	if receivedQuery == nil {
		t.Fatal("Flatline never received a request")
	}
	wantMinute := now.Unix() - minuteRelayWindowSeconds
	wantHour := now.Unix() - hourRelayWindowSeconds
	wantDay := now.Unix() - dayRelayWindowSeconds
	if got := receivedQuery.Get("minuteSince"); got != fmtInt(wantMinute) {
		t.Fatalf("minuteSince = %q, want %d", got, wantMinute)
	}
	if got := receivedQuery.Get("hourSince"); got != fmtInt(wantHour) {
		t.Fatalf("hourSince = %q, want %d", got, wantHour)
	}
	if got := receivedQuery.Get("daySince"); got != fmtInt(wantDay) {
		t.Fatalf("daySince = %q, want %d", got, wantDay)
	}
	if got := receivedQuery.Get("cursor"); got != "0" {
		t.Fatalf("cursor = %q, want 0", got)
	}
}

func fmtInt(v int64) string {
	return strconv.FormatInt(v, 10)
}
