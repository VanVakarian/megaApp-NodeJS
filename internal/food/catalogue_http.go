package food

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"megaapp-back/internal/auth"
	"megaapp-back/internal/ws"

	"github.com/go-chi/chi/v5"
)

type CatalogueHandler struct {
	service *Service
	hub     *ws.Hub
}

type generateProductPreviewRequest struct {
	Description string `json:"description"`
}

type saveProductRequest struct {
	ID          *int64  `json:"id"`
	Name        string  `json:"name"`
	Kcals       int64   `json:"kcals"`
	Protein     float64 `json:"protein"`
	Fat         float64 `json:"fat"`
	Carbs       float64 `json:"carbs"`
	Fiber       float64 `json:"fiber"`
	Description string  `json:"description"`
}

type analyzeVoiceRequest struct {
	Transcript string `json:"transcript"`
}

func NewCatalogueHandler(service *Service, hub *ws.Hub) *CatalogueHandler {
	return &CatalogueHandler{service: service, hub: hub}
}

func RegisterCatalogueRoutes(router chi.Router, authService *auth.Service, handler *CatalogueHandler) {
	router.With(auth.Middleware(authService)).Get("/api/food/search", handler.SearchCatalogue)
	router.With(auth.Middleware(authService)).Post("/api/food/generate-product-preview", handler.GenerateProductPreview)
	router.With(auth.Middleware(authService)).Post("/api/food/save-product", handler.SaveProduct)
	router.With(auth.Middleware(authService)).Post("/api/food/analyze-voice", handler.AnalyzeVoice)
	router.With(auth.Middleware(authService)).Delete("/api/food/catalogue/{catalogueId}", handler.DeleteCatalogueEntry)
}

func (h *CatalogueHandler) SearchCatalogue(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("query"))
	if query == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"result": false, "error": "Query parameter is required"})
		return
	}

	response, err := h.service.SearchCatalogue(r.Context(), query)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"result": false, "error": "Internal server error"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"result": true, "data": response})
}

func (h *CatalogueHandler) GenerateProductPreview(w http.ResponseWriter, r *http.Request) {
	var request generateProductPreviewRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"result": false, "error": "Invalid request body"})
		return
	}

	response, err := h.service.GenerateProductPreview(r.Context(), request.Description)
	if err != nil {
		statusCode := http.StatusInternalServerError
		message := "Internal server error"
		if strings.Contains(err.Error(), "query is required") {
			statusCode = http.StatusBadRequest
			message = "Description is required"
		}
		writeJSON(w, statusCode, map[string]any{"result": false, "error": message})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"result": true, "data": response})
}

func (h *CatalogueHandler) SaveProduct(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.UserClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
		return
	}

	var request saveProductRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"result": false, "error": "Invalid request body"})
		return
	}

	entry, statusCode, err := h.service.SaveProduct(r.Context(), request.ID, ProductInput{
		Name:        request.Name,
		Kcals:       request.Kcals,
		Protein:     request.Protein,
		Fat:         request.Fat,
		Carbs:       request.Carbs,
		Fiber:       request.Fiber,
		Description: request.Description,
	})
	if err != nil {
		writeJSON(w, statusCode, map[string]any{"result": false, "error": err.Error()})
		return
	}

	h.hub.SetSyncState(claims.UserID, nowUnixMilli())
	h.hub.BroadcastToAll(map[string]any{"type": "CATALOGUE_ENTRY_SAVED", "payload": entry}, extractClientID(r))
	writeJSON(w, statusCode, map[string]any{"result": true, "data": map[string]any{"catalogueEntry": entry}})
}

func (h *CatalogueHandler) AnalyzeVoice(w http.ResponseWriter, r *http.Request) {
	var request analyzeVoiceRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"result": false, "error": "Invalid request body"})
		return
	}

	response, err := h.service.AnalyzeVoiceTranscript(r.Context(), request.Transcript)
	if err != nil {
		statusCode := http.StatusInternalServerError
		message := "Internal server error"
		if strings.Contains(err.Error(), "transcript is required") {
			statusCode = http.StatusBadRequest
			message = "Transcript is required"
		}
		writeJSON(w, statusCode, map[string]any{"result": false, "error": message})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"result": true, "data": response})
}

func (h *CatalogueHandler) DeleteCatalogueEntry(w http.ResponseWriter, r *http.Request) {
	catalogueID, err := strconv.ParseInt(chi.URLParam(r, "catalogueId"), 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"result": false, "error": "Invalid catalogueId"})
		return
	}

	deleted, err := h.service.DeleteProduct(r.Context(), catalogueID)
	if err != nil {
		if strings.Contains(err.Error(), "used in diary entries") {
			writeJSON(w, http.StatusConflict, map[string]any{"result": false, "error": err.Error()})
			return
		}
		if strings.Contains(err.Error(), "product not found") {
			writeJSON(w, http.StatusNotFound, map[string]any{"result": false, "error": err.Error()})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"result": false, "error": "Internal server error"})
		return
	}
	if !deleted {
		writeJSON(w, http.StatusNotFound, map[string]any{"result": false, "error": "Product not found"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"result": true, "data": map[string]any{"catalogueId": catalogueID}})
}

func nowUnixMilli() int64 {
	return time.Now().UnixMilli()
}
