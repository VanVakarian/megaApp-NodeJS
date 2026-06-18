package quotes

import "time"

type Config struct {
	FetchDays      int
	RetryAttempts  int
	RetryDelay     time.Duration
	RequestTimeout time.Duration
}

type OpenAsset struct {
	ID             int64
	Ticker         string
	Type           string
	SuspendedSince *string
}

type RateHistoryRow struct {
	ID        int64
	DateISO   string
	RatesJSON string
}

type RunResult struct {
	UpsertedCount int      `json:"upsertedCount"`
	FromISO       string   `json:"fromISO"`
	ToISO         string   `json:"toISO"`
	Errors        []string `json:"errors"`
}

type RetryConfig struct {
	Attempts int
	Delay    time.Duration
}
