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

type WriteHandler struct {
	service *Service
	hub     *ws.Hub
}

type createDiaryEntryRequest struct {
	DateISO         string         `json:"dateISO"`
	FoodCatalogueID int64          `json:"foodCatalogueId"`
	FoodWeight      int64          `json:"foodWeight"`
	History         []HistoryEntry `json:"history"`
}

type editDiaryEntryRequest struct {
	ID              int64          `json:"id"`
	FoodCatalogueID int64          `json:"foodCatalogueId"`
	FoodWeight      int64          `json:"foodWeight"`
	History         []HistoryEntry `json:"history"`
}

type restoreDiaryDayRequest struct {
	Entries []createDiaryEntryRequest `json:"entries"`
}

type bodyWeightRequest struct {
	DateISO    string          `json:"dateISO"`
	BodyWeight json.RawMessage `json:"bodyWeight"`
}

func NewWriteHandler(service *Service, hub *ws.Hub) *WriteHandler {
	return &WriteHandler{service: service, hub: hub}
}

func RegisterWriteRoutes(router chi.Router, authService *auth.Service, handler *WriteHandler) {
	router.With(auth.Middleware(authService)).Post("/api/food/diary/", handler.CreateDiaryEntry)
	router.With(auth.Middleware(authService)).Put("/api/food/diary", handler.EditDiaryEntry)
	router.With(auth.Middleware(authService)).Delete("/api/food/diary/{diaryId}", handler.DeleteDiaryEntry)
	router.With(auth.Middleware(authService)).Delete("/api/food/diary/day/{dateISO}", handler.DeleteDiaryEntriesForDay)
	router.With(auth.Middleware(authService)).Post("/api/food/diary/day/{dateISO}/restore", handler.RestoreDiaryEntriesForDay)
	router.With(auth.Middleware(authService)).Post("/api/food/body-weight", handler.ProcessWeight)
}

func (h *WriteHandler) CreateDiaryEntry(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.UserClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
		return
	}

	var request createDiaryEntryRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeFoodResultError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	entry, err := h.service.CreateDiaryEntry(r.Context(), claims.UserID, request.DateISO, request.FoodCatalogueID, request.FoodWeight, request.History)
	if err != nil {
		writeFoodResultError(w, http.StatusInternalServerError, "Internal server error")
		return
	}

	h.markUserUpdated(claims.UserID)
	h.hub.BroadcastToUser(claims.UserID, map[string]any{"type": "DIARY_ENTRY_CREATED", "payload": entry}, extractClientID(r))
	writeJSON(w, http.StatusCreated, map[string]any{"result": true, "diaryId": entry.ID})
}

