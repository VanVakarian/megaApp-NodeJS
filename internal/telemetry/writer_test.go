package telemetry

import (
	"archive/zip"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestEventWriterAppendsNDJSON(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "data")
	writer := &EventWriter{dir: dir, maxBytes: maxEventsFileBytes}

	if err := writer.Append([]byte("{\"eventId\":\"one\"}\n")); err != nil {
		t.Fatalf("first Append() error = %v", err)
	}
	if err := writer.Append([]byte("{\"eventId\":\"two\"}\n")); err != nil {
		t.Fatalf("second Append() error = %v", err)
	}

	openedAt, _, err := findResumableFile(dir)
	if err != nil {
		t.Fatalf("findResumableFile() error = %v", err)
	}
	data, err := os.ReadFile(filepath.Join(dir, activeFileName(openedAt)))
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	const want = "{\"eventId\":\"one\"}\n{\"eventId\":\"two\"}\n"
	if string(data) != want {
		t.Fatalf("file = %q, want %q", data, want)
	}
}

func TestEventWriterArchivesBeforeOverflow(t *testing.T) {
	dir := t.TempDir()
	openedAt := "2000-01-02T03-04-05"
	activePath := filepath.Join(dir, activeFileName(openedAt))
	if err := os.WriteFile(activePath, []byte("12345678"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	writer := &EventWriter{dir: dir, maxBytes: 10}
	if err := writer.Append([]byte("abc")); err != nil {
		t.Fatalf("Append() error = %v", err)
	}

	archiveDirPath := filepath.Join(dir, archiveDirName)
	var archive *zip.ReadCloser
	deadline := time.Now().Add(time.Second)
	for {
		archives, err := filepath.Glob(filepath.Join(archiveDirPath, filePrefix+"-"+openedAt+"--*.ndjson.zip"))
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
