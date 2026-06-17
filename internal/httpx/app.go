package httpx

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"megaapp-back/internal/auth"
	"megaapp-back/internal/config"
	"megaapp-back/internal/food"
	sqliteplatform "megaapp-back/internal/platform/sqlite"
	"megaapp-back/internal/settings"
	"megaapp-back/internal/ws"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
)

type App struct {
	Config   config.Config
	Logger   *slog.Logger
	Observer Observer
	DB       *sqliteplatform.DB
	WSHub    *ws.Hub
	Handler  http.Handler
	Server   *http.Server
}

func NewApp(ctx context.Context, cfg config.Config, logger *slog.Logger) (*App, error) {
	observer := NoopObserver{}

	db, err := sqliteplatform.Open(ctx, cfg.DatabasePath)
	if err != nil {
		return nil, err
	}

	if err := sqliteplatform.ApplyMigrations(ctx, db.SQL(), cfg.MigrationsDir); err != nil {
		_ = db.Close()
		return nil, err
	}

	authRepo := auth.NewRepository(db.SQL())
	authTokenManager := auth.NewTokenManager(cfg.JWTSecret, auth.AccessTokenTTL(), auth.RefreshTokenTTL())
	authService := auth.NewService(authRepo, authTokenManager)
	authHandler := auth.NewHandler(authService)
	settingsRepo := settings.NewRepository(db.SQL())
	settingsService := settings.NewService(settingsRepo)
	settingsHandler := settings.NewHandler(settingsService)
	foodRepo := food.NewRepository(db.SQL())
	foodService := food.NewService(foodRepo)
	if strings.TrimSpace(cfg.OpenRouterAPIKey) != "" {
		productGenerator, err := food.NewOpenRouterProductGenerator(food.OpenRouterProductGeneratorConfig{
			APIKey:  cfg.OpenRouterAPIKey,
			Model:   cfg.OpenRouterModel,
			Timeout: cfg.OpenRouterTimeout,
		})
		if err != nil {
			_ = db.Close()
			return nil, err
		}
		foodService.SetProductGenerator(productGenerator)
	}
	if strings.TrimSpace(cfg.OpenAIAPIKey) != "" {
		embeddingGenerator, err := food.NewOpenAIEmbeddingGenerator(food.OpenAIEmbeddingGeneratorConfig{
			APIKey:     cfg.OpenAIAPIKey,
			Model:      cfg.OpenAIEmbeddingModel,
			Dimensions: cfg.OpenAIEmbeddingDims,
			Timeout:    cfg.OpenAITimeout,
		})
		if err != nil {
			_ = db.Close()
			return nil, err
		}
		foodService.SetEmbeddingGenerator(embeddingGenerator)
	}
	foodHandler := food.NewHandler(foodService)
	wsHub := ws.NewHub(30*time.Second, ws.NewSyncState())
	wsHub.RegisterHandler("SEARCH_QUERY", food.NewSearchWSHandler(foodService))
	foodWriteHandler := food.NewWriteHandler(foodService, wsHub)
	foodCatalogueHandler := food.NewCatalogueHandler(foodService, wsHub)
	wsHandler := ws.NewHandler(authService, wsHub)

	router := chi.NewRouter()
	router.Use(chimiddleware.RequestID)
	router.Use(chimiddleware.RealIP)
	router.Use(chimiddleware.Recoverer)
	router.Use(LoggingMiddleware(logger, observer))

	router.Get("/health", HealthHandler())
	router.Get("/readiness", ReadinessHandler(db.PingContext))
	router.Get("/build-info", BuildInfoHandler(cfg))
	router.Get("/api/debug/commit-info", CommitInfoHandler(cfg))

	auth.RegisterRoutes(router, authHandler)
	settings.RegisterRoutes(router, authService, settingsHandler)
	food.RegisterRoutes(router, authService, foodHandler)
	food.RegisterWriteRoutes(router, authService, foodWriteHandler)
	food.RegisterCatalogueRoutes(router, authService, foodCatalogueHandler)
	ws.RegisterRoutes(router, wsHandler)

	server := &http.Server{
		Addr:              cfg.HTTPAddress(),
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
	}

	return &App{
		Config:   cfg,
		Logger:   logger,
		Observer: observer,
		DB:       db,
		WSHub:    wsHub,
		Handler:  router,
		Server:   server,
	}, nil
}

func (a *App) Serve(listener net.Listener) error {
	err := a.Server.Serve(listener)
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

func (a *App) Start() error {
	err := a.Server.ListenAndServe()
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

func (a *App) Shutdown(ctx context.Context) error {
	var errs []error
	if err := a.Server.Shutdown(ctx); err != nil {
		errs = append(errs, err)
	}
	if err := a.WSHub.Close(); err != nil {
		errs = append(errs, err)
	}
	if err := a.DB.Close(); err != nil {
		errs = append(errs, err)
	}
	return errors.Join(errs...)
}

func (a *App) SQLDB() *sql.DB {
	return a.DB.SQL()
}
