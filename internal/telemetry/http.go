package telemetry

import (
	"net/http"

	"megaapp-back/internal/auth"
	"megaapp-back/internal/httpx/legacy"

	"github.com/go-chi/chi/v5"
)

type Handler struct {
	writer  *EventWriter
	enabled bool
}

func NewHandler(enabled bool, dataDir string) *Handler {
	return &Handler{writer: NewEventWriter(dataDir), enabled: enabled}
}

func RegisterRoutes(router chi.Router, authService *auth.Service, handler *Handler) {
	router.Route("/api/telemetry", func(r chi.Router) {
		r.Use(auth.Middleware(authService))
		r.Post("/events", handler.PostEvents)
	})
}

// PostEvents accepts one telemetry batch and appends it to the shared NDJSON file. The HTTP
// status code is the only acknowledgement: 2xx/4xx tell the client its batch is done (either
// stored, or malformed and not worth retrying), a 5xx tells it to keep the batch queued.
func (h *Handler) PostEvents(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.UserClaimsFromContext(r.Context())
	if !ok {
		legacy.WriteDetail(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var batch eventBatch
	if err := legacy.DecodeJSON(r, &batch); err != nil {
		legacy.WriteAppDetailError(w, err, http.StatusBadRequest, "Invalid request body")
		return
	}

	lines, err := encodeBatch(batch, claims.UserID, r.Header.Get("X-Client-ID"))
	if err != nil {
		legacy.WriteDetail(w, http.StatusBadRequest, "Invalid telemetry batch")
		return
	}

	if !h.enabled {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if err := h.writer.Append(lines); err != nil {
		legacy.WriteDetail(w, http.StatusInternalServerError, "Failed to store telemetry batch")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
