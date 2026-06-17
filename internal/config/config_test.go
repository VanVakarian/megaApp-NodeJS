package config

import (
	"testing"
	"time"
)

func TestLoadUsesDefaults(t *testing.T) {
	t.Setenv("APP_PORT", "")
	t.Setenv("APP_HOST", "")
	t.Setenv("LOG_LEVEL", "")
	t.Setenv("DATABASE_PATH", "")
	t.Setenv("MIGRATIONS_DIR", "")
	t.Setenv("PUBLIC_DIR", "")
	t.Setenv("SHUTDOWN_TIMEOUT_SECONDS", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.AppPort != 3000 {
		t.Fatalf("AppPort = %d, want 3000", cfg.AppPort)
	}
	if cfg.AppHost != "127.0.0.1" {
		t.Fatalf("AppHost = %q, want 127.0.0.1", cfg.AppHost)
	}
	if cfg.LogLevel != "info" {
		t.Fatalf("LogLevel = %q, want info", cfg.LogLevel)
	}
	if cfg.DatabasePath != "./app.db" {
		t.Fatalf("DatabasePath = %q, want ./app.db", cfg.DatabasePath)
	}
	if cfg.MigrationsDir != "./migrations" {
		t.Fatalf("MigrationsDir = %q, want ./migrations", cfg.MigrationsDir)
	}
	if cfg.PublicDir != "./public" {
		t.Fatalf("PublicDir = %q, want ./public", cfg.PublicDir)
	}
	if cfg.ShutdownTimeout != 10*time.Second {
		t.Fatalf("ShutdownTimeout = %v, want 10s", cfg.ShutdownTimeout)
	}
}

func TestLoadRejectsInvalidPort(t *testing.T) {
	t.Setenv("APP_PORT", "bad")

	_, err := Load()
	if err == nil {
		t.Fatal("Load() error = nil, want error")
	}
}

func TestValidateRejectsInvalidLogLevel(t *testing.T) {
	cfg := Config{
		AppHost:         "127.0.0.1",
		AppPort:         3000,
		LogLevel:        "trace",
		DatabasePath:    "./app.db",
		MigrationsDir:   "./migrations",
		PublicDir:       "./public",
		ShutdownTimeout: time.Second,
	}

	if err := cfg.Validate(); err == nil {
		t.Fatal("Validate() error = nil, want error")
	}
}
