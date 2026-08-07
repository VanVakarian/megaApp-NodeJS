package ws

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const maxPerformanceMetricEvents = 100

type PerformanceMetricsWriter struct {
	mu   sync.Mutex
	path string
}

type performanceMetricsBatch struct {
	BatchID string            `json:"batchId"`
	Events  []json.RawMessage `json:"events"`
	Dropped int               `json:"dropped"`
}

type performanceMetricsAck struct {
	Type    string `json:"type"`
	Payload struct {
		BatchID  string   `json:"batchId"`
		EventIDs []string `json:"eventIds"`
		Outcome  string   `json:"outcome"`
	} `json:"payload"`
}

func NewPerformanceMetricsHandler(enabled bool, path string) MessageHandler {
	writer := &PerformanceMetricsWriter{path: path}
	return func(client *Client, message map[string]any) error {
		batch, eventIDs, lines, err := decodePerformanceMetricsBatch(message, client.UserID(), client.clientID)
		if err != nil {
			return nil
		}
		if !enabled {
			return client.SendJSON(newPerformanceMetricsAck(batch.BatchID, eventIDs, "discarded"))
		}
		if err := writer.Append(lines); err != nil {
			return nil
		}
		return client.SendJSON(newPerformanceMetricsAck(batch.BatchID, eventIDs, "accepted"))
	}
}

func (w *PerformanceMetricsWriter) Append(lines []byte) error {
	if len(lines) == 0 {
		return nil
	}
	w.mu.Lock()
	defer w.mu.Unlock()

	if err := os.MkdirAll(filepath.Dir(w.path), 0o755); err != nil {
		return fmt.Errorf("create performance metrics dir: %w", err)
	}
	file, err := os.OpenFile(w.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return fmt.Errorf("open performance metrics: %w", err)
	}
	if _, err := file.Write(lines); err != nil {
		return errors.Join(fmt.Errorf("append performance metrics: %w", err), file.Close())
	}
	if err := file.Sync(); err != nil {
		return errors.Join(fmt.Errorf("sync performance metrics: %w", err), file.Close())
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close performance metrics: %w", err)
	}
	return nil
}

func decodePerformanceMetricsBatch(message map[string]any, userID int64, clientID string) (performanceMetricsBatch, []string, []byte, error) {
	var batch performanceMetricsBatch
	payload, ok := message["payload"]
	if !ok {
		return batch, nil, nil, errors.New("missing performance metrics payload")
	}
	encodedPayload, err := json.Marshal(payload)
	if err != nil {
		return batch, nil, nil, fmt.Errorf("encode performance metrics payload: %w", err)
	}
	if err := json.Unmarshal(encodedPayload, &batch); err != nil {
		return batch, nil, nil, fmt.Errorf("decode performance metrics payload: %w", err)
	}
	if batch.BatchID == "" || len(batch.Events) == 0 || len(batch.Events) > maxPerformanceMetricEvents {
		return batch, nil, nil, errors.New("invalid performance metrics batch")
	}

	eventIDs := make([]string, 0, len(batch.Events))
	lines := make([]byte, 0)
	for _, rawEvent := range batch.Events {
		var event map[string]any
		if err := json.Unmarshal(rawEvent, &event); err != nil {
			return batch, nil, nil, fmt.Errorf("decode performance metric event: %w", err)
		}
		eventID, ok := event["eventId"].(string)
		if !ok || eventID == "" {
			return batch, nil, nil, errors.New("missing performance metric event id")
		}
		event["receivedAt"] = time.Now().UTC().Format(time.RFC3339Nano)
		event["userId"] = userID
		event["clientId"] = clientID
		if len(eventIDs) == 0 && batch.Dropped > 0 {
			event["queueDroppedBeforeBatch"] = batch.Dropped
		}
		encoded, err := json.Marshal(event)
		if err != nil {
			return batch, nil, nil, fmt.Errorf("encode performance metric event: %w", err)
		}
		lines = append(lines, encoded...)
		lines = append(lines, '\n')
		eventIDs = append(eventIDs, eventID)
	}
	return batch, eventIDs, lines, nil
}

func newPerformanceMetricsAck(batchID string, eventIDs []string, outcome string) performanceMetricsAck {
	ack := performanceMetricsAck{Type: "PERFORMANCE_METRICS_ACK"}
	ack.Payload.BatchID = batchID
	ack.Payload.EventIDs = eventIDs
	ack.Payload.Outcome = outcome
	return ack
}
