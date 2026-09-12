package telemetry

import (
	"archive/zip"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"sync"
	"time"

	"megaapp-back/internal/platform/appendfile"
)

const (
	maxEventsFileBytes = 1_000_000_000
	archiveDirName     = "logs-archive"
	fileTimeLayout     = "2006-01-02T15-04-05"
	filePrefix         = "frontend-telemetry"
)

var activeFilePattern = regexp.MustCompile(`^frontend-telemetry-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.ndjson$`)

// EventWriter append-only writes NDJSON telemetry events into a rotating, timestamped active
// file, zip-archiving each closed file asynchronously once it crosses maxBytes.
type EventWriter struct {
	mu       sync.Mutex
	dir      string
	maxBytes int64
}

func NewEventWriter(dir string) *EventWriter {
	return &EventWriter{dir: dir, maxBytes: maxEventsFileBytes}
}

func (w *EventWriter) Append(lines []byte) error {
	if len(lines) == 0 {
		return nil
	}
	w.mu.Lock()
	defer w.mu.Unlock()

	// findResumableFile scans w.dir, so it must exist before that call even though
	// appendfile.Append below would create it for the file write itself.
	if err := os.MkdirAll(w.dir, 0o755); err != nil {
		return fmt.Errorf("create telemetry dir: %w", err)
	}

	openedAt, size, err := findResumableFile(w.dir)
	if err != nil {
		return err
	}
	if openedAt != "" && size >= w.maxBytes {
		closeAndArchiveAsync(w.dir, openedAt)
		openedAt = ""
		size = 0
	}
	if openedAt == "" {
		openedAt = time.Now().Format(fileTimeLayout)
	}
	if size > 0 && size+int64(len(lines)) > w.maxBytes {
		closeAndArchiveAsync(w.dir, openedAt)
		openedAt = time.Now().Format(fileTimeLayout)
	}

	return appendfile.Append(filepath.Join(w.dir, activeFileName(openedAt)), lines)
}

func activeFileName(openedAt string) string {
	return filePrefix + "-" + openedAt + ".ndjson"
}

func findResumableFile(dir string) (openedAt string, size int64, err error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", 0, fmt.Errorf("read telemetry dir: %w", err)
	}
	var candidates []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if match := activeFilePattern.FindStringSubmatch(entry.Name()); match != nil {
			candidates = append(candidates, match[1])
		}
	}
	if len(candidates) == 0 {
		return "", 0, nil
	}
	sort.Strings(candidates)
	openedAt = candidates[len(candidates)-1]
	info, err := os.Stat(filepath.Join(dir, activeFileName(openedAt)))
	if err != nil {
		return "", 0, fmt.Errorf("stat telemetry file: %w", err)
	}
	return openedAt, info.Size(), nil
}

func closeAndArchiveAsync(dir, openedAt string) {
	closedPath, err := closeActiveFile(dir, openedAt)
	if err != nil {
		slog.Error("telemetry_archive_rename_failed", "err", err)
		return
	}
	go compressAndCleanup(closedPath)
}

func closeActiveFile(dir, openedAt string) (string, error) {
	closedAt := time.Now().Format(fileTimeLayout)
	activePath := filepath.Join(dir, activeFileName(openedAt))
	closedPath := filepath.Join(dir, fmt.Sprintf("%s-%s--%s.ndjson", filePrefix, openedAt, closedAt))
	if err := os.Rename(activePath, closedPath); err != nil {
		return "", fmt.Errorf("rename telemetry file: %w", err)
	}
	return closedPath, nil
}

func compressAndCleanup(closedPath string) {
	archiveDirPath := filepath.Join(filepath.Dir(closedPath), archiveDirName)
	if err := os.MkdirAll(archiveDirPath, 0o755); err != nil {
		slog.Error("telemetry_archive_mkdir_failed", "err", err, "dir", archiveDirPath)
		return
	}
	zipPath := filepath.Join(archiveDirPath, filepath.Base(closedPath)+".zip")
	if err := zipFile(closedPath, zipPath); err != nil {
		slog.Error("telemetry_archive_zip_failed", "err", err, "path", closedPath)
		return
	}
	if err := os.Remove(closedPath); err != nil {
		slog.Error("telemetry_archive_cleanup_failed", "err", err, "path", closedPath)
	}
}

func zipFile(srcPath, zipPath string) error {
	src, err := os.Open(srcPath)
	if err != nil {
		return fmt.Errorf("open telemetry file: %w", err)
	}
	defer src.Close()
	dst, err := os.Create(zipPath)
	if err != nil {
		return fmt.Errorf("create telemetry archive: %w", err)
	}
	defer dst.Close()
	zw := zip.NewWriter(dst)
	entry, err := zw.CreateHeader(&zip.FileHeader{Name: filepath.Base(srcPath), Method: zip.Deflate, Modified: time.Now()})
	if err != nil {
		_ = zw.Close()
		return fmt.Errorf("create telemetry archive entry: %w", err)
	}
	if _, err := io.Copy(entry, src); err != nil {
		_ = zw.Close()
		return fmt.Errorf("write telemetry archive: %w", err)
	}
	return zw.Close()
}
