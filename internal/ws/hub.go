package ws

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type MessageHandler func(*Client, map[string]any) error

type Hub struct {
	mu                 sync.RWMutex
	clientsByUserID    map[int64]map[*Client]struct{}
	clientsBySessionID map[string]map[*Client]struct{}
	handlers           map[string]MessageHandler
	disconnectHandlers []func(*Client)
	syncState          *SyncState
	heartbeatInterval  time.Duration
	readLimitBytes     int64
	writeTimeout       time.Duration
	done               chan struct{}
	closed             bool
}

type Client struct {
	hub       *Hub
	conn      *websocket.Conn
	userID    int64
	clientID  string
	sessionID string
	expiresAt time.Time

	mu    sync.Mutex
	alive bool
}

type syncStatusMessage struct {
	Type    string                `json:"type"`
	Payload syncStatusMessageBody `json:"payload"`
}

type syncStatusMessageBody struct {
	UserDataLastModifiedTs int64 `json:"userDataLastModifiedTs"`
}

type pingMessage struct {
	Type string `json:"type"`
}

func NewHub(heartbeatInterval time.Duration, syncState *SyncState) *Hub {
	if syncState == nil {
		syncState = NewSyncState()
	}

	h := &Hub{
		clientsByUserID:    make(map[int64]map[*Client]struct{}),
		clientsBySessionID: make(map[string]map[*Client]struct{}),
		handlers:           make(map[string]MessageHandler),
		syncState:          syncState,
		heartbeatInterval:  heartbeatInterval,
		readLimitBytes:     64 << 10,
		writeTimeout:       5 * time.Second,
		done:               make(chan struct{}),
	}

	go h.runHeartbeat()

	return h
}

func (h *Hub) RegisterHandler(messageType string, handler MessageHandler) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.handlers[messageType] = handler
}

func (h *Hub) RegisterDisconnectHandler(handler func(*Client)) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.disconnectHandlers = append(h.disconnectHandlers, handler)
}

