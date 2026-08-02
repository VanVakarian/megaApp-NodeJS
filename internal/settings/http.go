package settings

import (
	"encoding/json"
	"errors"
	"net/http"

	"megaapp-back/internal/auth"
	"megaapp-back/internal/httpx/legacy"

	"github.com/go-chi/chi/v5"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func RegisterRoutes(router chi.Router, authService *auth.Service, handler *Handler) {
	router.Route("/api/settings", func(r chi.Router) {
		r.Use(auth.Middleware(authService))
		r.Get("/", handler.Get)
		r.Post("/", handler.Post)
		r.Put("/", handler.Put)
	})

	router.Route("/api/metrics-settings", func(r chi.Router) {
		r.Use(auth.Middleware(authService))
		r.Get("/", handler.GetMetricsSettings)
		r.Put("/", handler.PutMetricsSettings)
	})
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.UserClaimsFromContext(r.Context())
	if !ok {
		legacy.WriteMessage(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	response, err := h.service.Get(r.Context(), claims.UserID, claims.Username)
	if err != nil {
		legacy.WriteAppMessageError(w, err, http.StatusInternalServerError, "Internal server error")
		return
	}

	legacy.WriteJSON(w, http.StatusOK, response)
}

func (h *Handler) Post(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.UserClaimsFromContext(r.Context())
	if !ok {
		legacy.WriteMessage(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var request UserSettings
	if err := legacy.DecodeJSON(r, &request); err != nil {
		legacy.WriteAppMessageError(w, err, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := h.service.Post(r.Context(), claims.UserID, request); err != nil {
		legacy.WriteAppMessageError(w, err, http.StatusInternalServerError, "Internal server error")
		return
	}

	legacy.WriteMessage(w, http.StatusOK, "Settings saved successfully")
}

func (h *Handler) Put(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.UserClaimsFromContext(r.Context())
	if !ok {
		legacy.WriteMessage(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var request map[string]any
	if err := legacy.DecodeJSON(r, &request); err != nil {
		legacy.WriteAppMessageError(w, err, http.StatusBadRequest, "Invalid request body")
		return
	}

	operationID, _ := request["operationId"].(string)
	delete(request, "operationId")
	if operationID == "" {
		legacy.WriteMessage(w, http.StatusBadRequest, "operationId is required")
		return
	}

	input, err := ParseUpdateInput(request)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidSetting), errors.Is(err, ErrInvalidSettingPayload):
			legacy.WriteAppMessageError(w, err, http.StatusBadRequest, err.Error())
		default:
			legacy.WriteAppMessageError(w, err, http.StatusBadRequest, "Invalid request body")
		}
		return
	}

	if _, err := h.service.Put(r.Context(), claims.UserID, operationID, input); err != nil {
		switch {
		case errors.Is(err, ErrInvalidSetting), errors.Is(err, ErrInvalidSettingPayload):
			legacy.WriteAppMessageError(w, err, http.StatusBadRequest, err.Error())
		default:
			legacy.WriteAppMessageError(w, err, http.StatusInternalServerError, "Internal server error")
		}
		return
	}

	legacy.WriteMessage(w, http.StatusOK, "Setting updated successfully")
}

func (h *Handler) GetMetricsSettings(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.UserClaimsFromContext(r.Context())
	if !ok {
		legacy.WriteMessage(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	response, err := h.service.GetMetricsSettings(r.Context(), claims.UserID)
	if err != nil {
		legacy.WriteAppMessageError(w, err, http.StatusInternalServerError, "Internal server error")
		return
	}

	legacy.WriteJSON(w, http.StatusOK, response)
}

func (h *Handler) PutMetricsSettings(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.UserClaimsFromContext(r.Context())
	if !ok {
		legacy.WriteMessage(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var request json.RawMessage
	if err := legacy.DecodeJSON(r, &request); err != nil {
		legacy.WriteAppMessageError(w, err, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := h.service.PutMetricsSettings(r.Context(), claims.UserID, request); err != nil {
		legacy.WriteAppMessageError(w, err, http.StatusInternalServerError, "Internal server error")
		return
	}

	legacy.WriteMessage(w, http.StatusOK, "Metrics settings saved successfully")
}

func writeJSON(w http.ResponseWriter, statusCode int, payload any) {
	legacy.WriteJSON(w, statusCode, payload)
}

func writeMessage(w http.ResponseWriter, statusCode int, message string) {
	legacy.WriteMessage(w, statusCode, message)
}
