package httpx

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"time"

	"megaapp-back/internal/auth"
	"megaapp-back/internal/config"
	sqliteplatform "megaapp-back/internal/platform/sqlite"
	"megaapp-back/internal/settings"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
)

type App struct {
	Config   config.Config
	Logger   *slog.Logger
	Observer Observer
	DB       *sqliteplatform.DB
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

	router := chi.NewRouter()
	router.Use(chimiddleware.RequestID)
	router.Use(chimiddleware.RealIP)
	router.Use(chimiddleware.Recoverer)
	router.Use(LoggingMiddleware(logger, observer))

	router.Get("/health", HealthHandler())
	router.Get("/readiness", ReadinessHandler(db.PingContext))
	router.Get("/build-info", BuildInfoHandler(cfg))

	auth.RegisterRoutes(router, authHandler)
	settings.RegisterRoutes(router, authService, settingsHandler)

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
	if err := a.DB.Close(); err != nil {
		errs = append(errs, err)
	}
	return errors.Join(errs...)
}

func (a *App) SQLDB() *sql.DB {
	return a.DB.SQL()
}
