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
	"megaapp-back/internal/food"
	"megaapp-back/internal/money"
	clockplatform "megaapp-back/internal/platform/clock"
	sqliteplatform "megaapp-back/internal/platform/sqlite"
	"megaapp-back/internal/settings"
	"megaapp-back/internal/ws"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
)

type App struct {
	Config      config.Config
	Logger      *slog.Logger
	Observer    Observer
	DB          *sqliteplatform.DB
	WSHub       interface{ Close() error }
	Backgrounds []interface{ Close() error }
	Handler     http.Handler
	Server      *http.Server
}

func NewApp(ctx context.Context, cfg config.Config, logger *slog.Logger) (*App, error) {
	observer := NoopObserver{}
	clk := clockplatform.NewRealClock()

	db, err := sqliteplatform.Open(ctx, cfg.DatabasePath)
	if err != nil {
		return nil, err
	}

	if err := sqliteplatform.ApplyMigrations(ctx, db.SQL(), cfg.MigrationsDir); err != nil {
		_ = db.Close()
		return nil, err
	}

	authModule := buildAuthModule(db.SQL(), cfg)
	settingsModule := buildSettingsModule(db.SQL())
	moneyModule := buildMoneyModule(db.SQL())
	wsModule := buildWSModule(cfg, authModule.service)
	foodModule, err := buildFoodModule(db.SQL(), cfg, wsModule.hub, clk)
	if err != nil {
		_ = wsModule.hub.Close()
		_ = db.Close()
		return nil, err
	}

	router := chiRouter(logger, observer, cfg.MaxRequestBodyBytes, cfg.MaxMultipartBodyBytes)
	router.Get("/health", HealthHandler())
	router.Get("/readiness", ReadinessHandler(db.PingContext))
	router.Get("/build-info", BuildInfoHandler(cfg))
	router.Get("/api/debug/commit-info", CommitInfoHandler(cfg))

	auth.RegisterRoutes(router, authModule.handler)
	settings.RegisterRoutes(router, authModule.service, settingsModule.handler)
	money.RegisterRoutes(router, authModule.service, moneyModule.handler)
	food.RegisterRoutes(router, authModule.service, foodModule.readHandler)
	food.RegisterWriteRoutes(router, authModule.service, foodModule.writeHandler)
	food.RegisterCatalogueRoutes(router, authModule.service, foodModule.catalogueHandler)
	food.RegisterImageRoutes(router, foodModule.imageHandler)
	food.RegisterLabRoutes(router, foodModule.labHandler)
	food.RegisterDebugRoutes(router, foodModule.debugHandler)
	ws.RegisterRoutes(router, wsModule.handler)

	server := &http.Server{
		Addr:              cfg.HTTPAddress(),
		Handler:           router,
		ReadHeaderTimeout: readHeaderTimeout(cfg.HTTPReadTimeout),
		ReadTimeout:       cfg.HTTPReadTimeout,
		WriteTimeout:      cfg.HTTPWriteTimeout,
		IdleTimeout:       cfg.HTTPIdleTimeout,
	}

	return &App{
		Config:      cfg,
		Logger:      logger,
		Observer:    observer,
		DB:          db,
		WSHub:       wsModule.hub,
		Backgrounds: foodModule.backgrounds,
		Handler:     router,
		Server:      server,
	}, nil
}

func chiRouter(logger *slog.Logger, observer Observer, maxRequestBodyBytes int64, maxMultipartBodyBytes int64) chi.Router {
	router := chi.NewRouter()
	router.Use(chimiddleware.RequestID)
	router.Use(chimiddleware.RealIP)
	router.Use(chimiddleware.Recoverer)
	router.Use(RequestBodyLimitMiddleware(maxRequestBodyBytes, maxMultipartBodyBytes))
	router.Use(LoggingMiddleware(logger, observer))
	return router
}

func readHeaderTimeout(readTimeout time.Duration) time.Duration {
	if readTimeout <= 5*time.Second {
		return readTimeout
	}
	return 5 * time.Second
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
	for _, background := range a.Backgrounds {
		if err := background.Close(); err != nil {
			errs = append(errs, err)
		}
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
