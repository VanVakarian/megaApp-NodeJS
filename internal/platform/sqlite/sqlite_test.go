package sqlite

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestOpenConfiguresAndPingsDatabase(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test.db")

	db, err := Open(context.Background(), dbPath)
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() { _ = db.Close() }()

	if err := db.PingContext(context.Background()); err != nil {
		t.Fatalf("PingContext() error = %v", err)
	}
}

func TestApplyMigrationsCreatesSchemaMigrationsAndRunsFiles(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test.db")
	migrationsDir := filepath.Join(tempDir, "migrations")

	if err := os.MkdirAll(migrationsDir, 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	migrationSQL := `CREATE TABLE sample (id INTEGER PRIMARY KEY, title TEXT NOT NULL);`
	if err := os.WriteFile(filepath.Join(migrationsDir, "000001_create_sample.sql"), []byte(migrationSQL), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	db, err := Open(context.Background(), dbPath)
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer func() { _ = db.Close() }()

	if err := ApplyMigrations(context.Background(), db.SQL(), migrationsDir); err != nil {
		t.Fatalf("ApplyMigrations() error = %v", err)
	}

	var count int
	if err := db.SQL().QueryRowContext(context.Background(), `SELECT COUNT(*) FROM schema_migrations WHERE version = ?`, "000001_create_sample").Scan(&count); err != nil {
		t.Fatalf("QueryRowContext() error = %v", err)
	}
	if count != 1 {
		t.Fatalf("count = %d, want 1", count)
	}

	if _, err := db.SQL().ExecContext(context.Background(), `INSERT INTO sample(title) VALUES('ok')`); err != nil {
		t.Fatalf("ExecContext() error = %v", err)
	}
}
