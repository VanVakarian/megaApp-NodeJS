package metrics

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"megaapp-back/internal/auth"
	"megaapp-back/internal/httpx/legacy"
	clockplatform "megaapp-back/internal/platform/clock"

	"github.com/go-chi/chi/v5"
)

var errInvalidHistoryNames = errors.New("invalid metric names")

const (
	minuteHistoryWindowSeconds = 24 * 3600
	hourHistoryWindowSeconds   = 30 * 24 * 3600
	dayHistoryWindowSeconds    = 365 * 24 * 3600
	maxHistoryServices         = 64
)

type ServiceHistory struct {
	Service   string           `json:"service"`
	Snapshots []MetricSnapshot `json:"snapshots"`
}

type HistoryHandler struct {
	service *Service
	client  *FlatlineClient
	clock   clockplatform.Clock
}

func NewHistoryHandler(service *Service, client *FlatlineClient, clock clockplatform.Clock) *HistoryHandler {
	return &HistoryHandler{service: service, client: client, clock: clock}
}

func RegisterRoutes(router chi.Router, authService *auth.Service, handler *HistoryHandler) {
	router.Route("/api/metrics", func(r chi.Router) {
		r.Use(auth.Middleware(authService))
		r.Get("/history", handler.History)
	})
}

func (h *HistoryHandler) History(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.UserClaimsFromContext(r.Context())
	if !ok {
		legacy.WriteDetail(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	isAdmin, err := h.service.IsAdmin(r.Context(), claims.UserID)
	if err != nil {
		legacy.WriteDetail(w, http.StatusInternalServerError, "Failed to check permissions")
		return
	}
	if !isAdmin {
		legacy.WriteDetail(w, http.StatusForbidden, "Forbidden")
		return
	}

	if rawServices := r.URL.Query().Get("services"); rawServices != "" {
		h.allHistory(w, r, rawServices)
		return
	}

	service := strings.TrimSpace(r.URL.Query().Get("service"))
	if service == "" {
		legacy.WriteDetail(w, http.StatusBadRequest, "Missing service")
		return
	}
	names, err := parseHistoryNames(r.URL.Query().Get("names"))
	if err != nil {
		legacy.WriteDetail(w, http.StatusBadRequest, "Invalid metric names")
		return
	}

	now := h.clock.Now().Unix()
	snapshots, err := h.client.History(
		r.Context(),
		service,
		names,
		now-minuteHistoryWindowSeconds,
		now-hourHistoryWindowSeconds,
		now-dayHistoryWindowSeconds,
	)
	if err != nil {
		legacy.WriteDetail(w, http.StatusBadGateway, "Failed to load metrics history")
		return
	}

	legacy.WriteJSON(w, http.StatusOK, map[string]any{"snapshots": snapshots})
}

func (h *HistoryHandler) allHistory(w http.ResponseWriter, r *http.Request, rawServices string) {
	services, err := parseHistoryServices(rawServices)
	if err != nil {
		legacy.WriteDetail(w, http.StatusBadRequest, "Invalid services")
		return
	}

	anchor, err := parseHistoryAnchor(r.URL.Query().Get("latestBucket"), h.clock.Now().Unix())
	if err != nil {
		legacy.WriteDetail(w, http.StatusBadRequest, "Invalid latest bucket")
		return
	}
	histories, err := h.loadHistories(r.Context(), services, anchor)
	if err != nil {
		legacy.WriteDetail(w, http.StatusBadGateway, "Failed to load metrics history")
		return
	}

	legacy.WriteJSON(w, http.StatusOK, map[string]any{"histories": histories})
}

func (h *HistoryHandler) loadHistories(ctx context.Context, services []string, now int64) ([]ServiceHistory, error) {
	type result struct {
		index   int
		history ServiceHistory
		err     error
	}

	results := make(chan result, len(services))
	for index, service := range services {
		go func() {
			snapshots, err := h.client.History(
				ctx,
				service,
				nil,
				now-minuteHistoryWindowSeconds,
				now-hourHistoryWindowSeconds,
				now-dayHistoryWindowSeconds,
			)
			results <- result{
				index:   index,
				history: ServiceHistory{Service: service, Snapshots: snapshots},
				err:     err,
			}
		}()
	}

	histories := make([]ServiceHistory, len(services))
	var combinedErr error
	for range services {
		result := <-results
		if result.err != nil {
			combinedErr = errors.Join(combinedErr, fmt.Errorf("load %q history: %w", result.history.Service, result.err))
			continue
		}
		histories[result.index] = result.history
	}
	return histories, combinedErr
}

func parseHistoryServices(raw string) ([]string, error) {
	services, err := parseHistoryNames(raw)
	if err != nil || len(services) == 0 || len(services) > maxHistoryServices {
		return nil, errInvalidHistoryNames
	}
	return services, nil
}

func parseHistoryAnchor(raw string, fallback int64) (int64, error) {
	if raw == "" {
		return fallback, nil
	}
	anchor, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || anchor <= 0 {
		return 0, errInvalidHistoryNames
	}
	return anchor, nil
}

func parseHistoryNames(raw string) ([]string, error) {
	if raw == "" {
		return nil, nil
	}

	seen := make(map[string]struct{})
	names := make([]string, 0)
	for _, rawName := range strings.Split(raw, ",") {
		name := strings.TrimSpace(rawName)
		if name == "" {
			return nil, errInvalidHistoryNames
		}
		if _, exists := seen[name]; exists {
			continue
		}
		seen[name] = struct{}{}
		names = append(names, name)
	}
	return names, nil
}
