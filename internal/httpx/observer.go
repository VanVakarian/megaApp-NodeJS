package httpx

import "time"

type Observer interface {
	ObserveHTTP(method string, pattern string, statusCode int, duration time.Duration)
}

type NoopObserver struct{}

func (NoopObserver) ObserveHTTP(string, string, int, time.Duration) {}