func (h *Hub) SetReadLimitBytes(limit int64) {
	if limit <= 0 {
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	h.readLimitBytes = limit
}

func (h *Hub) SetWriteTimeout(timeout time.Duration) {
	if timeout <= 0 {
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	h.writeTimeout = timeout
}

func (h *Hub) AddClient(conn *websocket.Conn, userID int64, sessionID string, expiresAt time.Time, clientID string) (*Client, error) {
	conn.SetReadLimit(h.ReadLimitBytes())
	client := &Client{hub: h, conn: conn, userID: userID, sessionID: sessionID, expiresAt: expiresAt, clientID: clientID, alive: true}
	client.extendReadDeadline()

	h.mu.Lock()
	if h.clientsByUserID[userID] == nil {
		h.clientsByUserID[userID] = make(map[*Client]struct{})
	}
	h.clientsByUserID[userID][client] = struct{}{}
	if h.clientsBySessionID[sessionID] == nil {
		h.clientsBySessionID[sessionID] = make(map[*Client]struct{})
	}
	h.clientsBySessionID[sessionID][client] = struct{}{}
	h.mu.Unlock()

	if err := client.writeJSON(syncStatusMessage{
		Type: "SYNC_STATUS",
		Payload: syncStatusMessageBody{
			UserDataLastModifiedTs: h.syncState.Get(userID),
		},
	}); err != nil {
		h.RemoveClient(client)
		return nil, err
	}

	go client.readLoop()

	return client, nil
}

func (h *Hub) RemoveClient(client *Client) {
	h.mu.Lock()

	clients := h.clientsByUserID[client.userID]
	if clients == nil {
		h.mu.Unlock()
		return
	}

	if _, ok := clients[client]; !ok {
		h.mu.Unlock()
		return
	}

	delete(clients, client)
	if len(clients) == 0 {
		delete(h.clientsByUserID, client.userID)
	}
	sessionClients := h.clientsBySessionID[client.sessionID]
	delete(sessionClients, client)
	if len(sessionClients) == 0 {
		delete(h.clientsBySessionID, client.sessionID)
	}
	handlers := append([]func(*Client){}, h.disconnectHandlers...)
	h.mu.Unlock()

	_ = client.close()
	for _, handler := range handlers {
		handler(client)
	}
}

func (h *Hub) CloseSession(sessionID string, code int, reason string) {
	h.mu.RLock()
	clients := make([]*Client, 0, len(h.clientsBySessionID[sessionID]))
	for client := range h.clientsBySessionID[sessionID] {
		clients = append(clients, client)
	}
	h.mu.RUnlock()
	for _, client := range clients {
		_ = client.closeWithCode(code, reason)
		h.RemoveClient(client)
	}
}

func (h *Hub) BroadcastToUser(userID int64, payload any, excludeClientID string) {
	for _, client := range h.userClients(userID) {
		if excludeClientID != "" && client.clientID == excludeClientID {
			continue
		}
		if err := client.writeJSON(payload); err != nil {
			h.RemoveClient(client)
		}
	}
}

func (h *Hub) BroadcastToAll(payload any, excludeClientID string) {
	for _, client := range h.allClients() {
		if excludeClientID != "" && client.clientID == excludeClientID {
			continue
		}
		if err := client.writeJSON(payload); err != nil {
			h.RemoveClient(client)
		}
	}
}

func (h *Hub) Close() error {
	h.mu.Lock()
	if h.closed {
		h.mu.Unlock()
		return nil
	}
	h.closed = true
	close(h.done)

	var clients []*Client
	for _, perUser := range h.clientsByUserID {
		for client := range perUser {
			clients = append(clients, client)
		}
	}
	h.clientsByUserID = make(map[int64]map[*Client]struct{})
	h.clientsBySessionID = make(map[string]map[*Client]struct{})
	handlers := append([]func(*Client){}, h.disconnectHandlers...)
	h.mu.Unlock()

	for _, client := range clients {
		_ = client.closeWithCode(websocket.CloseGoingAway, "Server shutdown")
		for _, handler := range handlers {
			handler(client)
		}
	}

	return nil
}

func (h *Hub) ConnectionCount(userID int64) int {
	h.mu.RLock()
	defer h.mu.RUnlock()

	return len(h.clientsByUserID[userID])
}

func (h *Hub) ReadLimitBytes() int64 {
	h.mu.RLock()
	defer h.mu.RUnlock()

	return h.readLimitBytes
}

func (h *Hub) WriteTimeout() time.Duration {
	h.mu.RLock()
	defer h.mu.RUnlock()

	return h.writeTimeout
}

func (h *Hub) SetSyncState(userID int64, value int64) {
	h.syncState.Set(userID, value)
}

func (h *Hub) SyncState(userID int64) int64 {
	return h.syncState.Get(userID)
}

func (h *Hub) runHeartbeat() {
	ticker := time.NewTicker(h.heartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			for _, client := range h.allClients() {
				if !client.expiresAt.After(time.Now()) {
					h.CloseSession(client.sessionID, 4002, "Session expired")
					continue
				}
				if !client.markAwaitingPong() {
					h.RemoveClient(client)
					continue
				}
				if err := client.writeJSON(pingMessage{Type: "PING"}); err != nil {
					h.RemoveClient(client)
				}
			}
		case <-h.done:
			return
		}
	}
}

func (h *Hub) allClients() []*Client {
	h.mu.RLock()
	defer h.mu.RUnlock()

	clients := make([]*Client, 0)
	for _, perUser := range h.clientsByUserID {
		for client := range perUser {
			clients = append(clients, client)
		}
	}

	return clients
}

func (h *Hub) userClients(userID int64) []*Client {
	h.mu.RLock()
	defer h.mu.RUnlock()

	perUser := h.clientsByUserID[userID]
	clients := make([]*Client, 0, len(perUser))
	for client := range perUser {
		clients = append(clients, client)
	}

	return clients
}

func (c *Client) readLoop() {
	defer c.hub.RemoveClient(c)

	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		c.extendReadDeadline()

		var message map[string]any
		if err := json.Unmarshal(data, &message); err != nil {
			_ = c.writeJSON(map[string]string{"type": "PROTOCOL_ERROR", "message": "Invalid message"})
			continue
		}

		typeValue, _ := message["type"].(string)
		if typeValue == "PONG" {
			c.markAlive()
			continue
		}

		handler := c.hub.getHandler(typeValue)
		if handler == nil {
			_ = c.writeJSON(map[string]string{"type": "PROTOCOL_ERROR", "message": "Unsupported message type"})
			continue
		}

		if err := handler(c, message); err != nil {
			_ = c.writeJSON(map[string]string{"type": "PROTOCOL_ERROR", "message": "Invalid message payload"})
			continue
		}
	}
}

func (c *Client) writeJSON(payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	if err := c.conn.SetWriteDeadline(time.Now().Add(c.hub.WriteTimeout())); err != nil {
		return err
	}
	return c.conn.WriteMessage(websocket.TextMessage, data)
}

func (c *Client) SendJSON(payload any) error {
	return c.writeJSON(payload)
}

func (c *Client) UserID() int64 {
	return c.userID
}

func (c *Client) SessionID() string {
	return c.sessionID
}

func (c *Client) close() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.conn.Close()
}

func (c *Client) closeWithCode(code int, reason string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	deadline := time.Now().Add(c.hub.WriteTimeout())
	_ = c.conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(code, reason), deadline)
	return c.conn.Close()
}

func (c *Client) markAlive() {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.alive = true
	_ = c.conn.SetReadDeadline(time.Now().Add(c.hub.heartbeatInterval * 2))
}

func (c *Client) markAwaitingPong() bool {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.alive {
		return false
	}
	c.alive = false
	return true
}

func (h *Hub) getHandler(messageType string) MessageHandler {
	h.mu.RLock()
	defer h.mu.RUnlock()

	return h.handlers[messageType]
}

func (c *Client) extendReadDeadline() {
	_ = c.conn.SetReadDeadline(time.Now().Add(c.hub.heartbeatInterval * 2))
}
