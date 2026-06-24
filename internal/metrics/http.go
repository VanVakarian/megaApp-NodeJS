package metrics

import (
	"bytes"
	"errors"
	"io"
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

type DebugHandler struct {
	service *Service
}

func NewDebugHandler(service *Service) *DebugHandler {
	return &DebugHandler{service: service}
}

func RegisterDebugRoutes(router chi.Router, handler *DebugHandler) {
	if handler == nil {
		return
	}
	router.Post("/api/debug/import-metrics-ndjson", handler.ImportNDJSON)
}

func (h *DebugHandler) ImportNDJSON(w http.ResponseWriter, r *http.Request) {
	data, err := extractUploadedNDJSON(r)
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusBadRequest, "Invalid ndjson upload")
		return
	}

	imported, err := h.service.ImportNDJSON(r.Context(), bytes.NewReader(data))
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusInternalServerError, "Failed to import metrics ndjson")
		return
	}
	legacy.WriteJSON(w, http.StatusOK, map[string]any{"result": true, "importedPoints": imported})
}

func extractUploadedNDJSON(r *http.Request) ([]byte, error) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			return nil, legacy.NewError(legacy.ErrorKindRequestTooLarge, "Request body is too large")
		}
		return nil, legacy.WrapError(legacy.ErrorKindValidation, "Invalid multipart form", err)
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}

	if r.MultipartForm == nil || len(r.MultipartForm.File["file"]) == 0 {
		return nil, legacy.NewError(legacy.ErrorKindValidation, "No file provided")
	}
	header := r.MultipartForm.File["file"][0]
	file, err := header.Open()
	if err != nil {
		return nil, legacy.WrapError(legacy.ErrorKindValidation, "Failed to open uploaded file", err)
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		return nil, legacy.WrapError(legacy.ErrorKindValidation, "Failed to read uploaded file", err)
	}
	if len(data) == 0 {
		return nil, legacy.NewError(legacy.ErrorKindValidation, "Uploaded file is empty")
	}
	return data, nil
}
