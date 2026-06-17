package ws

import (
	"net/http"
	"strings"
	"time"

	"megaapp-back/internal/auth"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
)

type Handler struct {
	authService *auth.Service
	hub         *Hub
	upgrader    websocket.Upgrader
}

func NewHandler(authService *auth.Service, hub *Hub) *Handler {
	return &Handler{
		authService: authService,
		hub:         hub,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
	}
}

func RegisterRoutes(router chi.Router, handler *Handler) {
	router.Get("/api/ws", handler.Connect)
}

func (h *Handler) Connect(w http.ResponseWriter, r *http.Request) {
	token := extractToken(r)
	if token == "" {
		writeError(w, http.StatusUnauthorized, "Token required")
		return
	}

	claims, err := h.authService.Verify(token)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Invalid token")
		return
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	clientID := strings.TrimSpace(r.URL.Query().Get("clientId"))
	if clientID == "" {
		clientID = strings.TrimSpace(r.Header.Get("X-Client-Id"))
	}

	_ = conn.SetReadDeadline(time.Time{})
	if _, err := h.hub.AddClient(conn, claims.UserID, clientID); err != nil {
		_ = conn.Close()
	}
}

func extractToken(r *http.Request) string {
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if token != "" {
		return token
	}

	authorizationHeader := strings.TrimSpace(r.Header.Get("Authorization"))
	parts := strings.SplitN(authorizationHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}

	return strings.TrimSpace(parts[1])
}

func writeError(w http.ResponseWriter, statusCode int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_, _ = w.Write([]byte(`{"error":"` + message + `"}`))
}
