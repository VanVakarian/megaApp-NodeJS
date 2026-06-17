package food

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"megaapp-back/internal/auth"

	"github.com/go-chi/chi/v5"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func RegisterRoutes(router chi.Router, authService *auth.Service, handler *Handler) {
	router.Route("/api/food", func(r chi.Router) {
		r.Use(auth.Middleware(authService))
		r.Get("/diary-full-update", handler.GetDiaryFullUpdate)
		r.Get("/catalogue", handler.GetCatalogue)
		r.Get("/catalogue/{catalogueId}", handler.GetCatalogueEntry)
		r.Get("/coefficients", handler.GetCoefficients)
		r.Get("/stats", handler.GetStats)
	})
}

func (h *Handler) GetDiaryFullUpdate(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.UserClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
		return
	}

	dateISO := strings.TrimSpace(r.URL.Query().Get("date"))
	if dateISO == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "date is required"})
		return
	}
	offset, err := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("offset")))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "offset is required"})
		return
	}

	response, err := h.service.GetDiaryFullUpdate(r.Context(), claims.UserID, dateISO, offset)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, response)
}

func (h *Handler) GetCatalogue(w http.ResponseWriter, r *http.Request) {
	response, err := h.service.GetCatalogue(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, response)
}

func (h *Handler) GetCatalogueEntry(w http.ResponseWriter, r *http.Request) {
	catalogueID, err := strconv.ParseInt(chi.URLParam(r, "catalogueId"), 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"result": false, "error": "Invalid catalogueId"})
		return
	}

	response, err := h.service.GetCatalogueEntry(r.Context(), catalogueID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"result": false, "error": err.Error()})
		return
	}
	if response == nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"result": false, "error": "Product not found"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"result": true, "data": response})
}

func (h *Handler) GetCoefficients(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.UserClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
		return
	}

	response, err := h.service.GetCoefficients(r.Context(), claims.UserID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"result": false, "error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"result": true, "data": response})
}

func (h *Handler) GetStats(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.UserClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
		return
	}

	response, err := h.service.GetStats(r.Context(), claims.UserID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to get stats"})
		return
	}

	writeJSON(w, http.StatusOK, response)
}

func writeJSON(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}
