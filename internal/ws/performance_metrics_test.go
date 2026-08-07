package ws

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestDecodePerformanceMetricsBatchAddsTrustedConnectionFields(t *testing.T) {
	message := map[string]any{
		"payload": map[string]any{
			"batchId": "batch-1",
			"events":  []any{map[string]any{"eventId": "session:1", "operation": "metrics.dashboard_model", "userId": 999}},
		},
	}

	batch, eventIDs, lines, err := decodePerformanceMetricsBatch(message, 42, "tab-a")
	if err != nil {
		t.Fatalf("decodePerformanceMetricsBatch() error = %v", err)
	}
	if batch.BatchID != "batch-1" {
		t.Fatalf("batch id = %q, want batch-1", batch.BatchID)
	}
	if len(eventIDs) != 1 || eventIDs[0] != "session:1" {
		t.Fatalf("event ids = %#v", eventIDs)
	}

	var line map[string]any
	if err := json.Unmarshal(lines, &line); err != nil {
		t.Fatalf("unmarshal line: %v", err)
	}
	if line["userId"] != float64(42) {
		t.Fatalf("userId = %v, want 42", line["userId"])
	}
	if line["clientId"] != "tab-a" {
		t.Fatalf("clientId = %v, want tab-a", line["clientId"])
	}
	if _, ok := line["receivedAt"].(string); !ok {
		t.Fatalf("receivedAt = %T, want string", line["receivedAt"])
	}
}

func TestPerformanceMetricsWriterAppendsNDJSON(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data", "frontend-performance.ndjson")
	writer := &PerformanceMetricsWriter{path: path}

	if err := writer.Append([]byte("{\"eventId\":\"one\"}\n")); err != nil {
		t.Fatalf("first Append() error = %v", err)
	}
	if err := writer.Append([]byte("{\"eventId\":\"two\"}\n")); err != nil {
		t.Fatalf("second Append() error = %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	const want = "{\"eventId\":\"one\"}\n{\"eventId\":\"two\"}\n"
	if string(data) != want {
		t.Fatalf("file = %q, want %q", data, want)
	}
}

func TestDecodePerformanceMetricsBatchRejectsMissingEventID(t *testing.T) {
	message := map[string]any{
		"payload": map[string]any{
			"batchId": "batch-1",
			"events":  []any{map[string]any{"operation": "metrics.dashboard_model"}},
		},
	}
	if _, _, _, err := decodePerformanceMetricsBatch(message, 42, "tab-a"); err == nil {
		t.Fatal("decodePerformanceMetricsBatch() error = nil, want error")
	}
}
