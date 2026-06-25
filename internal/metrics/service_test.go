package metrics

import (
	"context"
	"testing"
	"time"
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

func TestServiceFlushReturnsAccumulatedCounters(t *testing.T) {
	clock := fixedMetricsClock{now: time.Date(2026, 6, 21, 14, 33, 7, 0, time.UTC)}
	service := NewService(MainServiceName, clock, fakeAdminLister{})

	service.Increment("food_diary_entry_created")
	service.Increment("food_diary_entry_created")
	service.Increment("food_body_weight_updated")

	points := service.Flush()

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

func TestServiceFlushResetsAccumulatorAfterEachCall(t *testing.T) {
	clock := fixedMetricsClock{now: time.Date(2026, 6, 21, 14, 33, 0, 0, time.UTC)}
	service := NewService("megaapp-test", clock, fakeAdminLister{})

	service.Increment("food_diary_entry_created")
	first := service.Flush()
	if len(first) != 1 || first[0].Value != 1 {
		t.Fatalf("first flush = %+v, want one point with value 1", first)
	}

	second := service.Flush()
	if len(second) != 0 {
		t.Fatalf("second flush = %+v, want empty (accumulator already reset)", second)
	}

	service.Increment("food_diary_entry_created")
	third := service.Flush()
	if len(third) != 1 || third[0].Value != 1 {
		t.Fatalf("third flush = %+v, want one point with value 1, not accumulated with the first", third)
	}
	if third[0].Service != "megaapp-test" {
		t.Fatalf("third[0].Service = %q, want megaapp-test", third[0].Service)
	}
}

func TestServiceFlushNilWhenNothingAccumulated(t *testing.T) {
	service := NewService(MainServiceName, fixedMetricsClock{now: time.Now()}, fakeAdminLister{})

	if points := service.Flush(); points != nil {
		t.Fatalf("points = %+v, want nil", points)
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
			service := NewService(MainServiceName, fixedMetricsClock{}, fakeAdminLister{adminUserIDs: tt.adminUserIDs})
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
