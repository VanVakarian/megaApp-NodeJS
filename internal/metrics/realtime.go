package metrics

import (
	"sync"

	"megaapp-back/internal/ws"
)

type HealthStatus struct {
	Severity string `json:"severity"`
}

type DetailUpdate struct {
	Points []MetricPoint `json:"points"`
}

type Realtime struct {
	hub *ws.Hub

	mu          sync.Mutex
	subscribers map[*ws.Client]struct{}
}

func NewRealtime(hub *ws.Hub) *Realtime {
	return &Realtime{hub: hub, subscribers: make(map[*ws.Client]struct{})}
}

func (r *Realtime) BroadcastHealth(adminUserIDs []int64, status HealthStatus) {
	message := map[string]any{"type": "METRICS_HEALTH", "payload": status}
	for _, userID := range adminUserIDs {
		r.hub.BroadcastToUser(userID, message, "")
	}
}

func (r *Realtime) BroadcastDetail(update DetailUpdate) {
	message := map[string]any{"type": "METRICS_UPDATE", "payload": update}
	for _, client := range r.subscriberList() {
		if err := client.SendJSON(message); err != nil {
			r.Unsubscribe(client)
		}
	}
}

func (r *Realtime) Subscribe(client *ws.Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.subscribers[client] = struct{}{}
}

func (r *Realtime) Unsubscribe(client *ws.Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.subscribers, client)
}

func (r *Realtime) subscriberList() []*ws.Client {
	r.mu.Lock()
	defer r.mu.Unlock()

	clients := make([]*ws.Client, 0, len(r.subscribers))
	for client := range r.subscribers {
		clients = append(clients, client)
	}
	return clients
}
