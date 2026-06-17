package config

import (
	"fmt"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	AppEnv          string
	AppHost         string
	AppPort         int
	LogLevel        string
	DatabasePath    string
	MigrationsDir   string
	PublicDir       string
	ShutdownTimeout time.Duration
	BuildVersion    string
	BuildCommit     string
	BuildTime       string
	GoVersion       string
}

func Load() (Config, error) {
	cfg := Config{
		AppEnv:        getString("APP_ENV", "dev"),
		AppHost:       getString("APP_HOST", "127.0.0.1"),
		LogLevel:      strings.ToLower(getString("LOG_LEVEL", "info")),
		DatabasePath:  getString("DATABASE_PATH", "./app.db"),
		MigrationsDir: getString("MIGRATIONS_DIR", "./migrations"),
		PublicDir:     getString("PUBLIC_DIR", "./public"),
		BuildVersion:  getString("APP_BUILD_VERSION", "dev"),
		BuildCommit:   getString("APP_BUILD_COMMIT", "local"),
		BuildTime:     getString("APP_BUILD_TIME", "unknown"),
		GoVersion:     runtime.Version(),
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
	if strings.TrimSpace(c.DatabasePath) == "" {
		return fmt.Errorf("validate config: DATABASE_PATH is required")
	}
	if strings.TrimSpace(c.MigrationsDir) == "" {
		return fmt.Errorf("validate config: MIGRATIONS_DIR is required")
	}
	if strings.TrimSpace(c.PublicDir) == "" {
		return fmt.Errorf("validate config: PUBLIC_DIR is required")
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
