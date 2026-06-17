package config

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	AppEnv               string
	AppHost              string
	AppPort              int
	LogLevel             string
	DataDir              string
	DatabaseName         string
	DatabaseEnv          string
	DatabaseVersion      string
	DatabasePath         string
	MigrationsDir        string
	PublicDir            string
	JWTSecret            string
	OpenRouterAPIKey     string
	OpenRouterModel      string
	OpenRouterTimeout    time.Duration
	OpenAIAPIKey         string
	OpenAIEmbeddingModel string
	OpenAIEmbeddingDims  int
	OpenAITimeout        time.Duration
	ShutdownTimeout      time.Duration
	BuildVersion         string
	BuildCommit          string
	BuildTime            string
	GoVersion            string
}

func Load() (Config, error) {
	if err := LoadEnvFiles(); err != nil {
		return Config{}, fmt.Errorf("load env files: %w", err)
	}

	appEnv := getString("APP_ENV", "dev")
	databaseEnv := getString("DB_ENV", appEnv)
	databaseName := getString("DB_NAME", "megaapp")
	databaseVersion := getString("DB_VERSION", "005")
	dataDir := getString("DATA_DIR", "./data")
	databasePath := getString("DATABASE_PATH", filepath.Join(dataDir, buildDatabaseFileName(databaseName, databaseEnv, databaseVersion)))

	cfg := Config{
		AppEnv:               appEnv,
		AppHost:              getString("APP_HOST", "127.0.0.1"),
		LogLevel:             strings.ToLower(getString("LOG_LEVEL", "info")),
		DataDir:              dataDir,
		DatabaseName:         databaseName,
		DatabaseEnv:          databaseEnv,
		DatabaseVersion:      databaseVersion,
		DatabasePath:         databasePath,
		MigrationsDir:        getString("MIGRATIONS_DIR", "./migrations"),
		PublicDir:            getString("PUBLIC_DIR", "./public"),
		JWTSecret:            getString("JWT_SECRET", "dev-insecure-jwt-secret"),
		OpenRouterAPIKey:     getString("OPENROUTER_API_KEY", ""),
		OpenRouterModel:      getString("OPENROUTER_MODEL", "google/gemini-2.5-pro"),
		OpenAIAPIKey:         getString("OPENAI_API_KEY", ""),
		OpenAIEmbeddingModel: getString("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
		BuildVersion:         getString("APP_BUILD_VERSION", "dev"),
		BuildCommit:          getString("APP_BUILD_COMMIT", "local"),
		BuildTime:            getString("APP_BUILD_TIME", "unknown"),
		GoVersion:            runtime.Version(),
	}

	port, err := getInt("APP_PORT", 3000)
	if err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	cfg.AppPort = port

	shutdownTimeoutSeconds, err := getInt("SHUTDOWN_TIMEOUT_SECONDS", 10)
	if err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	cfg.ShutdownTimeout = time.Duration(shutdownTimeoutSeconds) * time.Second

	openRouterTimeoutSeconds, err := getInt("OPENROUTER_TIMEOUT_SECONDS", 60)
	if err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	cfg.OpenRouterTimeout = time.Duration(openRouterTimeoutSeconds) * time.Second

	openAIEmbeddingDims, err := getInt("OPENAI_EMBEDDING_DIMENSIONS", 768)
	if err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	cfg.OpenAIEmbeddingDims = openAIEmbeddingDims

	openAITimeoutSeconds, err := getInt("OPENAI_TIMEOUT_SECONDS", 60)
	if err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	cfg.OpenAITimeout = time.Duration(openAITimeoutSeconds) * time.Second

	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}

	return cfg, nil
}

func (c Config) Validate() error {
	if strings.TrimSpace(c.AppHost) == "" {
		return fmt.Errorf("validate config: APP_HOST is required")
	}
	if c.AppPort <= 0 || c.AppPort > 65535 {
		return fmt.Errorf("validate config: APP_PORT must be between 1 and 65535")
	}
	if strings.TrimSpace(c.DataDir) == "" {
		return fmt.Errorf("validate config: DATA_DIR is required")
	}
	if strings.TrimSpace(c.DatabaseName) == "" {
		return fmt.Errorf("validate config: DB_NAME is required")
	}
	if strings.TrimSpace(c.DatabaseEnv) == "" {
		return fmt.Errorf("validate config: DB_ENV is required")
	}
	if strings.TrimSpace(c.DatabaseVersion) == "" {
		return fmt.Errorf("validate config: DB_VERSION is required")
	}
	if strings.TrimSpace(c.DatabasePath) == "" {
		return fmt.Errorf("validate config: DATABASE_PATH is required")
	}
	if strings.TrimSpace(c.MigrationsDir) == "" {
		return fmt.Errorf("validate config: MIGRATIONS_DIR is required")
	}
	if strings.TrimSpace(c.PublicDir) == "" {
		return fmt.Errorf("validate config: PUBLIC_DIR is required")
	}
	if strings.TrimSpace(c.JWTSecret) == "" {
		return fmt.Errorf("validate config: JWT_SECRET is required")
	}
	if c.OpenRouterTimeout <= 0 {
		return fmt.Errorf("validate config: OPENROUTER_TIMEOUT_SECONDS must be greater than 0")
	}
	if c.OpenAIEmbeddingDims <= 0 {
		return fmt.Errorf("validate config: OPENAI_EMBEDDING_DIMENSIONS must be greater than 0")
	}
	if c.OpenAITimeout <= 0 {
		return fmt.Errorf("validate config: OPENAI_TIMEOUT_SECONDS must be greater than 0")
	}
	if c.ShutdownTimeout <= 0 {
		return fmt.Errorf("validate config: SHUTDOWN_TIMEOUT_SECONDS must be greater than 0")
	}

	switch c.LogLevel {
	case "debug", "info", "warn", "error":
	default:
		return fmt.Errorf("validate config: LOG_LEVEL must be one of debug, info, warn, error")
	}

	return nil
}

func (c Config) HTTPAddress() string {
	return fmt.Sprintf("%s:%d", c.AppHost, c.AppPort)
}

func buildDatabaseFileName(name string, env string, version string) string {
	return fmt.Sprintf("%s-%s-%s.db", name, env, version)
}

func getString(key string, fallback string) string {
	value, ok := os.LookupEnv(key)
	if !ok {
		return fallback
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func getInt(key string, fallback int) (int, error) {
	value, ok := os.LookupEnv(key)
	if !ok || strings.TrimSpace(value) == "" {
		return fallback, nil
	}

	parsed, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil {
		return 0, fmt.Errorf("%s: %w", key, err)
	}

	return parsed, nil
}
