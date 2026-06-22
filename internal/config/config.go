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
	AppEnv                             string
	AppHost                            string
	AppPort                            int
	LogLevel                           string
	DataDir                            string
	DatabaseName                       string
	DatabaseEnv                        string
	DatabasePath                       string
	MigrationsDir                      string
	PublicDir                          string
	BackupsDir                         string
	JWTSecret                          string
	OpenRouterAPIKey                   string
	OpenRouterModel                    string
	OpenRouterVisionModel              string
	OpenRouterImageModel               string
	OpenRouterTimeout                  time.Duration
	OpenAIAPIKey                       string
	OpenAIEmbeddingModel               string
	OpenAIEmbeddingDims                int
	OpenAITimeout                      time.Duration
	CoefficientsJobEnabled             bool
	CoefficientsJobSchedule            string
	CoefficientsStartWithDefaults      bool
	CoefficientsDifferentTriesPerRound int
	CoefficientsChildrenAmt            int
	CoefficientsBestAmt                int
	CoefficientsDays7                  int
	CoefficientsDays60                 int
	CoefficientsMaxTriesIfUnchanged    int
	QuotesJobEnabled                   bool
	QuotesJobSchedule                  string
	QuotesFetchDays                    int
	QuotesRetryAttempts                int
	QuotesRetryDelay                   time.Duration
	QuotesRequestTimeout               time.Duration
	BackupJobEnabled                   bool
	BackupJobSchedule                  string
	BackupStorageEnabled               bool
	BackupStorageRegion                string
	BackupStorageBucket                string
	BackupStorageEndpoint              string
	BackupStorageForcePathStyle        bool
	BackupStorageClass                 string
	BackupStorageAccessKeyID           string
	BackupStorageSecretAccessKey       string
	BackupOperationTimeout             time.Duration
	HTTPReadTimeout                    time.Duration
	HTTPWriteTimeout                   time.Duration
	HTTPIdleTimeout                    time.Duration
	ShutdownTimeout                    time.Duration
	MaxRequestBodyBytes                int64
	MaxMultipartBodyBytes              int64
	WSReadLimitBytes                   int64
	WSWriteTimeout                     time.Duration
	BuildCommit                        string
	BuildTime                          string
	GoVersion                          string
}

