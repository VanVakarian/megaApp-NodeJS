package backup

import (
	"net/http"

	"megaapp-back/internal/httpx/legacy"

	"github.com/go-chi/chi/v5"
)

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
	router.Get("/api/debug/run-backup-job", handler.RunBackupJob)
}

func (h *DebugHandler) RunBackupJob(w http.ResponseWriter, r *http.Request) {
	result, err := h.service.Run(r.Context())
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusInternalServerError, "Failed to run backup job")
		return
	}
	legacy.WriteJSON(w, http.StatusOK, map[string]any{
		"result":           true,
		"uploadedKey":      result.UploadedKey,
		"snapshotFileName": result.SnapshotFileName,
		"archiveFileName":  result.ArchiveFileName,
		"cleanedUp":        result.CleanedUp,
	})
}
