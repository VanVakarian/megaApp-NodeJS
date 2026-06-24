package metrics

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHandlerIngestSnapshots(t *testing.T) {
	db := openMetricsTestDB(t)
	repo := NewRepository(db)
	service := NewService(repo, fixedMetricsClock{now: time.Date(2026, 6, 23, 12, 35, 0, 0, time.UTC)}, fakeAdminLister{})
	handler := NewHandler(service, NewRealtime(nil))

	body := IngestRequest{
		Service: SpreadCaptureBotServiceName,
		Snapshots: []SnapshotInput{
			{
				MinuteBucket: time.Date(2026, 6, 23, 12, 34, 0, 0, time.UTC).Unix(),
				Metrics: map[string]float64{
					"heartbeat": 1,
				},
			},
		},
	}

	payload, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/metrics/snapshots", bytes.NewReader(payload))
	recorder := httptest.NewRecorder()

	handler.IngestSnapshots(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	points, err := service.ListSince(context.Background(), 0)
	if err != nil {
		t.Fatalf("ListSince() error = %v", err)
	}
	if len(points) != 1 {
		t.Fatalf("len(points) = %d, want 1", len(points))
	}
}
