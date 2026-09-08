package metrics

import (
	"sync"

	"megaapp-back/internal/ws"
)

type ServiceLatest struct {
	Service    string             `json:"service"`
	LastBucket int64              `json:"lastBucket"`
	Metrics    map[string]float64 `json:"metrics"`
}

type LatestSnapshot struct {
	Services []ServiceLatest `json:"services"`
}

type DetailUpdate struct {
	Points []MetricPoint `json:"points"`
}

type Realtime struct {
	hub *ws.Hub

	mu          sync.Mutex
	subscribers map[*ws.Client]map[scopeKey]struct{}
}

func NewRealtime(hub *ws.Hub) *Realtime {
	return &Realtime{hub: hub, subscribers: make(map[*ws.Client]map[scopeKey]struct{})}
}

func (r *Realtime) BroadcastLatest(adminUserIDs []int64, snapshot LatestSnapshot) {
	message := map[string]any{"type": "METRICS_LATEST", "payload": snapshot}
	for _, userID := range adminUserIDs {
		r.hub.BroadcastToUser(userID, message, "")
	}
}

// BroadcastDetail filters update.Points to each subscriber's own scope
// before sending — a client whose scope matches none of the points gets
// nothing on this tick, not an empty message.
func (r *Realtime) BroadcastDetail(update DetailUpdate) {
	for client, scope := range r.subscriberSnapshot() {
		points := filterPointsByScope(update.Points, scope)
		if len(points) == 0 {
			continue
		}
		message := map[string]any{"type": "METRICS_UPDATE", "payload": DetailUpdate{Points: points}}
		if err := client.SendJSON(message); err != nil {
			r.Unsubscribe(client)
		}
	}
}

func filterPointsByScope(points []MetricPoint, scope map[scopeKey]struct{}) []MetricPoint {
	filtered := make([]MetricPoint, 0, len(points))
	for _, point := range points {
		if _, inScope := scope[scopeKey{service: point.Service, metricName: point.Name}]; inScope {
			filtered = append(filtered, point)
		}
	}
	return filtered
}

// Subscribe replaces the client's scope entirely — it does not merge with
// whatever the client subscribed to before. A resubscribe always reflects
// what's on screen right now (e.g. after switching dashboard panels), never
// the union of everything a client has ever looked at this session.
func (r *Realtime) Subscribe(client *ws.Client, scope map[scopeKey]struct{}) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.subscribers[client] = scope
}

func (r *Realtime) Unsubscribe(client *ws.Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.subscribers, client)
}

func (r *Realtime) subscriberSnapshot() map[*ws.Client]map[scopeKey]struct{} {
	r.mu.Lock()
	defer r.mu.Unlock()

	snapshot := make(map[*ws.Client]map[scopeKey]struct{}, len(r.subscribers))
	for client, scope := range r.subscribers {
		snapshot[client] = scope
	}
	return snapshot
}
