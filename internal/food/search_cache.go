package food

import "sync"

type SearchCache struct {
	mu     sync.RWMutex
	values map[string][]int64
}

func NewSearchCache() *SearchCache {
	return &SearchCache{values: make(map[string][]int64)}
}

func (c *SearchCache) Get(query string) ([]int64, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	value, ok := c.values[query]
	if !ok {
		return nil, false
	}

	result := make([]int64, len(value))
	copy(result, value)
	return result, true
}

func (c *SearchCache) Set(query string, ids []int64) {
	c.mu.Lock()
	defer c.mu.Unlock()

	value := make([]int64, len(ids))
	copy(value, ids)
	c.values[query] = value
}

func (c *SearchCache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.values = make(map[string][]int64)
}
