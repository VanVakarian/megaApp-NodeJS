package food

import "sync"

type StatsCache struct {
	mu     sync.RWMutex
	values map[int64]map[string]DayStats
}

func NewStatsCache() *StatsCache {
	return &StatsCache{values: make(map[int64]map[string]DayStats)}
}

func (c *StatsCache) Get(userID int64) (map[string]DayStats, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	value, ok := c.values[userID]
	if !ok {
		return nil, false
	}

	return cloneStatsMap(value), true
}

func (c *StatsCache) Set(userID int64, value map[string]DayStats) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.values[userID] = cloneStatsMap(value)
}

func (c *StatsCache) Delete(userID int64) {
	c.mu.Lock()
	defer c.mu.Unlock()

	delete(c.values, userID)
}

func cloneStatsMap(input map[string]DayStats) map[string]DayStats {
	result := make(map[string]DayStats, len(input))
	for key, value := range input {
		result[key] = value
	}
	return result
}
