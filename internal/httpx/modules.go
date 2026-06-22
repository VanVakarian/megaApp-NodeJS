package httpx

import (
	"context"
	"database/sql"
	"log/slog"
	"strings"
	"time"

	"megaapp-back/internal/auth"
	"megaapp-back/internal/backup"
	"megaapp-back/internal/config"
	"megaapp-back/internal/food"
	"megaapp-back/internal/jobs"
	"megaapp-back/internal/metrics"
	"megaapp-back/internal/money"
	clockplatform "megaapp-back/internal/platform/clock"
	s3platform "megaapp-back/internal/platform/s3"
	"megaapp-back/internal/quotes"
	"megaapp-back/internal/settings"
	"megaapp-back/internal/ws"
)

type authModule struct {
	service *auth.Service
	handler *auth.Handler
}

type settingsModule struct {
	service *settings.Service
	handler *settings.Handler
}

type wsModule struct {
	hub     *ws.Hub
	handler *ws.Handler
}

type moneyModule struct {
	service *money.Service
	handler *money.Handler
}

type quotesModule struct {
	service      *quotes.Service
	debugHandler *quotes.DebugHandler
}

type backupModule struct {
	service      *backup.Service
	debugHandler *backup.DebugHandler
}

type metricsModule struct {
	service  *metrics.Service
	realtime *metrics.Realtime
}

type foodModule struct {
	service          *food.Service
	readHandler      *food.Handler
	writeHandler     *food.WriteHandler
	catalogueHandler *food.CatalogueHandler
	imageHandler     *food.ImageHandler
	labHandler       *food.LabHandler
	debugHandler     *food.DebugHandler
	backgrounds      []interface{ Close() error }
}

func buildAuthModule(db *sql.DB, cfg config.Config) authModule {
	repo := auth.NewRepository(db)
	tokenManager := auth.NewTokenManager(cfg.JWTSecret, auth.AccessTokenTTL(), auth.RefreshTokenTTL())
	service := auth.NewService(repo, tokenManager)
	return authModule{service: service, handler: auth.NewHandler(service)}
}

func buildSettingsModule(db *sql.DB) settingsModule {
	repo := settings.NewRepository(db)
	service := settings.NewService(repo)
	return settingsModule{service: service, handler: settings.NewHandler(service)}
}

func buildWSModule(cfg config.Config, authService *auth.Service) wsModule {
	hub := ws.NewHub(30*time.Second, ws.NewSyncState())
	hub.SetReadLimitBytes(cfg.WSReadLimitBytes)
	hub.SetWriteTimeout(cfg.WSWriteTimeout)
	return wsModule{hub: hub, handler: ws.NewHandler(authService, hub)}
}

func buildMoneyModule(db *sql.DB) moneyModule {
	repo := money.NewRepository(db)
	service := money.NewService(repo)
	return moneyModule{service: service, handler: money.NewHandler(service)}
}

func buildQuotesModule(db *sql.DB, cfg config.Config, logger *slog.Logger, clk clockplatform.Clock, runtime *jobs.Runtime) (quotesModule, error) {
	repo := quotes.NewRepository(db)
	service := quotes.NewService(repo, quotes.Config{
		FetchDays:      cfg.QuotesFetchDays,
		RetryAttempts:  cfg.QuotesRetryAttempts,
		RetryDelay:     cfg.QuotesRetryDelay,
		RequestTimeout: cfg.QuotesRequestTimeout,
	}, clk, quotes.NewMarketFetcher(cfg.QuotesRequestTimeout))
	if cfg.QuotesJobEnabled {
		if err := runtime.Register("quotes", cfg.QuotesJobSchedule, func(ctx context.Context) error {
			_, err := service.Run(ctx)
			return err
		}); err != nil {
			return quotesModule{}, err
		}
	}
	return quotesModule{service: service, debugHandler: quotes.NewDebugHandler(service)}, nil
}

func buildBackupModule(db *sql.DB, cfg config.Config, logger *slog.Logger, clk clockplatform.Clock, runtime *jobs.Runtime) (backupModule, error) {
	var uploader *s3platform.Client
	if cfg.BackupStorageEnabled {
		uploader = s3platform.NewClient(s3platform.Config{
			Region:          cfg.BackupStorageRegion,
			Bucket:          cfg.BackupStorageBucket,
			Endpoint:        cfg.BackupStorageEndpoint,
			ForcePathStyle:  cfg.BackupStorageForcePathStyle,
			StorageClass:    cfg.BackupStorageClass,
			AccessKeyID:     cfg.BackupStorageAccessKeyID,
			SecretAccessKey: cfg.BackupStorageSecretAccessKey,
		})
	}
	service := backup.NewService(db, backup.Config{
		DatabaseName:   cfg.DatabaseName,
		DatabaseEnv:    cfg.DatabaseEnv,
		BackupsDir:     cfg.BackupsDir,
		StorageEnabled: cfg.BackupStorageEnabled,
		StorageClass:   cfg.BackupStorageClass,
	}, clk, uploader)
	if cfg.BackupJobEnabled {
		if err := runtime.Register("backup", cfg.BackupJobSchedule, func(ctx context.Context) error {
			backupCtx, cancel := context.WithTimeout(ctx, cfg.BackupOperationTimeout)
			defer cancel()
			_, err := service.Run(backupCtx)
			return err
		}); err != nil {
			return backupModule{}, err
		}
	}
	_ = logger
	return backupModule{service: service, debugHandler: backup.NewDebugHandler(service)}, nil
}

