package food

import "sync"

type StatsCache struct {
	mu     sync.RWMutex
	values map[int64]StatsResponse
}

func NewStatsCache() *StatsCache {
	return &StatsCache{values: make(map[int64]StatsResponse)}
}

func (c *StatsCache) Get(userID int64) (StatsResponse, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	value, ok := c.values[userID]
	if !ok {
		return StatsResponse{}, false
	}

	return cloneStatsResponse(value), true
}

func (c *StatsCache) Set(userID int64, value StatsResponse) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.values[userID] = cloneStatsResponse(value)
}

func (c *StatsCache) Delete(userID int64) {
	c.mu.Lock()
	defer c.mu.Unlock()

	delete(c.values, userID)
}

func cloneStatsResponse(input StatsResponse) StatsResponse {
	days := make(map[string]DayStats, len(input.Days))
	for key, value := range input.Days {
		days[key] = value
	}
	topProducts := make([]ProductStat, len(input.TopProducts))
	copy(topProducts, input.TopProducts)

	return StatsResponse{Days: days, TopProducts: topProducts, TotalEntries: input.TotalEntries}
}
