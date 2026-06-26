package food

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"megaapp-back/internal/auth"
	"megaapp-back/internal/httpx/legacy"

	"github.com/go-chi/chi/v5"
)

const (
	MetricDiaryEntryCreated     = "food_diary_entry_created"
	MetricDiaryEntryUpdated     = "food_diary_entry_updated"
	MetricDiaryEntryDeleted     = "food_diary_entry_deleted"
	MetricDiaryDayDeleted       = "food_diary_day_deleted"
	MetricDiaryDayRestored      = "food_diary_day_restored"
	MetricBodyWeightUpdated     = "food_body_weight_updated"
	MetricCatalogueEntryCreated = "food_catalogue_entry_created"
	MetricCatalogueEntryUpdated = "food_catalogue_entry_updated"
	MetricCatalogueEntryDeleted = "food_catalogue_entry_deleted"
	MetricPersonalKcalJobRan    = "food_personal_kcal_job_ran"
)

type MetricsRecorder interface {
	Increment(name string)
}

type WriteHandler struct {
	service  *Service
	realtime RealtimePublisher
	metrics  MetricsRecorder
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

func NewWriteHandler(service *Service, realtime RealtimePublisher, metricsRecorder MetricsRecorder) *WriteHandler {
	return &WriteHandler{service: service, realtime: realtime, metrics: metricsRecorder}
}

func (h *WriteHandler) recordMetric(name string) {
	h.metrics.Increment(name)
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
		legacy.WriteMessage(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var request createDiaryEntryRequest
	if err := legacy.DecodeJSON(r, &request); err != nil {
		legacy.WriteAppResultError(w, err, http.StatusBadRequest, "Invalid request body")
		return
	}

	entry, err := h.service.CreateDiaryEntry(r.Context(), claims.UserID, request.DateISO, request.FoodCatalogueID, request.FoodWeight, request.History)
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusInternalServerError, "Internal server error")
		return
	}

	h.realtime.MarkUserUpdated(claims.UserID)
	h.realtime.PublishDiaryEntryCreated(claims.UserID, entry, extractClientID(r))
	h.recordMetric(MetricDiaryEntryCreated)
	legacy.WriteJSON(w, http.StatusCreated, map[string]any{"result": true, "diaryId": entry.ID, "kcals": entry.Kcals})
}

func (h *WriteHandler) EditDiaryEntry(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.UserClaimsFromContext(r.Context())
	if !ok {
		legacy.WriteMessage(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var request editDiaryEntryRequest
	if err := legacy.DecodeJSON(r, &request); err != nil {
		legacy.WriteAppResultError(w, err, http.StatusBadRequest, "Invalid request body")
		return
	}
	if len(request.History) == 0 {
		legacy.WriteResultError(w, http.StatusBadRequest, "History is required")
		return
	}

	updatedEntry, err := h.service.EditDiaryEntry(r.Context(), claims.UserID, request.ID, request.FoodWeight, request.History[0])
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusInternalServerError, "Internal server error")
		return
	}
	if updatedEntry == nil {
		legacy.WriteResultError(w, http.StatusBadRequest, "Diary entry not found")
		return
	}

	h.realtime.MarkUserUpdated(claims.UserID)
	h.realtime.PublishDiaryEntryUpdated(claims.UserID, *updatedEntry, request.History[0], extractClientID(r))
	h.recordMetric(MetricDiaryEntryUpdated)
	legacy.WriteJSON(w, http.StatusOK, map[string]any{"result": true, "diaryId": updatedEntry.ID, "kcals": updatedEntry.Kcals})
}

func (h *WriteHandler) DeleteDiaryEntry(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.UserClaimsFromContext(r.Context())
	if !ok {
		legacy.WriteMessage(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	diaryID, err := strconv.ParseInt(chi.URLParam(r, "diaryId"), 10, 64)
	if err != nil {
		legacy.WriteResultError(w, http.StatusBadRequest, "Invalid diaryId")
		return
	}

	deleted, err := h.service.DeleteDiaryEntry(r.Context(), claims.UserID, diaryID)
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusInternalServerError, "Internal server error")
		return
	}
	if !deleted {
		legacy.WriteResultError(w, http.StatusNotFound, "Entry not found")
		return
	}

	h.realtime.MarkUserUpdated(claims.UserID)
	h.realtime.PublishDiaryEntryDeleted(claims.UserID, diaryID, extractClientID(r))
	h.recordMetric(MetricDiaryEntryDeleted)
	legacy.WriteJSON(w, http.StatusOK, map[string]any{"result": true})
}