func (h *WriteHandler) EditDiaryEntry(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.UserClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
		return
	}

	var request editDiaryEntryRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeFoodResultError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if len(request.History) == 0 {
		writeFoodResultError(w, http.StatusBadRequest, "History is required")
		return
	}

	updatedEntry, err := h.service.EditDiaryEntry(r.Context(), claims.UserID, request.ID, request.FoodWeight, request.History[0])
	if err != nil {
		writeFoodResultError(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	if updatedEntry == nil {
		writeFoodResultError(w, http.StatusBadRequest, "Diary entry not found")
		return
	}

	h.markUserUpdated(claims.UserID)
	h.hub.BroadcastToUser(claims.UserID, map[string]any{"type": "DIARY_ENTRY_UPDATED", "payload": map[string]any{"id": updatedEntry.ID, "newFoodWeight": updatedEntry.FoodWeight, "newHistoryEntry": request.History[0]}}, extractClientID(r))
	writeJSON(w, http.StatusOK, map[string]any{"result": true, "diaryId": updatedEntry.ID})
}

func (h *WriteHandler) DeleteDiaryEntry(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.UserClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
		return
	}

	diaryID, err := strconv.ParseInt(chi.URLParam(r, "diaryId"), 10, 64)
	if err != nil {
		writeFoodResultError(w, http.StatusBadRequest, "Invalid diaryId")
		return
	}

	deleted, err := h.service.DeleteDiaryEntry(r.Context(), claims.UserID, diaryID)
	if err != nil {
		writeFoodResultError(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	if !deleted {
		writeFoodResultError(w, http.StatusNotFound, "Entry not found")
		return
	}

	h.markUserUpdated(claims.UserID)
	h.hub.BroadcastToUser(claims.UserID, map[string]any{"type": "DIARY_ENTRY_DELETED", "payload": map[string]any{"deletedDiaryEntryId": diaryID}}, extractClientID(r))
	writeJSON(w, http.StatusOK, map[string]any{"result": true})
}

func (h *WriteHandler) DeleteDiaryEntriesForDay(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.UserClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
		return
	}

	dateISO := chi.URLParam(r, "dateISO")
	deletedCount, err := h.service.DeleteDiaryEntriesForDay(r.Context(), claims.UserID, dateISO)
	if err != nil {
		if strings.Contains(err.Error(), "entries not found") {
			writeFoodResultError(w, http.StatusNotFound, "Entries not found")
			return
		}
		writeFoodResultError(w, http.StatusInternalServerError, "Internal server error")
		return
	}

	h.markUserUpdated(claims.UserID)
	h.hub.BroadcastToUser(claims.UserID, map[string]any{"type": "DIARY_DAY_DELETED", "payload": map[string]any{"dateISO": dateISO}}, extractClientID(r))
	writeJSON(w, http.StatusOK, map[string]any{"result": true, "deletedEntriesCount": deletedCount})
}

func (h *WriteHandler) RestoreDiaryEntriesForDay(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.UserClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
		return
	}

	dateISO := chi.URLParam(r, "dateISO")
	var request restoreDiaryDayRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeFoodResultError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	entries, err := h.service.RestoreDiaryEntriesForDay(r.Context(), claims.UserID, dateISO, request.Entries)
	if err != nil {
		if strings.Contains(err.Error(), "entries not found") {
			writeFoodResultError(w, http.StatusBadRequest, "Entries not found")
			return
		}
		writeFoodResultError(w, http.StatusInternalServerError, "Internal server error")
		return
	}

	h.markUserUpdated(claims.UserID)
	clientID := extractClientID(r)
	for _, entry := range entries {
		h.hub.BroadcastToUser(claims.UserID, map[string]any{"type": "DIARY_ENTRY_CREATED", "payload": entry}, clientID)
	}
	writeJSON(w, http.StatusCreated, map[string]any{"result": true, "diaryEntries": entries})
}

func (h *WriteHandler) ProcessWeight(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.UserClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
		return
	}

	var request bodyWeightRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeFoodResultError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	bodyWeight, err := parseBodyWeight(request.BodyWeight)
	if err != nil {
		writeFoodResultError(w, http.StatusBadRequest, "Invalid weight value")
		return
	}

	okResult, err := h.service.SetBodyWeight(r.Context(), claims.UserID, request.DateISO, bodyWeight)
	if err != nil {
		writeFoodResultError(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	if !okResult {
		writeFoodResultError(w, http.StatusBadRequest, "Weight not saved")
		return
	}

	h.markUserUpdated(claims.UserID)
	h.hub.BroadcastToUser(claims.UserID, map[string]any{"type": "BODY_WEIGHT_UPDATED", "payload": map[string]any{"dateISO": request.DateISO, "newBodyWeight": bodyWeight}}, extractClientID(r))
	writeJSON(w, http.StatusCreated, map[string]any{"result": true})
}

func parseBodyWeight(raw json.RawMessage) (float64, error) {
	var weight float64
	if err := json.Unmarshal(raw, &weight); err == nil {
		return weight, nil
	}

	var weightString string
	if err := json.Unmarshal(raw, &weightString); err != nil {
		return 0, err
	}

	parsedWeight, err := strconv.ParseFloat(strings.TrimSpace(weightString), 64)
	if err != nil {
		return 0, err
	}

	return parsedWeight, nil
}

func (h *WriteHandler) markUserUpdated(userID int64) {
	h.hub.SetSyncState(userID, time.Now().UnixMilli())
}

func extractClientID(r *http.Request) string {
	clientID := strings.TrimSpace(r.Header.Get("X-Client-ID"))
	if clientID == "" {
		clientID = strings.TrimSpace(r.Header.Get("X-Client-Id"))
	}
	return clientID
}

func writeFoodResultError(w http.ResponseWriter, statusCode int, message string) {
	writeJSON(w, statusCode, map[string]any{"result": false, "error": message})
}
