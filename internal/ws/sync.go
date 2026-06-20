package ws

import "sync"

type SyncState struct {
	mu     sync.RWMutex
	values map[int64]int64
}

func NewSyncState() *SyncState {
	return &SyncState{values: make(map[int64]int64)}
}

func (s *SyncState) Get(userID int64) int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return s.values[userID]
}

func (s *SyncState) Set(userID int64, value int64) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.values[userID] = value
}
