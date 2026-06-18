package httpx

import (
	"database/sql"
	"strings"
	"time"

	"megaapp-back/internal/auth"
	"megaapp-back/internal/config"
	"megaapp-back/internal/food"
	clockplatform "megaapp-back/internal/platform/clock"
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

type foodModule struct {
	service          *food.Service
	readHandler      *food.Handler
	writeHandler     *food.WriteHandler
	catalogueHandler *food.CatalogueHandler
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

func buildFoodModule(db *sql.DB, cfg config.Config, hub *ws.Hub, clk clockplatform.Clock) (foodModule, error) {
	repo := food.NewRepository(db)
	service := food.NewService(repo)
	service.SetClock(clk)
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
	realtime := food.NewWSRealtimePublisher(hub, clk)
	hub.RegisterHandler("SEARCH_QUERY", food.NewSearchWSHandler(service, clk))
	return foodModule{
		service:          service,
		readHandler:      food.NewHandler(service),
		writeHandler:     food.NewWriteHandler(service, realtime),
		catalogueHandler: food.NewCatalogueHandler(service, realtime),
	}, nil
}
