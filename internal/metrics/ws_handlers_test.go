package metrics

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"sync"
	"testing"
	"time"

	"megaapp-back/internal/auth"
	"megaapp-back/internal/ws"

	"github.com/go-chi/chi/v5"

	_ "modernc.org/sqlite"
)

func TestSubscribeHandlerSendsPerGranularityPagesToFlatline(t *testing.T) {
	now := time.Date(2026, 6, 30, 12, 0, 0, 0, time.UTC)
	clock := fixedMetricsClock{now: now}

	var receivedQueries []url.Values
	var receivedMu sync.Mutex
	flatlineServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedMu.Lock()
		receivedQueries = append(receivedQueries, r.URL.Query())
		receivedMu.Unlock()
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

	receivedMu.Lock()
	defer receivedMu.Unlock()

	if len(receivedQueries) != 3 {
		t.Fatalf("len(receivedQueries) = %d, want 3", len(receivedQueries))
	}

	floors := map[string]string{
		GranularityMinute: fmtInt(now.Unix() - minuteRelayWindowSeconds),
		GranularityHour:   fmtInt(now.Unix() - hourRelayWindowSeconds),
		GranularityDay:    fmtInt(now.Unix() - dayRelayWindowSeconds),
	}
	for index, granularity := range []string{GranularityMinute, GranularityHour, GranularityDay} {
		query := receivedQueries[index]
		if query.Get("cursor") != "0" || query.Get("granularity") != granularity {
			t.Fatalf("query = %s, want cursor=0 and granularity=%s", query.Encode(), granularity)
		}
		for _, floorName := range []string{"minuteSince", "hourSince", "daySince"} {
			want := "0"
			if floorName == granularity+"Since" {
				want = floors[granularity]
			}
			if got := query.Get(floorName); got != want {
				t.Fatalf("%s = %q, want %q", floorName, got, want)
			}
		}
	}
}

func fmtInt(v int64) string {
	return strconv.FormatInt(v, 10)
}
