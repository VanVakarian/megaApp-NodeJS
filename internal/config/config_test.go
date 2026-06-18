package config

import (
	"testing"
	"time"
)

func TestLoadUsesDefaults(t *testing.T) {
	t.Setenv("APP_ENV", "")
	t.Setenv("APP_PORT", "")
	t.Setenv("APP_HOST", "")
	t.Setenv("LOG_LEVEL", "")
	t.Setenv("DATA_DIR", "")
	t.Setenv("DB_NAME", "")
	t.Setenv("DB_ENV", "")
	t.Setenv("DB_VERSION", "")
	t.Setenv("DATABASE_PATH", "")
	t.Setenv("MIGRATIONS_DIR", "")
	t.Setenv("PUBLIC_DIR", "")
	t.Setenv("BACKUPS_DIR", "")
	t.Setenv("JWT_SECRET", "")
	t.Setenv("OPENROUTER_API_KEY", "")
	t.Setenv("OPENROUTER_MODEL", "")
	t.Setenv("OPENROUTER_VISION_MODEL", "")
	t.Setenv("OPENROUTER_IMAGE_MODEL", "")
	t.Setenv("OPENROUTER_TIMEOUT_SECONDS", "")
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("OPENAI_EMBEDDING_MODEL", "")
	t.Setenv("OPENAI_EMBEDDING_DIMENSIONS", "")
	t.Setenv("OPENAI_TIMEOUT_SECONDS", "")
	t.Setenv("HTTP_READ_TIMEOUT_SECONDS", "")
	t.Setenv("HTTP_WRITE_TIMEOUT_SECONDS", "")
	t.Setenv("HTTP_IDLE_TIMEOUT_SECONDS", "")
	t.Setenv("SHUTDOWN_TIMEOUT_SECONDS", "")
	t.Setenv("MAX_REQUEST_BODY_BYTES", "")
	t.Setenv("MAX_MULTIPART_BODY_BYTES", "")
	t.Setenv("WS_READ_LIMIT_BYTES", "")
	t.Setenv("WS_WRITE_TIMEOUT_SECONDS", "")

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
	if cfg.DataDir != "./data" {
		t.Fatalf("DataDir = %q, want ./data", cfg.DataDir)
	}
	if cfg.DatabaseName != "megaapp" {
		t.Fatalf("DatabaseName = %q, want megaapp", cfg.DatabaseName)
	}
	if cfg.DatabaseEnv != "dev" {
		t.Fatalf("DatabaseEnv = %q, want dev", cfg.DatabaseEnv)
	}
	if cfg.DatabaseVersion != "005" {
		t.Fatalf("DatabaseVersion = %q, want 005", cfg.DatabaseVersion)
	}
	if cfg.DatabasePath != "./data/megaapp-dev-005.db" && cfg.DatabasePath != "data/megaapp-dev-005.db" {
		t.Fatalf("DatabasePath = %q, want ./data/megaapp-dev-005.db", cfg.DatabasePath)
	}
	if cfg.MigrationsDir != "./migrations" {
		t.Fatalf("MigrationsDir = %q, want ./migrations", cfg.MigrationsDir)
	}
	if cfg.PublicDir != "./public" {
		t.Fatalf("PublicDir = %q, want ./public", cfg.PublicDir)
	}
	if cfg.BackupsDir != "./backups" {
		t.Fatalf("BackupsDir = %q, want ./backups", cfg.BackupsDir)
	}
	if cfg.JWTSecret != "dev-insecure-jwt-secret" {
		t.Fatalf("JWTSecret = %q, want dev-insecure-jwt-secret", cfg.JWTSecret)
	}
	if cfg.OpenRouterAPIKey != "" {
		t.Fatalf("OpenRouterAPIKey = %q, want empty", cfg.OpenRouterAPIKey)
	}
	if cfg.OpenRouterModel != "google/gemini-2.5-pro" {
		t.Fatalf("OpenRouterModel = %q, want google/gemini-2.5-pro", cfg.OpenRouterModel)
	}
	if cfg.OpenRouterVisionModel != "google/gemini-2.5-flash" {
		t.Fatalf("OpenRouterVisionModel = %q, want google/gemini-2.5-flash", cfg.OpenRouterVisionModel)
	}
	if cfg.OpenRouterImageModel != "google/gemini-2.5-flash-image" {
		t.Fatalf("OpenRouterImageModel = %q, want google/gemini-2.5-flash-image", cfg.OpenRouterImageModel)
	}
	if cfg.OpenRouterTimeout != 60*time.Second {
		t.Fatalf("OpenRouterTimeout = %v, want 60s", cfg.OpenRouterTimeout)
	}
	if cfg.OpenAIAPIKey != "" {
		t.Fatalf("OpenAIAPIKey = %q, want empty", cfg.OpenAIAPIKey)
	}
	if cfg.OpenAIEmbeddingModel != "text-embedding-3-small" {
		t.Fatalf("OpenAIEmbeddingModel = %q, want text-embedding-3-small", cfg.OpenAIEmbeddingModel)
	}
	if cfg.OpenAIEmbeddingDims != 768 {
		t.Fatalf("OpenAIEmbeddingDims = %d, want 768", cfg.OpenAIEmbeddingDims)
	}
	if cfg.OpenAITimeout != 60*time.Second {
		t.Fatalf("OpenAITimeout = %v, want 60s", cfg.OpenAITimeout)
	}
	if cfg.HTTPReadTimeout != 15*time.Second {
		t.Fatalf("HTTPReadTimeout = %v, want 15s", cfg.HTTPReadTimeout)
	}
	if cfg.HTTPWriteTimeout != 30*time.Second {
		t.Fatalf("HTTPWriteTimeout = %v, want 30s", cfg.HTTPWriteTimeout)
	}
	if cfg.HTTPIdleTimeout != 60*time.Second {
		t.Fatalf("HTTPIdleTimeout = %v, want 60s", cfg.HTTPIdleTimeout)
	}
	if cfg.ShutdownTimeout != 10*time.Second {
		t.Fatalf("ShutdownTimeout = %v, want 10s", cfg.ShutdownTimeout)
	}
	if cfg.MaxRequestBodyBytes != 1<<20 {
		t.Fatalf("MaxRequestBodyBytes = %d, want %d", cfg.MaxRequestBodyBytes, 1<<20)
	}
	if cfg.MaxMultipartBodyBytes != 8<<20 {
		t.Fatalf("MaxMultipartBodyBytes = %d, want %d", cfg.MaxMultipartBodyBytes, 8<<20)
	}
	if cfg.WSReadLimitBytes != 64<<10 {
		t.Fatalf("WSReadLimitBytes = %d, want %d", cfg.WSReadLimitBytes, 64<<10)
	}
	if cfg.WSWriteTimeout != 5*time.Second {
		t.Fatalf("WSWriteTimeout = %v, want 5s", cfg.WSWriteTimeout)
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
	cfg := validTestConfig()
	cfg.LogLevel = "trace"

	if err := cfg.Validate(); err == nil {
		t.Fatal("Validate() error = nil, want error")
	}
}

func TestValidateRejectsInsecureJWTSecretOutsideDevLikeEnv(t *testing.T) {
	cfg := validTestConfig()
	cfg.AppEnv = "prod"
	cfg.JWTSecret = "dev-insecure-jwt-secret"

	if err := cfg.Validate(); err == nil {
		t.Fatal("Validate() error = nil, want error")
	}
}

func validTestConfig() Config {
	return Config{
		AppEnv:                "test",
		AppHost:               "127.0.0.1",
		AppPort:               3000,
		LogLevel:              "info",
		DataDir:               "./data",
		DatabaseName:          "megaapp",
		DatabaseEnv:           "test",
		DatabaseVersion:       "005",
		DatabasePath:          "./data/megaapp-test-005.db",
		MigrationsDir:         "./migrations",
		PublicDir:             "./public",
		BackupsDir:            "./backups",
		JWTSecret:             "secret",
		OpenRouterTimeout:     time.Second,
		OpenAIEmbeddingDims:   768,
		OpenAITimeout:         time.Second,
		HTTPReadTimeout:       time.Second,
		HTTPWriteTimeout:      time.Second,
		HTTPIdleTimeout:       time.Second,
		ShutdownTimeout:       time.Second,
		MaxRequestBodyBytes:   1024,
		MaxMultipartBodyBytes: 8 * 1024,
		WSReadLimitBytes:      1024,
		WSWriteTimeout:        time.Second,
	}
}
