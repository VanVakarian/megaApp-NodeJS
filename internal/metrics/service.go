package metrics

import (
	"context"
	"sync"
	"time"

	clockplatform "megaapp-back/internal/platform/clock"
)

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
		if err := s.repo.AddToCounter(ctx, name, bucket, float64(delta)); err != nil {
			return nil, err
		}
		points = append(points, MetricPoint{Name: name, Bucket: bucket, Value: float64(delta)})
	}
	return points, nil
}

func (s *Service) ListSince(ctx context.Context, sinceBucket int64) ([]MetricPoint, error) {
	return s.repo.ListSince(ctx, sinceBucket)
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

func previousMinuteBucket(now time.Time) int64 {
	return now.Truncate(time.Minute).Add(-time.Minute).Unix()
}
