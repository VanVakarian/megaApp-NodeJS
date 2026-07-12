package metrics

import (
	"errors"
	"net/http"
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
)

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
