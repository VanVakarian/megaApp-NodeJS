package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

type contextKey string

const userClaimsContextKey contextKey = "auth_user_claims"

type Handler struct {
	service *Service
}

type credentialsRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type refreshRequest struct {
	RefreshToken string `json:"refreshToken"`
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func RegisterRoutes(router chi.Router, handler *Handler) {
	router.Route("/api/auth", func(r chi.Router) {
		r.Post("/register", handler.Register)
		r.Post("/login", handler.Login)
		r.Post("/refresh", handler.Refresh)
	})
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var request credentialsRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	_, err := h.service.Register(r.Context(), request.Username, request.Password)
	if err != nil {
		switch {
		case errors.Is(err, ErrUsernameTaken):
			writeDetailError(w, http.StatusBadRequest, err.Error())
		case errors.Is(err, ErrInvalidPayload):
			writeDetailError(w, http.StatusBadRequest, "Username and password are required")
		default:
			writeDetailError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{"message": "User created successfully"})
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var request credentialsRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	response, err := h.service.Login(r.Context(), request.Username, request.Password)
	if err != nil {
		if errors.Is(err, ErrInvalidCreds) {
			writeDetailError(w, http.StatusUnauthorized, err.Error())
			return
		}
		writeDetailError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, response)
}

func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	var request refreshRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	response, err := h.service.Refresh(r.Context(), request.RefreshToken)
	if err != nil {
		if errors.Is(err, ErrInvalidToken) {
			writeDetailError(w, http.StatusUnauthorized, err.Error())
			return
		}
		writeDetailError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, response)
}

func Middleware(service *Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authorizationHeader := strings.TrimSpace(r.Header.Get("Authorization"))
			if authorizationHeader == "" {
				writeDetailError(w, http.StatusUnauthorized, "Invalid token")
				return
			}

			parts := strings.SplitN(authorizationHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || strings.TrimSpace(parts[1]) == "" {
				writeDetailError(w, http.StatusUnauthorized, "Invalid token")
				return
			}

			claims, err := service.Verify(strings.TrimSpace(parts[1]))
			if err != nil {
				writeDetailError(w, http.StatusUnauthorized, "Invalid token")
				return
			}

			ctx := context.WithValue(r.Context(), userClaimsContextKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func UserClaimsFromContext(ctx context.Context) (TokenClaims, bool) {
	claims, ok := ctx.Value(userClaimsContextKey).(TokenClaims)
	return claims, ok
}

func writeJSON(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, statusCode int, message string) {
	writeJSON(w, statusCode, map[string]string{"message": message})
}

func writeDetailError(w http.ResponseWriter, statusCode int, detail string) {
	writeJSON(w, statusCode, map[string]string{"detail": detail})
}

func AccessTokenTTL() time.Duration {
	return 24 * time.Hour
}

func RefreshTokenTTL() time.Duration {
	return 31 * 24 * time.Hour
}
