package metrics

import (
	"net/http"
	"strconv"

	"megaapp-back/internal/auth"
	"megaapp-back/internal/httpx/legacy"

	"github.com/go-chi/chi/v5"
)

type HistoryHandler struct {
	service *Service
	client  *FlatlineClient
}

func NewHistoryHandler(service *Service, client *FlatlineClient) *HistoryHandler {
	return &HistoryHandler{service: service, client: client}
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

	minuteSince, err := parseHistorySince(r.URL.Query().Get("minuteSince"))
	if err != nil {
		legacy.WriteDetail(w, http.StatusBadRequest, "Invalid minute since")
		return
	}
	hourSince, err := parseHistorySince(r.URL.Query().Get("hourSince"))
	if err != nil {
		legacy.WriteDetail(w, http.StatusBadRequest, "Invalid hour since")
		return
	}
	daySince, err := parseHistorySince(r.URL.Query().Get("daySince"))
	if err != nil {
		legacy.WriteDetail(w, http.StatusBadRequest, "Invalid day since")
		return
	}

	histories, err := h.client.History(r.Context(), minuteSince, hourSince, daySince)
	if err != nil {
		legacy.WriteDetail(w, http.StatusBadGateway, "Failed to load metrics history")
		return
	}

	legacy.WriteJSON(w, http.StatusOK, map[string]any{"histories": histories})
}

func parseHistorySince(raw string) (int64, error) {
	since, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || since <= 0 {
		return 0, strconv.ErrSyntax
	}
	return since, nil
}
