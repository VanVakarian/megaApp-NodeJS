package metrics

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"strings"
	"sync"
	"time"

	clockplatform "megaapp-back/internal/platform/clock"
)

const MainServiceName = "megaapp"
const SpreadCaptureBotServiceName = "spread-capture-bot-v3"

type AdminLister interface {
	ListAdminUserIDs(ctx context.Context) ([]int64, error)
}

type Service struct {
	repo        *Repository
	clock       clockplatform.Clock
	adminLister AdminLister

	mu     sync.Mutex
	counts map[string]int64
}

type SnapshotInput struct {
	MinuteBucket int64              `json:"minuteBucket"`
	Metrics      map[string]float64 `json:"metrics"`
}

type IngestRequest struct {
	Service   string          `json:"service"`
	Snapshots []SnapshotInput `json:"snapshots"`
}

func NewService(repo *Repository, clock clockplatform.Clock, adminLister AdminLister) *Service {
	return &Service{
		repo:        repo,
		clock:       clock,
		adminLister: adminLister,
		counts:      make(map[string]int64),
	}
}

func (s *Service) Increment(name string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.counts[name]++
}

func (s *Service) Flush(ctx context.Context) ([]MetricPoint, error) {
	s.mu.Lock()
	pending := s.counts
	s.counts = make(map[string]int64)
	s.mu.Unlock()

	if len(pending) == 0 {
		return nil, nil
	}

	bucket := previousMinuteBucket(s.clock.Now())
	points := make([]MetricPoint, 0, len(pending))
	for name, delta := range pending {
		if err := s.repo.AddToCounter(ctx, MainServiceName, name, bucket, float64(delta)); err != nil {
			return nil, err
		}
		points = append(points, MetricPoint{Service: MainServiceName, Name: name, Bucket: bucket, Value: float64(delta)})
	}
	return points, nil
}

func (s *Service) ListSince(ctx context.Context, sinceBucket int64) ([]MetricPoint, error) {
	return s.repo.ListSince(ctx, sinceBucket)
}

func (s *Service) IngestSnapshots(ctx context.Context, request IngestRequest) ([]MetricPoint, error) {
	service := strings.TrimSpace(request.Service)
	if service == "" {
		return nil, ErrInvalidIngestPayload
	}
	if len(request.Snapshots) == 0 {
		return nil, ErrInvalidIngestPayload
	}

	seenBuckets := make(map[int64]struct{}, len(request.Snapshots))
	for _, snapshot := range request.Snapshots {
		if snapshot.MinuteBucket <= 0 {
			return nil, ErrInvalidIngestPayload
		}
		if len(snapshot.Metrics) == 0 {
			return nil, ErrInvalidIngestPayload
		}
		if _, exists := seenBuckets[snapshot.MinuteBucket]; exists {
			return nil, ErrInvalidIngestPayload
		}
		seenBuckets[snapshot.MinuteBucket] = struct{}{}

		for name, value := range snapshot.Metrics {
			if strings.TrimSpace(name) == "" {
				return nil, ErrInvalidIngestPayload
			}
			if math.IsNaN(value) || math.IsInf(value, 0) {
				return nil, ErrInvalidIngestPayload
			}
		}
	}

	return s.repo.ReplaceSnapshots(ctx, service, request.Snapshots)
}

type ndjsonSnapshot struct {
	Service      string             `json:"service"`
	MinuteBucket int64              `json:"minuteBucket"`
	Metrics      map[string]float64 `json:"metrics"`
}

func (s *Service) ImportNDJSON(ctx context.Context, body io.Reader) (int, error) {
	grouped := make(map[string]map[int64]map[string]float64)

	scanner := bufio.NewScanner(body)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var snapshot ndjsonSnapshot
		if err := json.Unmarshal([]byte(line), &snapshot); err != nil {
			return 0, fmt.Errorf("parse ndjson line: %w", err)
		}
		service := strings.TrimSpace(snapshot.Service)
		if service == "" || snapshot.MinuteBucket <= 0 || len(snapshot.Metrics) == 0 {
			continue
		}

		buckets, ok := grouped[service]
		if !ok {
			buckets = make(map[int64]map[string]float64)
			grouped[service] = buckets
		}
		metrics, ok := buckets[snapshot.MinuteBucket]
		if !ok {
			metrics = make(map[string]float64)
			buckets[snapshot.MinuteBucket] = metrics
		}
		for name, value := range snapshot.Metrics {
			if strings.TrimSpace(name) == "" || math.IsNaN(value) || math.IsInf(value, 0) {
				continue
			}
			metrics[name] = value
		}
	}
	if err := scanner.Err(); err != nil {
		return 0, fmt.Errorf("scan ndjson: %w", err)
	}

	imported := 0
	for service, buckets := range grouped {
		snapshots := make([]SnapshotInput, 0, len(buckets))
		for bucket, metrics := range buckets {
			if len(metrics) == 0 {
				continue
			}
			snapshots = append(snapshots, SnapshotInput{MinuteBucket: bucket, Metrics: metrics})
		}
		if len(snapshots) == 0 {
			continue
		}
		points, err := s.IngestSnapshots(ctx, IngestRequest{Service: service, Snapshots: snapshots})
		if err != nil {
			return imported, fmt.Errorf("ingest snapshots for service %q: %w", service, err)
		}
		imported += len(points)
	}
	return imported, nil
}

func (s *Service) IsAdmin(ctx context.Context, userID int64) (bool, error) {
	adminUserIDs, err := s.adminLister.ListAdminUserIDs(ctx)
	if err != nil {
		return false, err
	}
	for _, adminUserID := range adminUserIDs {
		if adminUserID == userID {
			return true, nil
		}
	}
	return false, nil
}

func (s *Service) AdminUserIDs(ctx context.Context) ([]int64, error) {
	return s.adminLister.ListAdminUserIDs(ctx)
}

func (s *Service) CurrentHealth(ctx context.Context) (HealthStatus, error) {
	latestPoints, err := s.repo.ListLatestPointsByService(ctx)
	if err != nil {
		return HealthStatus{}, err
	}

	pointsByService := make(map[string][]MetricPoint)
	for _, point := range latestPoints {
		pointsByService[point.Service] = append(pointsByService[point.Service], point)
	}

	status := HealthStatus{
		Services: []ServiceHealth{
			{Service: MainServiceName, Severity: "ok"},
			{Service: SpreadCaptureBotServiceName, Severity: botHealthSeverity(s.clock.Now(), pointsByService[SpreadCaptureBotServiceName])},
		},
	}

	for service := range pointsByService {
		if service == MainServiceName || service == SpreadCaptureBotServiceName {
			continue
		}
		status.Services = append(status.Services, ServiceHealth{Service: service, Severity: "ok"})
	}

	return status, nil
}

func previousMinuteBucket(now time.Time) int64 {
	return now.Truncate(time.Minute).Add(-time.Minute).Unix()
}

func botHealthSeverity(now time.Time, points []MetricPoint) string {
	if len(points) == 0 {
		return "error"
	}

	latestBucket := points[0].Bucket
	values := make(map[string]float64, len(points))
	for _, point := range points {
		values[point.Name] = point.Value
	}

	expectedBucket := previousMinuteBucket(now)
	lagSeconds := expectedBucket - latestBucket
	if lagSeconds >= 180 {
		return "error"
	}

	severity := "ok"
	if lagSeconds >= 120 {
		severity = "warn"
	}
	if values["cycle_errors"] > 0 || values["reconcile_failures"] > 0 {
		severity = "warn"
	}
	if values["cycle_duration_ms"] >= 45000 {
		severity = "warn"
	}

	return severity
}
