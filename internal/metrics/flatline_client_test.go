package metrics

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestNewFlatlineClientDisablesKeepAlives(t *testing.T) {
	client := NewFlatlineClient("http://flatline", time.Second)
	transport, ok := client.client.Transport.(*http.Transport)
	if !ok {
		t.Fatalf("Transport = %T, want *http.Transport", client.client.Transport)
	}
	if !transport.DisableKeepAlives {
		t.Fatal("DisableKeepAlives = false, want true")
	}
}

func TestFlatlineClientPushSnapshotsSendsExpectedBody(t *testing.T) {
	var receivedRequest pushRequest

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/metrics/snapshots" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&receivedRequest); err != nil {
			t.Fatalf("Decode() error = %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(pushResponse{Result: true})
	}))
	defer server.Close()

	client := NewFlatlineClient(server.URL, time.Second)
	snapshots := []MinuteSnapshot{{MinuteBucket: 120, Metrics: map[string]float64{"food_diary_entry_created": 2}}}

	if err := client.PushSnapshots(context.Background(), "megaapp", snapshots); err != nil {
		t.Fatalf("PushSnapshots() error = %v", err)
	}

	if receivedRequest.Service != "megaapp" {
		t.Fatalf("Service = %q, want megaapp", receivedRequest.Service)
	}
	if len(receivedRequest.Snapshots) != 1 || receivedRequest.Snapshots[0].MinuteBucket != 120 {
		t.Fatalf("Snapshots = %+v, want one snapshot at bucket 120", receivedRequest.Snapshots)
	}
	if receivedRequest.Snapshots[0].Granularity != GranularityMinute {
		t.Fatalf("Granularity = %q, want %q", receivedRequest.Snapshots[0].Granularity, GranularityMinute)
	}
}

func TestFlatlineClientPushSnapshotsReturnsErrorOnRejection(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(pushResponse{Result: false})
	}))
	defer server.Close()

	client := NewFlatlineClient(server.URL, time.Second)
	err := client.PushSnapshots(context.Background(), "megaapp", []MinuteSnapshot{{MinuteBucket: 60, Metrics: map[string]float64{"a": 1}}})
	if err == nil {
		t.Fatal("PushSnapshots() error = nil, want error")
	}
}

func TestFlatlineClientPushSnapshotsReturnsErrorOnNonOKStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte("bad request"))
	}))
	defer server.Close()

	client := NewFlatlineClient(server.URL, time.Second)
	err := client.PushSnapshots(context.Background(), "megaapp", []MinuteSnapshot{{MinuteBucket: 60, Metrics: map[string]float64{"a": 1}}})
	if err == nil {
		t.Fatal("PushSnapshots() error = nil, want error")
	}
}

func TestFlatlineClientSinceReturnsPoints(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/metrics/since" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		if r.URL.Query().Get("cursor") != "100" {
			t.Fatalf("cursor = %q, want 100", r.URL.Query().Get("cursor"))
		}
		if r.URL.Query().Get("minuteSince") != "10" || r.URL.Query().Get("hourSince") != "20" || r.URL.Query().Get("daySince") != "30" {
			t.Fatalf("floors = %q/%q/%q, want 10/20/30", r.URL.Query().Get("minuteSince"), r.URL.Query().Get("hourSince"), r.URL.Query().Get("daySince"))
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(sinceResponse{Points: []MetricPoint{{Service: "megaapp", Name: "a", Bucket: 120, Value: 1}}})
	}))
	defer server.Close()

	client := NewFlatlineClient(server.URL, time.Second)
	points, err := client.Since(context.Background(), 100, 10, 20, 30)
	if err != nil {
		t.Fatalf("Since() error = %v", err)
	}
	if len(points) != 1 || points[0].Name != "a" {
		t.Fatalf("points = %+v, want one point named a", points)
	}
}

func TestFlatlineClientSinceReturnsErrorOnNonOKStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	client := NewFlatlineClient(server.URL, time.Second)
	if _, err := client.Since(context.Background(), 0, 0, 0, 0); err == nil {
		t.Fatal("Since() error = nil, want error")
	}
}

func TestFlatlineClientHistorySendsFloorsAndReturnsAllServices(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()
		if r.URL.Path != "/api/metrics/history" {
			t.Fatalf("path = %s, want metrics history", r.URL.Path)
		}
		if query.Get("service") != "" || query.Get("names") != "" || query.Get("minuteSince") != "60" || query.Get("hourSince") != "120" || query.Get("daySince") != "180" {
			t.Fatalf("query = %s, want only history floors", r.URL.RawQuery)
		}
		_ = json.NewEncoder(w).Encode(historyResponse{
			Histories: []ServiceHistory{
				{Service: "bot-a", Snapshots: []MetricSnapshot{{Granularity: GranularityMinute, Bucket: 180, Metrics: map[string]float64{"a": 1}}}},
				{Service: "bot-b", Snapshots: []MetricSnapshot{{Granularity: GranularityHour, Bucket: 3600, Metrics: map[string]float64{"b": 2}}}},
			},
		})
	}))
	defer server.Close()

	client := NewFlatlineClient(server.URL, time.Second)
	histories, err := client.History(context.Background(), 60, 120, 180)
	if err != nil {
		t.Fatalf("History() error = %v", err)
	}
	if len(histories) != 2 || histories[0].Service != "bot-a" || histories[1].Snapshots[0].Metrics["b"] != 2 {
		t.Fatalf("histories = %+v, want both services", histories)
	}
}
