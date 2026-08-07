package ws

import (
	"archive/zip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"sync"
	"time"
)

const (
	maxPerformanceMetricEvents   = 100
	maxPerformanceMetricsBytes   = 1_000_000_000
	performanceMetricsArchiveDir = "logs-archive"
	performanceMetricsTimeLayout = "2006-01-02T15-04-05"
	performanceMetricsPrefix     = "frontend-performance"
	legacyPerformanceMetricsName = "frontend-performance.ndjson"
)

var activePerformanceMetricsPattern = regexp.MustCompile(`^frontend-performance-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.ndjson$`)

type PerformanceMetricsWriter struct {
	mu       sync.Mutex
	dir      string
	maxBytes int64
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

func NewPerformanceMetricsHandler(enabled bool, dir string) MessageHandler {
	writer := &PerformanceMetricsWriter{dir: dir, maxBytes: maxPerformanceMetricsBytes}
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

	if err := os.MkdirAll(w.dir, 0o755); err != nil {
		return fmt.Errorf("create performance metrics dir: %w", err)
	}
	if err := w.migrateLegacyFile(); err != nil {
		return err
	}

	openedAt, size, err := findResumablePerformanceMetrics(w.dir)
	if err != nil {
		return err
	}
	if openedAt != "" && size >= w.maxBytes {
		closeAndArchivePerformanceMetricsAsync(w.dir, openedAt)
		openedAt = ""
		size = 0
	}
	if openedAt == "" {
		openedAt = time.Now().Format(performanceMetricsTimeLayout)
	}
	if size > 0 && size+int64(len(lines)) > w.maxBytes {
		closeAndArchivePerformanceMetricsAsync(w.dir, openedAt)
		openedAt = time.Now().Format(performanceMetricsTimeLayout)
	}

	file, err := os.OpenFile(filepath.Join(w.dir, activePerformanceMetricsName(openedAt)), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
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

func (w *PerformanceMetricsWriter) migrateLegacyFile() error {
	legacyPath := filepath.Join(w.dir, legacyPerformanceMetricsName)
	if _, err := os.Stat(legacyPath); errors.Is(err, os.ErrNotExist) {
		return nil
	} else if err != nil {
		return fmt.Errorf("stat legacy performance metrics: %w", err)
	}
	newPath := filepath.Join(w.dir, activePerformanceMetricsName(time.Now().Format(performanceMetricsTimeLayout)))
	if err := os.Rename(legacyPath, newPath); err != nil {
		return fmt.Errorf("migrate legacy performance metrics: %w", err)
	}
	return nil
}

func activePerformanceMetricsName(openedAt string) string {
	return performanceMetricsPrefix + "-" + openedAt + ".ndjson"
}

func findResumablePerformanceMetrics(dir string) (openedAt string, size int64, err error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", 0, fmt.Errorf("read performance metrics dir: %w", err)
	}
	var candidates []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if match := activePerformanceMetricsPattern.FindStringSubmatch(entry.Name()); match != nil {
			candidates = append(candidates, match[1])
		}
	}
	if len(candidates) == 0 {
		return "", 0, nil
	}
	sort.Strings(candidates)
	openedAt = candidates[len(candidates)-1]
	info, err := os.Stat(filepath.Join(dir, activePerformanceMetricsName(openedAt)))
	if err != nil {
		return "", 0, fmt.Errorf("stat performance metrics: %w", err)
	}
	return openedAt, info.Size(), nil
}

func closeAndArchivePerformanceMetricsAsync(dir, openedAt string) {
	closedPath, err := closeActivePerformanceMetrics(dir, openedAt)
	if err != nil {
		slog.Error("performance_metrics_archive_rename_failed", "err", err)
		return
	}
	go compressAndCleanupPerformanceMetrics(closedPath)
}

func closeActivePerformanceMetrics(dir, openedAt string) (string, error) {
	closedAt := time.Now().Format(performanceMetricsTimeLayout)
	activePath := filepath.Join(dir, activePerformanceMetricsName(openedAt))
	closedPath := filepath.Join(dir, fmt.Sprintf("%s-%s--%s.ndjson", performanceMetricsPrefix, openedAt, closedAt))
	if err := os.Rename(activePath, closedPath); err != nil {
		return "", fmt.Errorf("rename performance metrics: %w", err)
	}
	return closedPath, nil
}

func compressAndCleanupPerformanceMetrics(closedPath string) {
	archiveDirPath := filepath.Join(filepath.Dir(closedPath), performanceMetricsArchiveDir)
	if err := os.MkdirAll(archiveDirPath, 0o755); err != nil {
		slog.Error("performance_metrics_archive_mkdir_failed", "err", err, "dir", archiveDirPath)
		return
	}
	zipPath := filepath.Join(archiveDirPath, filepath.Base(closedPath)+".zip")
	if err := zipPerformanceMetricsFile(closedPath, zipPath); err != nil {
		slog.Error("performance_metrics_archive_zip_failed", "err", err, "path", closedPath)
		return
	}
	if err := os.Remove(closedPath); err != nil {
		slog.Error("performance_metrics_archive_cleanup_failed", "err", err, "path", closedPath)
	}
}

func zipPerformanceMetricsFile(srcPath, zipPath string) error {
	src, err := os.Open(srcPath)
	if err != nil {
		return fmt.Errorf("open performance metrics: %w", err)
	}
	defer src.Close()
	dst, err := os.Create(zipPath)
	if err != nil {
		return fmt.Errorf("create performance metrics archive: %w", err)
	}
	defer dst.Close()
	zw := zip.NewWriter(dst)
	entry, err := zw.CreateHeader(&zip.FileHeader{Name: filepath.Base(srcPath), Method: zip.Deflate, Modified: time.Now()})
	if err != nil {
		_ = zw.Close()
		return fmt.Errorf("create performance metrics archive entry: %w", err)
	}
	if _, err := io.Copy(entry, src); err != nil {
		_ = zw.Close()
		return fmt.Errorf("write performance metrics archive: %w", err)
	}
	return zw.Close()
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