func buildMetricsModule(db *sql.DB, hub *ws.Hub, authService *auth.Service, clk clockplatform.Clock, runtime *jobs.Runtime) (metricsModule, error) {
	repo := metrics.NewRepository(db)
	service := metrics.NewService(repo, clk, authService)
	realtime := metrics.NewRealtime(hub)

	hub.RegisterHandler("METRICS_SUBSCRIBE", metrics.NewSubscribeHandler(service, realtime))
	hub.RegisterHandler("METRICS_UNSUBSCRIBE", metrics.NewUnsubscribeHandler(realtime))

	if err := runtime.Register("metrics", "* * * * *", func(ctx context.Context) error {
		points, err := service.Flush(ctx)
		if err != nil {
			return err
		}
		if len(points) > 0 {
			realtime.BroadcastDetail(metrics.DetailUpdate{Points: points})
		}

		adminUserIDs, err := service.AdminUserIDs(ctx)
		if err != nil {
			return err
		}
		realtime.BroadcastHealth(adminUserIDs, metrics.HealthStatus{
			Services: []metrics.ServiceHealth{{Service: metrics.MainServiceName, Severity: "ok"}},
		})
		return nil
	}); err != nil {
		return metricsModule{}, err
	}

	return metricsModule{service: service, realtime: realtime}, nil
}

func buildFoodModule(db *sql.DB, cfg config.Config, hub *ws.Hub, clk clockplatform.Clock, metricsRecorder food.MetricsRecorder) (foodModule, error) {
	repo := food.NewRepository(db)
	service := food.NewService(repo)
	service.SetClock(clk)
	service.SetCoefficientsConfig(food.CoefficientsConfig{
		StartWithDefaults:      cfg.CoefficientsStartWithDefaults,
		DifferentTriesPerRound: cfg.CoefficientsDifferentTriesPerRound,
		ChildrenAmt:            cfg.CoefficientsChildrenAmt,
		BestAmt:                cfg.CoefficientsBestAmt,
		Days7:                  cfg.CoefficientsDays7,
		Days60:                 cfg.CoefficientsDays60,
		MaxTriesIfUnchanged:    cfg.CoefficientsMaxTriesIfUnchanged,
	})
	var mediaClient *food.OpenRouterMediaClient
	if strings.TrimSpace(cfg.OpenRouterAPIKey) != "" {
		productGenerator, err := food.NewOpenRouterProductGenerator(food.OpenRouterProductGeneratorConfig{
			APIKey:  cfg.OpenRouterAPIKey,
			Model:   cfg.OpenRouterModel,
			Timeout: cfg.OpenRouterTimeout,
		})
		if err != nil {
			return foodModule{}, err
		}
		service.SetProductGenerator(productGenerator)
		mediaClient, err = food.NewOpenRouterMediaClient(food.OpenRouterMediaClientConfig{
			APIKey:      cfg.OpenRouterAPIKey,
			VisionModel: cfg.OpenRouterVisionModel,
			ImageModel:  cfg.OpenRouterImageModel,
			Timeout:     cfg.OpenRouterTimeout,
		})
		if err != nil {
			return foodModule{}, err
		}
		service.SetImageAnalyzer(mediaClient)
	}
	if strings.TrimSpace(cfg.OpenAIAPIKey) != "" {
		embeddingGenerator, err := food.NewOpenAIEmbeddingGenerator(food.OpenAIEmbeddingGeneratorConfig{
			APIKey:     cfg.OpenAIAPIKey,
			Model:      cfg.OpenAIEmbeddingModel,
			Dimensions: cfg.OpenAIEmbeddingDims,
			Timeout:    cfg.OpenAITimeout,
		})
		if err != nil {
			return foodModule{}, err
		}
		service.SetEmbeddingGenerator(embeddingGenerator)
	}
	imageStore, err := food.NewImageStore(cfg.PublicDir)
	if err != nil {
		return foodModule{}, err
	}
	service.SetImageVersionProvider(imageStore)
	realtime := food.NewWSRealtimePublisher(hub, clk)
	imagePipeline := food.NewImagePipeline(imageStore, mediaClient, realtime)
	service.SetImageGenerationRequester(imagePipeline)
	hub.RegisterHandler("SEARCH_QUERY", food.NewSearchWSHandler(service, clk))
	return foodModule{
		service:          service,
		readHandler:      food.NewHandler(service, realtime),
		writeHandler:     food.NewWriteHandler(service, realtime, metricsRecorder),
		catalogueHandler: food.NewCatalogueHandler(service, realtime),
		imageHandler:     food.NewImageHandler(imageStore),
		labHandler:       food.NewLabHandler(food.NewLabService(repo, service, imagePipeline)),
		debugHandler:     food.NewDebugHandler(food.NewDebugService(repo, cfg.BackupsDir, mediaClient, service, realtime)),
		backgrounds:      []interface{ Close() error }{imagePipeline, imageStore},
	}, nil
}
