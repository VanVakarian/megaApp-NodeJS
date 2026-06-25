package metrics

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
)

type ExporterConfig struct {
	Service    string
	NDJSONPath string
	AckPath    string
}

type Exporter struct {
	cfg    ExporterConfig
	client *FlatlineClient
	outbox *outbox
	logger *slog.Logger

	pending   []MinuteSnapshot
	lastAcked int64
}

type ackState struct {
	LastAckedMinuteBucket int64 `json:"lastAckedMinuteBucket"`
}

func NewExporter(cfg ExporterConfig, client *FlatlineClient, logger *slog.Logger) (*Exporter, error) {
	box, err := prepareOutbox(cfg.NDJSONPath, outboxChunkLimitBytes)
	if err != nil {
		return nil, err
	}

	// lastAcked is restored from the ack file, but pending snapshots written
	// before a crash are not replayed back from the outbox on startup — same
	// simplification as spread-capture-bot-v3's exporter. The data stays safe
	// in the outbox file either way, it just won't be auto-retried.
	lastAcked, err := readAck(cfg.AckPath)
	if err != nil {
		return nil, err
	}

	return &Exporter{cfg: cfg, client: client, outbox: box, logger: logger, lastAcked: lastAcked}, nil
}

func (e *Exporter) FlushAndPush(ctx context.Context, bucket int64, points []MetricPoint) {
	if len(points) == 0 {
		return
	}

	metrics := make(map[string]float64, len(points))
	for _, point := range points {
		metrics[point.Name] = point.Value
	}
	snapshot := MinuteSnapshot{MinuteBucket: bucket, Metrics: metrics}

	if err := appendOutboxLine(e.outbox, e.cfg.Service, snapshot); err != nil {
		e.logger.Error("metrics_outbox_append_failed", "bucket", bucket, "err", err)
	}

	e.pending = append(e.pending, snapshot)
	e.tryFlushPending(ctx)
}

func (e *Exporter) tryFlushPending(ctx context.Context) {
	if len(e.pending) == 0 {
		return
	}

	if err := e.client.PushSnapshots(ctx, e.cfg.Service, e.pending); err != nil {
		e.logger.Warn("metrics_push_failed", "pending", len(e.pending), "err", err)
		return
	}

	lastAcked := e.pending[len(e.pending)-1].MinuteBucket
	if err := writeAck(e.cfg.AckPath, lastAcked); err != nil {
		e.logger.Error("metrics_ack_write_failed", "bucket", lastAcked, "err", err)
		return
	}

	e.lastAcked = lastAcked
	e.pending = nil
}

func readAck(path string) (int64, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return 0, nil
		}
		return 0, fmt.Errorf("read metrics ack: %w", err)
	}

	var state ackState
	if err := json.Unmarshal(data, &state); err != nil {
		return 0, fmt.Errorf("decode metrics ack: %w", err)
	}

	return state.LastAckedMinuteBucket, nil
}

func writeAck(path string, bucket int64) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create metrics ack dir: %w", err)
	}

	data, err := json.Marshal(ackState{LastAckedMinuteBucket: bucket})
	if err != nil {
		return fmt.Errorf("encode metrics ack: %w", err)
	}

	tempPath := path + ".tmp"
	if err := os.WriteFile(tempPath, data, 0o644); err != nil {
		return fmt.Errorf("write metrics ack temp: %w", err)
	}

	if err := os.Rename(tempPath, path); err != nil {
		return fmt.Errorf("replace metrics ack: %w", err)
	}

	return nil
}
