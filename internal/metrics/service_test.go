package metrics

import (
	"context"
	"database/sql"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

type fixedMetricsClock struct {
	now time.Time
}

func (c fixedMetricsClock) Now() time.Time {
	return c.now
}

type fakeAdminLister struct {
	adminUserIDs []int64
	err          error
}

func (f fakeAdminLister) ListAdminUserIDs(context.Context) ([]int64, error) {
	return f.adminUserIDs, f.err
}

func TestServiceFlushUpsertsAccumulatedCounters(t *testing.T) {
	db := openMetricsTestDB(t)
	repo := NewRepository(db)
	clock := fixedMetricsClock{now: time.Date(2026, 6, 21, 14, 33, 7, 0, time.UTC)}
	service := NewService(repo, clock, fakeAdminLister{})

	service.Increment("food_diary_entry_created")
	service.Increment("food_diary_entry_created")
	service.Increment("food_body_weight_updated")

	if _, err := service.Flush(context.Background()); err != nil {
		t.Fatalf("Flush() error = %v", err)
	}

	points, err := service.ListSince(context.Background(), 0)
	if err != nil {
		t.Fatalf("ListSince() error = %v", err)
	}

	wantBucket := time.Date(2026, 6, 21, 14, 32, 0, 0, time.UTC).Unix()
	got := map[string]float64{}
	for _, point := range points {
		if point.Bucket != wantBucket {
			t.Fatalf("point.Bucket = %d, want %d", point.Bucket, wantBucket)
		}
		if point.Service != MainServiceName {
			t.Fatalf("point.Service = %q, want %q", point.Service, MainServiceName)
		}
		got[point.Name] = point.Value
	}

	if got["food_diary_entry_created"] != 2 {
		t.Fatalf("food_diary_entry_created = %v, want 2", got["food_diary_entry_created"])
	}
	if got["food_body_weight_updated"] != 1 {
		t.Fatalf("food_body_weight_updated = %v, want 1", got["food_body_weight_updated"])
	}
}

func TestServiceFlushAccumulatesAcrossMultipleFlushesIntoSameBucket(t *testing.T) {
	db := openMetricsTestDB(t)
	repo := NewRepository(db)
	clock := fixedMetricsClock{now: time.Date(2026, 6, 21, 14, 33, 0, 0, time.UTC)}
	service := NewService(repo, clock, fakeAdminLister{})

	service.Increment("food_diary_entry_created")
	if _, err := service.Flush(context.Background()); err != nil {
		t.Fatalf("Flush() error = %v", err)
	}

	service.Increment("food_diary_entry_created")
	if _, err := service.Flush(context.Background()); err != nil {
		t.Fatalf("Flush() error = %v", err)
	}

	points, err := service.ListSince(context.Background(), 0)
	if err != nil {
		t.Fatalf("ListSince() error = %v", err)
	}
	if len(points) != 1 {
		t.Fatalf("len(points) = %d, want 1", len(points))
	}
	if points[0].Value != 2 {
		t.Fatalf("points[0].Value = %v, want 2", points[0].Value)
	}
}

func TestServiceFlushNoopWhenNothingAccumulated(t *testing.T) {
	db := openMetricsTestDB(t)
	repo := NewRepository(db)
	clock := fixedMetricsClock{now: time.Now()}
	service := NewService(repo, clock, fakeAdminLister{})

	if _, err := service.Flush(context.Background()); err != nil {
		t.Fatalf("Flush() error = %v", err)
	}

	points, err := service.ListSince(context.Background(), 0)
	if err != nil {
		t.Fatalf("ListSince() error = %v", err)
	}
	if len(points) != 0 {
		t.Fatalf("len(points) = %d, want 0", len(points))
	}
}

func TestServiceListSinceFiltersByBucket(t *testing.T) {
	db := openMetricsTestDB(t)
	repo := NewRepository(db)

	earlyClock := fixedMetricsClock{now: time.Date(2026, 6, 21, 14, 33, 0, 0, time.UTC)}
	service := NewService(repo, earlyClock, fakeAdminLister{})
	service.Increment("food_diary_entry_created")
	if _, err := service.Flush(context.Background()); err != nil {
		t.Fatalf("Flush() error = %v", err)
	}

	lateClock := fixedMetricsClock{now: time.Date(2026, 6, 21, 14, 35, 0, 0, time.UTC)}
	service = NewService(repo, lateClock, fakeAdminLister{})
	service.Increment("food_diary_entry_created")
	if _, err := service.Flush(context.Background()); err != nil {
		t.Fatalf("Flush() error = %v", err)
	}

	cursor := time.Date(2026, 6, 21, 14, 33, 0, 0, time.UTC).Unix()
	points, err := service.ListSince(context.Background(), cursor)
	if err != nil {
		t.Fatalf("ListSince() error = %v", err)
	}
	if len(points) != 1 {
		t.Fatalf("len(points) = %d, want 1", len(points))
	}
	wantBucket := time.Date(2026, 6, 21, 14, 34, 0, 0, time.UTC).Unix()
	if points[0].Bucket != wantBucket {
		t.Fatalf("points[0].Bucket = %d, want %d", points[0].Bucket, wantBucket)
	}
}

func TestServiceIsAdmin(t *testing.T) {
	tests := []struct {
		name         string
		adminUserIDs []int64
		userID       int64
		want         bool
	}{
		{name: "known admin", adminUserIDs: []int64{1, 2}, userID: 2, want: true},
		{name: "unknown user", adminUserIDs: []int64{1, 2}, userID: 3, want: false},
		{name: "empty admin list", adminUserIDs: nil, userID: 1, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service := NewService(nil, fixedMetricsClock{}, fakeAdminLister{adminUserIDs: tt.adminUserIDs})
			got, err := service.IsAdmin(context.Background(), tt.userID)
			if err != nil {
				t.Fatalf("IsAdmin() error = %v", err)
			}
			if got != tt.want {
				t.Fatalf("IsAdmin() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestPreviousMinuteBucket(t *testing.T) {
	tests := []struct {
		name string
		now  time.Time
		want time.Time
	}{
		{
			name: "mid minute",
			now:  time.Date(2026, 6, 21, 14, 33, 7, 0, time.UTC),
			want: time.Date(2026, 6, 21, 14, 32, 0, 0, time.UTC),
		},
		{
			name: "exact minute boundary",
			now:  time.Date(2026, 6, 21, 14, 33, 0, 0, time.UTC),
			want: time.Date(2026, 6, 21, 14, 32, 0, 0, time.UTC),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := previousMinuteBucket(tt.now); got != tt.want.Unix() {
				t.Fatalf("previousMinuteBucket() = %d, want %d", got, tt.want.Unix())
			}
		})
	}
}

func openMetricsTestDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("sql.Open() error = %v", err)
	}

	if _, err := db.Exec(`
		CREATE TABLE metrics (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			service TEXT NOT NULL,
			metricName TEXT NOT NULL,
			minuteBucket INTEGER NOT NULL,
			value REAL NOT NULL,
			UNIQUE(service, metricName, minuteBucket)
		);
	`); err != nil {
		_ = db.Close()
		t.Fatalf("Exec() error = %v", err)
	}

	t.Cleanup(func() {
		_ = db.Close()
	})

	return db
}
