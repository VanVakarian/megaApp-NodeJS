package food

import (
	"net/http"
	"strconv"
	"strings"

	"megaapp-back/internal/httpx/legacy"

	"github.com/go-chi/chi/v5"
)

type LabHandler struct {
	service *LabService
}

type DebugHandler struct {
	service *DebugService
}

func NewLabHandler(service *LabService) *LabHandler {
	return &LabHandler{service: service}
}

func NewDebugHandler(service *DebugService) *DebugHandler {
	return &DebugHandler{service: service}
}

func RegisterLabRoutes(router chi.Router, handler *LabHandler) {
	if handler == nil {
		return
	}
	router.Route("/api/lab", func(r chi.Router) {
		r.Get("/generate-product", handler.GenerateProduct)
		r.Get("/generate-embeddings", handler.GenerateEmbeddings)
		r.Get("/generate-image", handler.GenerateImage)
		r.Get("/rebuild-image-variants", handler.RebuildImageVariants)
	})
}

func RegisterDebugRoutes(router chi.Router, handler *DebugHandler) {
	if handler == nil {
		return
	}
	router.Route("/api/debug", func(r chi.Router) {
		r.Get("/ping", handler.Ping)
		r.Get("/catalogue-list", handler.ListCatalogueEntries)
		r.Get("/rate-limits", handler.CheckRateLimits)
		r.Get("/export-catalogue", handler.ExportCatalogue)
		r.Post("/import-catalogue", handler.ImportCatalogue)
	})
}

func (h *LabHandler) GenerateProduct(w http.ResponseWriter, r *http.Request) {
	description := strings.TrimSpace(r.URL.Query().Get("description"))
	catalogueID, err := optionalQueryInt64(r, "id")
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusBadRequest, "Invalid id query parameter")
		return
	}
	nextN, err := optionalQueryInt(r, "nextN")
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusBadRequest, "Invalid nextN query parameter")
		return
	}
	result, err := h.service.GenerateProduct(r.Context(), description, catalogueID, nextN, parseBoolQuery(r, "useKcals"), parseBoolQuery(r, "isToBeSaved"))
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusBadRequest, "Failed to generate product")
		return
	}
	legacy.WriteJSON(w, http.StatusOK, map[string]any{"result": true, "data": result.Data, "batchInfo": result.BatchInfo, "saved": result.Saved, "previousData": result.PreviousData})
}

func (h *LabHandler) GenerateEmbeddings(w http.ResponseWriter, r *http.Request) {
	count, err := requiredQueryInt(r, "count")
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusBadRequest, "Invalid count query parameter")
		return
	}
	result, err := h.service.GenerateEmbeddings(r.Context(), count)
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusBadRequest, "Failed to generate embeddings")
		return
	}
	legacy.WriteJSON(w, http.StatusOK, map[string]any{"result": true, "data": result.Data, "batchInfo": result.BatchInfo})
}

func (h *LabHandler) GenerateImage(w http.ResponseWriter, r *http.Request) {
	catalogueID, err := optionalQueryInt64(r, "id")
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusBadRequest, "Invalid id query parameter")
		return
	}
	nextN, err := optionalQueryInt(r, "nextN")
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusBadRequest, "Invalid nextN query parameter")
		return
	}
	if catalogueID == 0 && nextN == 0 {
		legacy.WriteResultError(w, http.StatusBadRequest, "Either id or nextN query parameter must be provided")
		return
	}
	result, err := h.service.GenerateImages(r.Context(), catalogueID, nextN)
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusBadRequest, "Failed to generate image")
		return
	}
	legacy.WriteJSON(w, http.StatusOK, map[string]any{"result": true, "data": result.Data, "batchInfo": result.BatchInfo})
}

func (h *LabHandler) RebuildImageVariants(w http.ResponseWriter, r *http.Request) {
	catalogueID, err := optionalQueryInt64(r, "id")
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusBadRequest, "Invalid id query parameter")
		return
	}
	nextN, err := optionalQueryInt(r, "nextN")
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusBadRequest, "Invalid nextN query parameter")
		return
	}
	if catalogueID == 0 && nextN == 0 {
		legacy.WriteResultError(w, http.StatusBadRequest, "Either id or nextN query parameter must be provided")
		return
	}
	result, err := h.service.RebuildImageVariants(r.Context(), catalogueID, nextN)
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusBadRequest, "Failed to rebuild image variants")
		return
	}
	legacy.WriteJSON(w, http.StatusOK, map[string]any{"result": true, "data": result.Data, "batchInfo": result.BatchInfo})
}

func (h *DebugHandler) Ping(w http.ResponseWriter, r *http.Request) {
	message, err := h.service.Ping(r.Context())
	if err != nil {
		legacy.WriteAppMessageError(w, err, http.StatusInternalServerError, "Internal server error")
		return
	}
	legacy.WriteJSON(w, http.StatusOK, map[string]any{"message": message})
}

func (h *DebugHandler) ListCatalogueEntries(w http.ResponseWriter, r *http.Request) {
	payload, err := h.service.ListCatalogueEntries(r.Context())
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusInternalServerError, "Internal server error")
		return
	}
	legacy.WriteJSON(w, http.StatusOK, payload)
}

func (h *DebugHandler) CheckRateLimits(w http.ResponseWriter, r *http.Request) {
	payload, err := h.service.CheckRateLimits(r.Context())
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusInternalServerError, "Internal server error")
		return
	}
	legacy.WriteJSON(w, http.StatusOK, payload)
}

func (h *DebugHandler) ExportCatalogue(w http.ResponseWriter, r *http.Request) {
	payload, err := h.service.ExportCatalogue(r.Context())
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusInternalServerError, "Internal server error")
		return
	}
	legacy.WriteJSON(w, http.StatusOK, payload)
}

func (h *DebugHandler) ImportCatalogue(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Filename string `json:"filename"`
	}
	if err := legacy.DecodeJSON(r, &request); err != nil {
		legacy.WriteAppResultError(w, err, http.StatusBadRequest, "Invalid request body")
		return
	}
	payload, err := h.service.ImportCatalogue(r.Context(), request.Filename)
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusInternalServerError, "Internal server error")
		return
	}
	legacy.WriteJSON(w, http.StatusOK, payload)
}

func optionalQueryInt64(r *http.Request, key string) (int64, error) {
	value := strings.TrimSpace(r.URL.Query().Get(key))
	if value == "" {
		return 0, nil
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed < 1 {
		return 0, legacy.NewError(legacy.ErrorKindValidation, "Invalid "+key+" query parameter")
	}
	return parsed, nil
}

func optionalQueryInt(r *http.Request, key string) (int, error) {
	value := strings.TrimSpace(r.URL.Query().Get(key))
	if value == "" {
		return 0, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 1 {
		return 0, legacy.NewError(legacy.ErrorKindValidation, "Invalid "+key+" query parameter")
	}
	return parsed, nil
}

func requiredQueryInt(r *http.Request, key string) (int, error) {
	value := strings.TrimSpace(r.URL.Query().Get(key))
	if value == "" {
		return 0, legacy.NewError(legacy.ErrorKindValidation, key+" query parameter is required")
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 1 {
		return 0, legacy.NewError(legacy.ErrorKindValidation, "Invalid "+key+" query parameter")
	}
	return parsed, nil
}

func parseBoolQuery(r *http.Request, key string) bool {
	value := strings.TrimSpace(strings.ToLower(r.URL.Query().Get(key)))
	return value == "1" || value == "true" || value == "yes"
}