func Load() (Config, error) {
	if err := LoadEnvFiles(); err != nil {
		return Config{}, fmt.Errorf("load env files: %w", err)
	}

	appEnv := getString("APP_ENV", "test")
	databaseEnv := getString("DB_ENV", appEnv)
	databaseName := getString("DB_NAME", "megaapp")
	dataDir := getString("DATA_DIR", "./data")
	databasePath := getString("DATABASE_PATH", filepath.Join(dataDir, buildDatabaseFileName(databaseName, databaseEnv)))
	buildCommit, buildTime := loadBuildInfo("build-info.json")

	cfg := Config{
		AppEnv:                        appEnv,
		AppHost:                       getString("APP_HOST", "127.0.0.1"),
		LogLevel:                      strings.ToLower(getString("LOG_LEVEL", "info")),
		DataDir:                       dataDir,
		DatabaseName:                  databaseName,
		DatabaseEnv:                   databaseEnv,
		DatabasePath:                  databasePath,
		MigrationsDir:                 getString("MIGRATIONS_DIR", "./migrations"),
		PublicDir:                     getString("PUBLIC_DIR", "./public"),
		BackupsDir:                    getString("BACKUPS_DIR", "./backups"),
		JWTSecret:                     getString("JWT_SECRET", "test-insecure-jwt-secret"),
		OpenRouterAPIKey:              getString("OPENROUTER_API_KEY", ""),
		OpenRouterModel:               getString("OPENROUTER_MODEL", "google/gemini-2.5-pro"),
		OpenRouterVisionModel:         getString("OPENROUTER_VISION_MODEL", "google/gemini-2.5-flash"),
		OpenRouterImageModel:          getString("OPENROUTER_IMAGE_MODEL", "google/gemini-2.5-flash-image"),
		OpenAIAPIKey:                  getString("OPENAI_API_KEY", ""),
		OpenAIEmbeddingModel:          getString("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
		CoefficientsJobEnabled:        getBool("COEFFICIENTS_JOB_ENABLED", false),
		CoefficientsJobSchedule:       getString("COEFFICIENTS_JOB_SCHEDULE", "0 1 * * *"),
		CoefficientsStartWithDefaults: getBool("COEFFICIENTS_START_WITH_ZEROS", false),
		QuotesJobEnabled:              getBool("QUOTES_JOB_ENABLED", false),
		QuotesJobSchedule:             getString("QUOTES_JOB_SCHEDULE", "0 3 * * *"),
		BackupJobEnabled:              getBool("BACKUP_JOB_ENABLED", false),
		BackupJobSchedule:             getString("BACKUP_JOB_SCHEDULE", "0 2 * * *"),
		BackupStorageEnabled:          getBool("BACKUP_STORAGE_ENABLED", false),
		BackupStorageRegion:           getString("BACKUP_STORAGE_REGION", ""),
		BackupStorageBucket:           getString("BACKUP_STORAGE_BUCKET", ""),
		BackupStorageEndpoint:         getString("BACKUP_STORAGE_ENDPOINT", ""),
		BackupStorageForcePathStyle:   getBool("BACKUP_STORAGE_FORCE_PATH_STYLE", false),
		BackupStorageClass:            getString("BACKUP_STORAGE_STORAGE_CLASS", ""),
		BackupStorageAccessKeyID:      getString("BACKUP_STORAGE_ACCESS_KEY_ID", ""),
		BackupStorageSecretAccessKey:  getString("BACKUP_STORAGE_SECRET_ACCESS_KEY", ""),
		BuildCommit:                   buildCommit,
		BuildTime:                     buildTime,
		GoVersion:                     runtime.Version(),
	}

	port, err := getInt("APP_PORT", 3001)
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

	maxMultipartBodyBytes, err := getInt64("MAX_MULTIPART_BODY_BYTES", 8<<20)
	if err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	cfg.MaxMultipartBodyBytes = maxMultipartBodyBytes

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

	coefficientsDifferentTriesPerRound, err := getInt("COEFFICIENTS_DIFFERENT_TRIES_PER_ROUND", 100)
	if err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	cfg.CoefficientsDifferentTriesPerRound = coefficientsDifferentTriesPerRound

	coefficientsChildrenAmt, err := getInt("COEFFICIENTS_CHILDREN_AMT", 10)
	if err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	cfg.CoefficientsChildrenAmt = coefficientsChildrenAmt

	coefficientsBestAmt, err := getInt("COEFFICIENTS_BEST_AMT", 10)
	if err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	cfg.CoefficientsBestAmt = coefficientsBestAmt

	coefficientsDays7, err := getInt("COEFFICIENTS_DAYS_7", 7)
	if err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	cfg.CoefficientsDays7 = coefficientsDays7

	coefficientsDays60, err := getInt("COEFFICIENTS_DAYS_60", 60)
	if err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	cfg.CoefficientsDays60 = coefficientsDays60

	coefficientsMaxTriesIfUnchanged, err := getInt("COEFFICIENTS_MAX_TRIES_IF_UNCHANGED", 20)
	if err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	cfg.CoefficientsMaxTriesIfUnchanged = coefficientsMaxTriesIfUnchanged

	quotesFetchDays, err := getInt("QUOTES_FETCH_DAYS", 7)
	if err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	cfg.QuotesFetchDays = quotesFetchDays

	quotesRetryAttempts, err := getInt("QUOTES_RETRY_ATTEMPTS", 3)
	if err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	cfg.QuotesRetryAttempts = quotesRetryAttempts

	quotesRetryDelaySeconds, err := getInt("QUOTES_RETRY_DELAY_SECONDS", 30)
	if err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	cfg.QuotesRetryDelay = time.Duration(quotesRetryDelaySeconds) * time.Second

	quotesRequestTimeoutSeconds, err := getInt("QUOTES_REQUEST_TIMEOUT_SECONDS", 20)
	if err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	cfg.QuotesRequestTimeout = time.Duration(quotesRequestTimeoutSeconds) * time.Second

	backupOperationTimeoutSeconds, err := getInt("BACKUP_OPERATION_TIMEOUT_SECONDS", 300)
	if err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	cfg.BackupOperationTimeout = time.Duration(backupOperationTimeoutSeconds) * time.Second

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
	if strings.TrimSpace(c.DatabasePath) == "" {
		return fmt.Errorf("validate config: DATABASE_PATH is required")
	}
	if strings.TrimSpace(c.MigrationsDir) == "" {
		return fmt.Errorf("validate config: MIGRATIONS_DIR is required")
	}
	if strings.TrimSpace(c.PublicDir) == "" {
		return fmt.Errorf("validate config: PUBLIC_DIR is required")
	}
	if strings.TrimSpace(c.BackupsDir) == "" {
		return fmt.Errorf("validate config: BACKUPS_DIR is required")
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
	if strings.TrimSpace(c.CoefficientsJobSchedule) == "" {
		return fmt.Errorf("validate config: COEFFICIENTS_JOB_SCHEDULE is required")
	}
	if c.CoefficientsDifferentTriesPerRound <= 0 {
		return fmt.Errorf("validate config: COEFFICIENTS_DIFFERENT_TRIES_PER_ROUND must be greater than 0")
	}
	if c.CoefficientsChildrenAmt <= 0 {
		return fmt.Errorf("validate config: COEFFICIENTS_CHILDREN_AMT must be greater than 0")
	}
	if c.CoefficientsBestAmt <= 0 {
		return fmt.Errorf("validate config: COEFFICIENTS_BEST_AMT must be greater than 0")
	}
	if c.CoefficientsBestAmt > c.CoefficientsDifferentTriesPerRound {
		return fmt.Errorf("validate config: COEFFICIENTS_BEST_AMT must not exceed COEFFICIENTS_DIFFERENT_TRIES_PER_ROUND")
	}
	if c.CoefficientsDays7 <= 0 {
		return fmt.Errorf("validate config: COEFFICIENTS_DAYS_7 must be greater than 0")
	}
	if c.CoefficientsDays60 <= 0 {
		return fmt.Errorf("validate config: COEFFICIENTS_DAYS_60 must be greater than 0")
	}
	if c.CoefficientsMaxTriesIfUnchanged <= 0 {
		return fmt.Errorf("validate config: COEFFICIENTS_MAX_TRIES_IF_UNCHANGED must be greater than 0")
	}
	if strings.TrimSpace(c.QuotesJobSchedule) == "" {
		return fmt.Errorf("validate config: QUOTES_JOB_SCHEDULE is required")
	}
	if c.QuotesFetchDays <= 0 {
		return fmt.Errorf("validate config: QUOTES_FETCH_DAYS must be greater than 0")
	}
	if c.QuotesRetryAttempts <= 0 {
		return fmt.Errorf("validate config: QUOTES_RETRY_ATTEMPTS must be greater than 0")
	}
	if c.QuotesRetryDelay <= 0 {
		return fmt.Errorf("validate config: QUOTES_RETRY_DELAY_SECONDS must be greater than 0")
	}
	if c.QuotesRequestTimeout <= 0 {
		return fmt.Errorf("validate config: QUOTES_REQUEST_TIMEOUT_SECONDS must be greater than 0")
	}
	if strings.TrimSpace(c.BackupJobSchedule) == "" {
		return fmt.Errorf("validate config: BACKUP_JOB_SCHEDULE is required")
	}
	if c.BackupOperationTimeout <= 0 {
		return fmt.Errorf("validate config: BACKUP_OPERATION_TIMEOUT_SECONDS must be greater than 0")
	}
	if c.BackupJobEnabled && !c.BackupStorageEnabled {
		return fmt.Errorf("validate config: BACKUP_STORAGE_ENABLED must be true when BACKUP_JOB_ENABLED is true")
	}
	if c.BackupStorageEnabled {
		if strings.TrimSpace(c.BackupStorageRegion) == "" {
			return fmt.Errorf("validate config: BACKUP_STORAGE_REGION is required when backup storage is enabled")
		}
		if strings.TrimSpace(c.BackupStorageBucket) == "" {
			return fmt.Errorf("validate config: BACKUP_STORAGE_BUCKET is required when backup storage is enabled")
		}
		if strings.TrimSpace(c.BackupStorageAccessKeyID) == "" {
			return fmt.Errorf("validate config: BACKUP_STORAGE_ACCESS_KEY_ID is required when backup storage is enabled")
		}
		if strings.TrimSpace(c.BackupStorageSecretAccessKey) == "" {
			return fmt.Errorf("validate config: BACKUP_STORAGE_SECRET_ACCESS_KEY is required when backup storage is enabled")
		}
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
	if c.MaxMultipartBodyBytes <= 0 {
		return fmt.Errorf("validate config: MAX_MULTIPART_BODY_BYTES must be greater than 0")
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
	if c.usesInsecureJWTSecret() && !c.isTestLike() {
		return fmt.Errorf("validate config: JWT_SECRET insecure default is allowed only in test-like environments")
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

func buildDatabaseFileName(name string, env string) string {
	return fmt.Sprintf("%s-%s.db", name, env)
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

func (c Config) isTestLike() bool {
	switch strings.ToLower(strings.TrimSpace(c.AppEnv)) {
	case "test", "local":
		return true
	default:
		return false
	}
}

func (c Config) usesInsecureJWTSecret() bool {
	secret := strings.TrimSpace(c.JWTSecret)
	return secret == "test-insecure-jwt-secret" || secret == "dev-insecure-jwt-secret"
}

func getBool(key string, fallback bool) bool {
	value, ok := os.LookupEnv(key)
	if !ok || strings.TrimSpace(value) == "" {
		return fallback
	}
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
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
