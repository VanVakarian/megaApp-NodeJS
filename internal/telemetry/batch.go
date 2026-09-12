package telemetry

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

const (
	maxBatchEvents = 1000
	// Half of config.MaxRequestBodyBytes' 1 MiB default — leaves headroom so a batch this side of
	// the limit never trips the request-body-size middleware into a 413 instead of landing here.
	maxBatchBytes = 512 * 1024
)

type eventBatch struct {
	Events  []json.RawMessage `json:"events"`
	Dropped int               `json:"dropped"`
}

// encodeBatch validates an incoming batch and turns it into ready-to-append NDJSON lines,
// stamping each event with server-trusted receivedAt/userId/clientId — the client never
// controls these fields.
func encodeBatch(batch eventBatch, userID int64, clientID string) ([]byte, error) {
	if len(batch.Events) == 0 || len(batch.Events) > maxBatchEvents {
		return nil, errors.New("invalid telemetry batch")
	}

	lines := make([]byte, 0)
	for i, rawEvent := range batch.Events {
		var event map[string]any
		if err := json.Unmarshal(rawEvent, &event); err != nil {
			return nil, fmt.Errorf("decode telemetry event: %w", err)
		}
		eventID, ok := event["eventId"].(string)
		if !ok || eventID == "" {
			return nil, errors.New("missing telemetry event id")
		}
		operation, ok := event["operation"].(string)
		if !ok || operation == "" {
			return nil, errors.New("missing telemetry event operation")
		}
		event["receivedAt"] = time.Now().UTC().Format(time.RFC3339Nano)
		event["userId"] = userID
		event["clientId"] = clientID
		if i == 0 && batch.Dropped > 0 {
			event["queueDroppedBeforeBatch"] = batch.Dropped
		}
		encoded, err := json.Marshal(event)
		if err != nil {
			return nil, fmt.Errorf("encode telemetry event: %w", err)
		}
		lines = append(lines, encoded...)
		lines = append(lines, '\n')
	}

	if len(lines) > maxBatchBytes {
		return nil, errors.New("telemetry batch too large")
	}
	return lines, nil
}
