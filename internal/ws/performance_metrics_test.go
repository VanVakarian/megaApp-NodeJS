package ws

import (
	"archive/zip"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"
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
	dir := filepath.Join(t.TempDir(), "data")
	writer := &PerformanceMetricsWriter{dir: dir, maxBytes: maxPerformanceMetricsBytes}

	if err := writer.Append([]byte("{\"eventId\":\"one\"}\n")); err != nil {
		t.Fatalf("first Append() error = %v", err)
	}
	if err := writer.Append([]byte("{\"eventId\":\"two\"}\n")); err != nil {
		t.Fatalf("second Append() error = %v", err)
	}

	openedAt, _, err := findResumablePerformanceMetrics(dir)
	if err != nil {
		t.Fatalf("findResumablePerformanceMetrics() error = %v", err)
	}
	data, err := os.ReadFile(filepath.Join(dir, activePerformanceMetricsName(openedAt)))
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	const want = "{\"eventId\":\"one\"}\n{\"eventId\":\"two\"}\n"
	if string(data) != want {
		t.Fatalf("file = %q, want %q", data, want)
	}
}

func TestPerformanceMetricsWriterMigratesLegacyFile(t *testing.T) {
	dir := t.TempDir()
	legacyPath := filepath.Join(dir, legacyPerformanceMetricsName)
	if err := os.WriteFile(legacyPath, []byte("{\"eventId\":\"old\"}\n"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	writer := &PerformanceMetricsWriter{dir: dir, maxBytes: maxPerformanceMetricsBytes}
	if err := writer.Append([]byte("{\"eventId\":\"new\"}\n")); err != nil {
		t.Fatalf("Append() error = %v", err)
	}
	if _, err := os.Stat(legacyPath); !os.IsNotExist(err) {
		t.Fatalf("legacy file exists, err = %v", err)
	}
	openedAt, _, err := findResumablePerformanceMetrics(dir)
	if err != nil {
		t.Fatalf("findResumablePerformanceMetrics() error = %v", err)
	}
	data, err := os.ReadFile(filepath.Join(dir, activePerformanceMetricsName(openedAt)))
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	if string(data) != "{\"eventId\":\"old\"}\n{\"eventId\":\"new\"}\n" {
		t.Fatalf("file = %q", data)
	}
}

func TestPerformanceMetricsWriterArchivesBeforeOverflow(t *testing.T) {
	dir := t.TempDir()
	openedAt := "2000-01-02T03-04-05"
	activePath := filepath.Join(dir, activePerformanceMetricsName(openedAt))
	if err := os.WriteFile(activePath, []byte("12345678"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	writer := &PerformanceMetricsWriter{dir: dir, maxBytes: 10}
	if err := writer.Append([]byte("abc")); err != nil {
		t.Fatalf("Append() error = %v", err)
	}

	archiveDir := filepath.Join(dir, performanceMetricsArchiveDir)
	var archive *zip.ReadCloser
	deadline := time.Now().Add(time.Second)
	for {
		archives, err := filepath.Glob(filepath.Join(archiveDir, performanceMetricsPrefix+"-"+openedAt+"--*.ndjson.zip"))
		if err != nil {
			t.Fatalf("Glob() error = %v", err)
		}
		if len(archives) == 1 {
			openedArchive, err := zip.OpenReader(archives[0])
			if err == nil {
				archive = openedArchive
				break
			}
		}
		if time.Now().After(deadline) {
			t.Fatal("archive was not created")
		}
		time.Sleep(time.Millisecond)
	}
	if _, err := os.Stat(activePath); !os.IsNotExist(err) {
		t.Fatalf("closed active file exists, err = %v", err)
	}
	defer archive.Close()
	if len(archive.File) != 1 {
		t.Fatalf("archive files = %d, want 1", len(archive.File))
	}
	archived, err := archive.File[0].Open()
	if err != nil {
		t.Fatalf("archive entry Open() error = %v", err)
	}
	data, err := io.ReadAll(archived)
	if err != nil {
		t.Fatalf("ReadAll() error = %v", err)
	}
	if err := archived.Close(); err != nil {
		t.Fatalf("archive entry Close() error = %v", err)
	}
	if string(data) != "12345678" {
		t.Fatalf("archive = %q", data)
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