func (h *WriteHandler) DeleteDiaryEntriesForDay(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.UserClaimsFromContext(r.Context())
	if !ok {
		legacy.WriteMessage(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	dateISO := chi.URLParam(r, "dateISO")
	deletedCount, err := h.service.DeleteDiaryEntriesForDay(r.Context(), claims.UserID, dateISO)
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusInternalServerError, "Internal server error")
		return
	}

	h.realtime.MarkUserUpdated(claims.UserID)
	h.realtime.PublishDiaryDayDeleted(claims.UserID, dateISO, extractClientID(r))
	h.recordMetric(MetricDiaryDayDeleted)
	legacy.WriteJSON(w, http.StatusOK, map[string]any{"result": true, "deletedEntriesCount": deletedCount})
}

func (h *WriteHandler) RestoreDiaryEntriesForDay(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.UserClaimsFromContext(r.Context())
	if !ok {
		legacy.WriteMessage(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	dateISO := chi.URLParam(r, "dateISO")
	var request restoreDiaryDayRequest
	if err := legacy.DecodeJSON(r, &request); err != nil {
		legacy.WriteAppResultError(w, err, http.StatusBadRequest, "Invalid request body")
		return
	}

	inputs := make([]RestoreDiaryEntryInput, 0, len(request.Entries))
	for _, entry := range request.Entries {
		inputs = append(inputs, RestoreDiaryEntryInput{
			FoodCatalogueID: entry.FoodCatalogueID,
			FoodWeight:      entry.FoodWeight,
			History:         entry.History,
		})
	}

	entries, err := h.service.RestoreDiaryEntriesForDay(r.Context(), claims.UserID, dateISO, inputs)
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusInternalServerError, "Internal server error")
		return
	}

	h.realtime.MarkUserUpdated(claims.UserID)
	clientID := extractClientID(r)
	for _, entry := range entries {
		h.realtime.PublishDiaryEntryCreated(claims.UserID, entry, clientID)
	}
	h.recordMetric(MetricDiaryDayRestored)
	legacy.WriteJSON(w, http.StatusCreated, map[string]any{"result": true, "diaryEntries": entries})
}

func (h *WriteHandler) ProcessWeight(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.UserClaimsFromContext(r.Context())
	if !ok {
		legacy.WriteMessage(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var request bodyWeightRequest
	if err := legacy.DecodeJSON(r, &request); err != nil {
		legacy.WriteAppResultError(w, err, http.StatusBadRequest, "Invalid request body")
		return
	}

	bodyWeight, err := parseBodyWeight(request.BodyWeight)
	if err != nil {
		legacy.WriteResultError(w, http.StatusBadRequest, "Invalid weight value")
		return
	}

	okResult, err := h.service.SetBodyWeight(r.Context(), claims.UserID, request.DateISO, bodyWeight)
	if err != nil {
		legacy.WriteAppResultError(w, err, http.StatusInternalServerError, "Internal server error")
		return
	}
	if !okResult {
		legacy.WriteResultError(w, http.StatusBadRequest, "Weight not saved")
		return
	}

	h.realtime.MarkUserUpdated(claims.UserID)
	h.realtime.PublishBodyWeightUpdated(claims.UserID, request.DateISO, bodyWeight, extractClientID(r))
	h.recordMetric(MetricBodyWeightUpdated)
	legacy.WriteJSON(w, http.StatusCreated, map[string]any{"result": true})
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

func extractClientID(r *http.Request) string {
	clientID := strings.TrimSpace(r.Header.Get("X-Client-ID"))
	if clientID == "" {
		clientID = strings.TrimSpace(r.Header.Get("X-Client-Id"))
	}
	return clientID
}

func writeFoodResultError(w http.ResponseWriter, statusCode int, message string) {
	legacy.WriteResultError(w, statusCode, message)
}
