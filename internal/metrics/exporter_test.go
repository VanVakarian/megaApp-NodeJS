package metrics

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestExporterFlushAndPushAcksOnSuccess(t *testing.T) {
	dir := t.TempDir()
	var receivedBuckets []int64

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req pushRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		for _, snapshot := range req.Snapshots {
			receivedBuckets = append(receivedBuckets, snapshot.MinuteBucket)
		}
		_ = json.NewEncoder(w).Encode(pushResponse{Result: true})
	}))
	defer server.Close()

	exporter, err := NewExporter(ExporterConfig{
		Service:    "megaapp",
		NDJSONPath: filepath.Join(dir, "metrics-outbox.ndjson"),
		AckPath:    filepath.Join(dir, "metrics-outbox.ack.json"),
	}, NewFlatlineClient(server.URL, time.Second), discardLogger())
	if err != nil {
		t.Fatalf("NewExporter() error = %v", err)
	}

	exporter.FlushAndPush(context.Background(), 60, []MetricPoint{{Name: "a", Value: 1}})

	if len(receivedBuckets) != 1 || receivedBuckets[0] != 60 {
		t.Fatalf("receivedBuckets = %v, want [60]", receivedBuckets)
	}
	if len(exporter.pending) != 0 {
		t.Fatalf("len(pending) = %d, want 0 after successful push", len(exporter.pending))
	}

	ackedBucket, err := readAck(filepath.Join(dir, "metrics-outbox.ack.json"))
	if err != nil {
		t.Fatalf("readAck() error = %v", err)
	}
	if ackedBucket != 60 {
		t.Fatalf("ackedBucket = %d, want 60", ackedBucket)
	}
}

func TestExporterFlushAndPushKeepsPendingOnFailureAndRetriesNextTick(t *testing.T) {
	dir := t.TempDir()
	var attempts atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if attempts.Add(1) == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		var req pushRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		if len(req.Snapshots) != 2 {
			t.Errorf("second attempt snapshots = %d, want 2 (both pending buckets)", len(req.Snapshots))
		}
		_ = json.NewEncoder(w).Encode(pushResponse{Result: true})
	}))
	defer server.Close()

	exporter, err := NewExporter(ExporterConfig{
		Service:    "megaapp",
		NDJSONPath: filepath.Join(dir, "metrics-outbox.ndjson"),
		AckPath:    filepath.Join(dir, "metrics-outbox.ack.json"),
	}, NewFlatlineClient(server.URL, time.Second), discardLogger())
	if err != nil {
		t.Fatalf("NewExporter() error = %v", err)
	}

	exporter.FlushAndPush(context.Background(), 60, []MetricPoint{{Name: "a", Value: 1}})
	if len(exporter.pending) != 1 {
		t.Fatalf("len(pending) after failed push = %d, want 1", len(exporter.pending))
	}

	exporter.FlushAndPush(context.Background(), 120, []MetricPoint{{Name: "a", Value: 1}})
	if len(exporter.pending) != 0 {
		t.Fatalf("len(pending) after successful retry = %d, want 0", len(exporter.pending))
	}
	if attempts.Load() != 2 {
		t.Fatalf("attempts = %d, want 2", attempts.Load())
	}
}

func TestExporterIgnoresEmptyPoints(t *testing.T) {
	dir := t.TempDir()
	called := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
	}))
	defer server.Close()

	exporter, err := NewExporter(ExporterConfig{
		Service:    "megaapp",
		NDJSONPath: filepath.Join(dir, "metrics-outbox.ndjson"),
		AckPath:    filepath.Join(dir, "metrics-outbox.ack.json"),
	}, NewFlatlineClient(server.URL, time.Second), discardLogger())
	if err != nil {
		t.Fatalf("NewExporter() error = %v", err)
	}

	exporter.FlushAndPush(context.Background(), 60, nil)
	if called {
		t.Fatal("server was called, want no-op on empty points")
	}
}

func TestNewExporterRestoresLastAckedFromDisk(t *testing.T) {
	dir := t.TempDir()
	ackPath := filepath.Join(dir, "metrics-outbox.ack.json")
	if err := writeAck(ackPath, 180); err != nil {
		t.Fatalf("writeAck() error = %v", err)
	}

	exporter, err := NewExporter(ExporterConfig{
		Service:    "megaapp",
		NDJSONPath: filepath.Join(dir, "metrics-outbox.ndjson"),
		AckPath:    ackPath,
	}, NewFlatlineClient("http://127.0.0.1:0", time.Second), discardLogger())
	if err != nil {
		t.Fatalf("NewExporter() error = %v", err)
	}

	if exporter.lastAcked != 180 {
		t.Fatalf("lastAcked = %d, want 180", exporter.lastAcked)
	}
	if len(exporter.pending) != 0 {
		t.Fatalf("len(pending) = %d, want 0 — outbox tail is not replayed on restart", len(exporter.pending))
	}
}

func TestReadAckReturnsZeroWhenFileMissing(t *testing.T) {
	bucket, err := readAck(filepath.Join(t.TempDir(), "missing.json"))
	if err != nil {
		t.Fatalf("readAck() error = %v", err)
	}
	if bucket != 0 {
		t.Fatalf("bucket = %d, want 0", bucket)
	}
}

func TestWriteAckThenReadAckRoundTrips(t *testing.T) {
	path := filepath.Join(t.TempDir(), "ack.json")
	if err := writeAck(path, 42); err != nil {
		t.Fatalf("writeAck() error = %v", err)
	}

	bucket, err := readAck(path)
	if err != nil {
		t.Fatalf("readAck() error = %v", err)
	}
	if bucket != 42 {
		t.Fatalf("bucket = %d, want 42", bucket)
	}

	if _, err := os.Stat(path + ".tmp"); !os.IsNotExist(err) {
		t.Fatalf("temp file state error = %v, want not exists", err)
	}
}
