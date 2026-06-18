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
	HTTPReadTimeout      time.Duration
	HTTPWriteTimeout     time.Duration
	HTTPIdleTimeout      time.Duration
	ShutdownTimeout      time.Duration
	MaxRequestBodyBytes  int64
	WSReadLimitBytes     int64
	WSWriteTimeout       time.Duration
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

	httpReadTimeoutSeconds, err := getInt("HTTP_READ_TIMEOUT_SECONDS", 15)
	if err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	cfg.HTTPReadTimeout = time.Duration(httpReadTimeoutSeconds) * time.Second

	httpWriteTimeoutSeconds, err := getInt("HTTP_WRITE_TIMEOUT_SECONDS", 30)
	if err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	cfg.HTTPWriteTimeout = time.Duration(httpWriteTimeoutSeconds) * time.Second

	httpIdleTimeoutSeconds, err := getInt("HTTP_IDLE_TIMEOUT_SECONDS", 60)
	if err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	cfg.HTTPIdleTimeout = time.Duration(httpIdleTimeoutSeconds) * time.Second

	shutdownTimeoutSeconds, err := getInt("SHUTDOWN_TIMEOUT_SECONDS", 10)
	if err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	cfg.ShutdownTimeout = time.Duration(shutdownTimeoutSeconds) * time.Second

	maxRequestBodyBytes, err := getInt64("MAX_REQUEST_BODY_BYTES", 1<<20)
	if err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	cfg.MaxRequestBodyBytes = maxRequestBodyBytes

	wsReadLimitBytes, err := getInt64("WS_READ_LIMIT_BYTES", 64<<10)
	if err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	cfg.WSReadLimitBytes = wsReadLimitBytes

	wsWriteTimeoutSeconds, err := getInt("WS_WRITE_TIMEOUT_SECONDS", 5)
	if err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	cfg.WSWriteTimeout = time.Duration(wsWriteTimeoutSeconds) * time.Second

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
	if c.HTTPReadTimeout <= 0 {
		return fmt.Errorf("validate config: HTTP_READ_TIMEOUT_SECONDS must be greater than 0")
	}
	if c.HTTPWriteTimeout <= 0 {
		return fmt.Errorf("validate config: HTTP_WRITE_TIMEOUT_SECONDS must be greater than 0")
	}
	if c.HTTPIdleTimeout <= 0 {
		return fmt.Errorf("validate config: HTTP_IDLE_TIMEOUT_SECONDS must be greater than 0")
	}
	if c.ShutdownTimeout <= 0 {
		return fmt.Errorf("validate config: SHUTDOWN_TIMEOUT_SECONDS must be greater than 0")
	}
	if c.MaxRequestBodyBytes <= 0 {
		return fmt.Errorf("validate config: MAX_REQUEST_BODY_BYTES must be greater than 0")
	}
	if c.WSReadLimitBytes <= 0 {
		return fmt.Errorf("validate config: WS_READ_LIMIT_BYTES must be greater than 0")
	}
	if c.WSWriteTimeout <= 0 {
		return fmt.Errorf("validate config: WS_WRITE_TIMEOUT_SECONDS must be greater than 0")
	}

	switch c.LogLevel {
	case "debug", "info", "warn", "error":
	default:
		return fmt.Errorf("validate config: LOG_LEVEL must be one of debug, info, warn, error")
	}
	if c.usesInsecureJWTSecret() && !c.isDevLike() {
		return fmt.Errorf("validate config: JWT_SECRET insecure default is allowed only in dev-like environments")
	}
	if strings.TrimSpace(c.OpenRouterAPIKey) != "" && strings.TrimSpace(c.OpenRouterModel) == "" {
		return fmt.Errorf("validate config: OPENROUTER_MODEL is required when OPENROUTER_API_KEY is set")
	}
	if strings.TrimSpace(c.OpenAIAPIKey) != "" && strings.TrimSpace(c.OpenAIEmbeddingModel) == "" {
		return fmt.Errorf("validate config: OPENAI_EMBEDDING_MODEL is required when OPENAI_API_KEY is set")
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

func (c Config) isDevLike() bool {
	switch strings.ToLower(strings.TrimSpace(c.AppEnv)) {
	case "dev", "test", "local":
		return true
	default:
		return false
	}
}

func (c Config) usesInsecureJWTSecret() bool {
	return strings.TrimSpace(c.JWTSecret) == "dev-insecure-jwt-secret"
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

func getInt64(key string, fallback int64) (int64, error) {
	value, ok := os.LookupEnv(key)
	if !ok || strings.TrimSpace(value) == "" {
		return fallback, nil
	}

	parsed, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", key, err)
	}

	return parsed, nil
}
