package food

import (
	clockplatform "megaapp-back/internal/platform/clock"
	"megaapp-back/internal/ws"
)

type RealtimePublisher interface {
	MarkUserUpdated(userID int64)
	PublishDiaryEntryCreated(userID int64, entry DiaryEntry, excludeClientID string)
	PublishDiaryEntryUpdated(userID int64, entry DiaryEntry, historyEntry HistoryEntry, excludeClientID string)
	PublishDiaryEntryDeleted(userID int64, diaryID int64, excludeClientID string)
	PublishDiaryDayDeleted(userID int64, dateISO string, excludeClientID string)
	PublishBodyWeightUpdated(userID int64, dateISO string, bodyWeight float64, excludeClientID string)
	PublishCatalogueEntrySaved(userID int64, entry CatalogueEntry, excludeClientID string)
	PublishCatalogueImageGenerated(catalogueID int64, imageVersion int64, excludeClientID string)
}

type WSRealtimePublisher struct {
	hub   *ws.Hub
	clock clockplatform.Clock
}

func NewWSRealtimePublisher(hub *ws.Hub, clk clockplatform.Clock) *WSRealtimePublisher {
	return &WSRealtimePublisher{hub: hub, clock: clk}
}

func (p *WSRealtimePublisher) MarkUserUpdated(userID int64) {
	p.hub.SetSyncState(userID, p.clock.Now().UnixMilli())
}

func (p *WSRealtimePublisher) PublishDiaryEntryCreated(userID int64, entry DiaryEntry, excludeClientID string) {
	p.hub.BroadcastToUser(userID, map[string]any{"type": "DIARY_ENTRY_CREATED", "payload": entry}, excludeClientID)
}

func (p *WSRealtimePublisher) PublishDiaryEntryUpdated(userID int64, entry DiaryEntry, historyEntry HistoryEntry, excludeClientID string) {
	p.hub.BroadcastToUser(userID, map[string]any{"type": "DIARY_ENTRY_UPDATED", "payload": map[string]any{"id": entry.ID, "newFoodWeight": entry.FoodWeight, "newKcals": entry.Kcals, "newHistoryEntry": historyEntry}}, excludeClientID)
}

func (p *WSRealtimePublisher) PublishDiaryEntryDeleted(userID int64, diaryID int64, excludeClientID string) {
	p.hub.BroadcastToUser(userID, map[string]any{"type": "DIARY_ENTRY_DELETED", "payload": map[string]any{"deletedDiaryEntryId": diaryID}}, excludeClientID)
}

func (p *WSRealtimePublisher) PublishDiaryDayDeleted(userID int64, dateISO string, excludeClientID string) {
	p.hub.BroadcastToUser(userID, map[string]any{"type": "DIARY_DAY_DELETED", "payload": map[string]any{"dateISO": dateISO}}, excludeClientID)
}

func (p *WSRealtimePublisher) PublishBodyWeightUpdated(userID int64, dateISO string, bodyWeight float64, excludeClientID string) {
	p.hub.BroadcastToUser(userID, map[string]any{"type": "BODY_WEIGHT_UPDATED", "payload": map[string]any{"dateISO": dateISO, "newBodyWeight": bodyWeight}}, excludeClientID)
}

func (p *WSRealtimePublisher) PublishCatalogueEntrySaved(userID int64, entry CatalogueEntry, excludeClientID string) {
	p.hub.BroadcastToAll(map[string]any{"type": "CATALOGUE_ENTRY_SAVED", "payload": entry}, excludeClientID)
}

func (p *WSRealtimePublisher) PublishCatalogueImageGenerated(catalogueID int64, imageVersion int64, excludeClientID string) {
	p.hub.BroadcastToAll(map[string]any{"type": "CATALOGUE_IMAGE_GENERATED", "payload": map[string]any{"catalogueId": catalogueID, "imageVersion": imageVersion}}, excludeClientID)
}
