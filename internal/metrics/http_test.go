package metrics

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
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

func TestDebugHandlerImportNDJSON(t *testing.T) {
	db := openMetricsTestDB(t)
	repo := NewRepository(db)
	service := NewService(repo, fixedMetricsClock{now: time.Now()}, fakeAdminLister{})
	handler := NewDebugHandler(service)

	bucket := time.Date(2026, 6, 23, 12, 34, 0, 0, time.UTC).Unix()
	ndjson := `{"service":"` + SpreadCaptureBotServiceName + `","minuteBucket":` + jsonInt(bucket) + `,"metrics":{"heartbeat":1}}` + "\n"

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", "metrics.ndjson")
	if err != nil {
		t.Fatalf("CreateFormFile() error = %v", err)
	}
	if _, err := part.Write([]byte(ndjson)); err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/debug/import-metrics-ndjson", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	recorder := httptest.NewRecorder()

	handler.ImportNDJSON(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body = %s", recorder.Code, http.StatusOK, recorder.Body.String())
	}

	points, err := service.ListSince(context.Background(), 0)
	if err != nil {
		t.Fatalf("ListSince() error = %v", err)
	}
	if len(points) != 1 {
		t.Fatalf("len(points) = %d, want 1", len(points))
	}
}

func TestDebugHandlerImportNDJSONRejectsMissingFile(t *testing.T) {
	db := openMetricsTestDB(t)
	repo := NewRepository(db)
	service := NewService(repo, fixedMetricsClock{now: time.Now()}, fakeAdminLister{})
	handler := NewDebugHandler(service)

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	if err := writer.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/debug/import-metrics-ndjson", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	recorder := httptest.NewRecorder()

	handler.ImportNDJSON(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}
}

func jsonInt(value int64) string {
	encoded, _ := json.Marshal(value)
	return string(encoded)
}
