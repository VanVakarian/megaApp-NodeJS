package metrics

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

type MinuteSnapshot struct {
	MinuteBucket int64
	Metrics      map[string]float64
}

type FlatlineClient struct {
	baseURL string
	client  *http.Client
}

func NewFlatlineClient(baseURL string, timeout time.Duration) *FlatlineClient {
	return &FlatlineClient{baseURL: baseURL, client: &http.Client{Timeout: timeout}}
}

type pushRequest struct {
	Service   string             `json:"service"`
	Snapshots []outboundSnapshot `json:"snapshots"`
}

type outboundSnapshot struct {
	Granularity  string             `json:"granularity"`
	MinuteBucket int64              `json:"bucket"`
	Metrics      map[string]float64 `json:"metrics"`
}

type pushResponse struct {
	Result bool `json:"result"`
}

func (c *FlatlineClient) PushSnapshots(ctx context.Context, service string, snapshots []MinuteSnapshot) error {
	body := pushRequest{Service: service, Snapshots: make([]outboundSnapshot, 0, len(snapshots))}
	for _, snapshot := range snapshots {
		body.Snapshots = append(body.Snapshots, outboundSnapshot{Granularity: GranularityMinute, MinuteBucket: snapshot.MinuteBucket, Metrics: snapshot.Metrics})
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal flatline push body: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/metrics/snapshots", bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("build flatline push request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("send flatline push request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<10))
		return fmt.Errorf("flatline push status %d: %s", resp.StatusCode, string(respBody))
	}

	var response pushResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return fmt.Errorf("decode flatline push response: %w", err)
	}
	if !response.Result {
		return errors.New("flatline push rejected")
	}

	return nil
}

type sinceResponse struct {
	Points []MetricPoint       `json:"points"`
	Next   *FlatlinePageCursor `json:"next,omitempty"`
}

type FlatlinePageCursor struct {
	Bucket  int64  `json:"bucket"`
	Service string `json:"service"`
	Name    string `json:"name"`
}

type FlatlineSincePage struct {
	Points []MetricPoint
	Next   *FlatlinePageCursor
}

// Since fetches points newer than cursor, optionally additionally bounded by
// age per granularity (minuteFloor/hourFloor/dayFloor — pass 0 for "no extra
// bound"). Bounding here, not after the fact in Go, keeps Flatline from
// having to scan and ship its entire retained history (weeks of minute rows
// across every service) for every call — see ws_handlers.go's subscribe
// backfill, the one caller that needs real bounds.
func (c *FlatlineClient) Since(ctx context.Context, cursor, minuteFloor, hourFloor, dayFloor int64) ([]MetricPoint, error) {
	url := c.baseURL + "/api/metrics/since" +
		"?cursor=" + strconv.FormatInt(cursor, 10) +
		"&minuteSince=" + strconv.FormatInt(minuteFloor, 10) +
		"&hourSince=" + strconv.FormatInt(hourFloor, 10) +
		"&daySince=" + strconv.FormatInt(dayFloor, 10)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("build flatline since request: %w", err)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("send flatline since request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<10))
		return nil, fmt.Errorf("flatline since status %d: %s", resp.StatusCode, string(respBody))
	}

	var response sinceResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return nil, fmt.Errorf("decode flatline since response: %w", err)
	}

	return response.Points, nil
}

func (c *FlatlineClient) SincePage(ctx context.Context, granularity string, cursor, floor int64, after *FlatlinePageCursor) (FlatlineSincePage, error) {
	query := url.Values{
		"cursor":      {strconv.FormatInt(cursor, 10)},
		"granularity": {granularity},
		"minuteSince": {"0"},
		"hourSince":   {"0"},
		"daySince":    {"0"},
	}
	switch granularity {
	case GranularityMinute:
		query.Set("minuteSince", strconv.FormatInt(floor, 10))
	case GranularityHour:
		query.Set("hourSince", strconv.FormatInt(floor, 10))
	case GranularityDay:
		query.Set("daySince", strconv.FormatInt(floor, 10))
	}
	if after != nil {
		query.Set("afterBucket", strconv.FormatInt(after.Bucket, 10))
		query.Set("afterService", after.Service)
		query.Set("afterName", after.Name)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/api/metrics/since?"+query.Encode(), nil)
	if err != nil {
		return FlatlineSincePage{}, fmt.Errorf("build flatline since page request: %w", err)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return FlatlineSincePage{}, fmt.Errorf("send flatline since page request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<10))
		return FlatlineSincePage{}, fmt.Errorf("flatline since page status %d: %s", resp.StatusCode, string(respBody))
	}

	var response sinceResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return FlatlineSincePage{}, fmt.Errorf("decode flatline since page response: %w", err)
	}
	return FlatlineSincePage{Points: response.Points, Next: response.Next}, nil
}
