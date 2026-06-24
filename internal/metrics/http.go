package metrics

import (
	"errors"
	"net/http"

	"megaapp-back/internal/httpx/legacy"

	"github.com/go-chi/chi/v5"
)

var ErrInvalidIngestPayload = errors.New("invalid metrics ingest payload")

type Handler struct {
	service  *Service
	realtime *Realtime
}

func NewHandler(service *Service, realtime *Realtime) *Handler {
	return &Handler{service: service, realtime: realtime}
}

func RegisterRoutes(router chi.Router, handler *Handler) {
	router.Route("/api/metrics", func(r chi.Router) {
		r.Post("/snapshots", handler.IngestSnapshots)
	})
}

func (h *Handler) IngestSnapshots(w http.ResponseWriter, r *http.Request) {
	var request IngestRequest
	if err := legacy.DecodeJSON(r, &request); err != nil {
		legacy.WriteAppDetailError(w, err, http.StatusBadRequest, "Invalid request body")
		return
	}

	points, err := h.service.IngestSnapshots(r.Context(), request)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, ErrInvalidIngestPayload) {
			status = http.StatusBadRequest
		}
		legacy.WriteResultError(w, status, err.Error())
		return
	}

	h.realtime.BroadcastDetail(DetailUpdate{Points: points})

	adminUserIDs, err := h.service.AdminUserIDs(r.Context())
	if err != nil {
		legacy.WriteResultError(w, http.StatusInternalServerError, err.Error())
		return
	}

	health, err := h.service.CurrentHealth(r.Context())
	if err != nil {
		legacy.WriteResultError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.realtime.BroadcastHealth(adminUserIDs, health)
	legacy.WriteJSON(w, http.StatusOK, map[string]bool{"result": true})
}
