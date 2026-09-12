package telemetry

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestEncodeBatchAddsTrustedFields(t *testing.T) {
	batch := eventBatch{
		Events: []json.RawMessage{
			[]byte(`{"eventId":"session:1","operation":"metrics.dashboard_model","userId":999}`),
		},
	}

	lines, err := encodeBatch(batch, 42, "tab-a")
	if err != nil {
		t.Fatalf("encodeBatch() error = %v", err)
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

func TestEncodeBatchAttachesDroppedCountToFirstEventOnly(t *testing.T) {
	batch := eventBatch{
		Events: []json.RawMessage{
			[]byte(`{"eventId":"session:1","operation":"app.long_task"}`),
			[]byte(`{"eventId":"session:2","operation":"app.long_task"}`),
		},
		Dropped: 3,
	}

	lines, err := encodeBatch(batch, 42, "tab-a")
	if err != nil {
		t.Fatalf("encodeBatch() error = %v", err)
	}

	decoder := json.NewDecoder(bytes.NewReader(lines))
	var first, second map[string]any
	if err := decoder.Decode(&first); err != nil {
		t.Fatalf("decode first line: %v", err)
	}
	if err := decoder.Decode(&second); err != nil {
		t.Fatalf("decode second line: %v", err)
	}
	if first["queueDroppedBeforeBatch"] != float64(3) {
		t.Fatalf("first queueDroppedBeforeBatch = %v, want 3", first["queueDroppedBeforeBatch"])
	}
	if _, ok := second["queueDroppedBeforeBatch"]; ok {
		t.Fatalf("second event unexpectedly carries queueDroppedBeforeBatch")
	}
}

func TestEncodeBatchRejectsMissingEventID(t *testing.T) {
	batch := eventBatch{
		Events: []json.RawMessage{[]byte(`{"operation":"metrics.dashboard_model"}`)},
	}
	if _, err := encodeBatch(batch, 42, "tab-a"); err == nil {
		t.Fatal("encodeBatch() error = nil, want error")
	}
}

func TestEncodeBatchRejectsMissingOperation(t *testing.T) {
	batch := eventBatch{
		Events: []json.RawMessage{[]byte(`{"eventId":"session:1"}`)},
	}
	if _, err := encodeBatch(batch, 42, "tab-a"); err == nil {
		t.Fatal("encodeBatch() error = nil, want error")
	}
}

func TestEncodeBatchRejectsEmptyBatch(t *testing.T) {
	if _, err := encodeBatch(eventBatch{}, 42, "tab-a"); err == nil {
		t.Fatal("encodeBatch() error = nil, want error")
	}
}

func TestEncodeBatchRejectsTooManyEvents(t *testing.T) {
	events := make([]json.RawMessage, maxBatchEvents+1)
	for i := range events {
		events[i] = []byte(`{"eventId":"e","operation":"app.long_task"}`)
	}
	if _, err := encodeBatch(eventBatch{Events: events}, 42, "tab-a"); err == nil {
		t.Fatal("encodeBatch() error = nil, want error")
	}
}
