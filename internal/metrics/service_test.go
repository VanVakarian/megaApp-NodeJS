package metrics

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
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

func TestServiceIngestSnapshotsReplacesExistingBucket(t *testing.T) {
	db := openMetricsTestDB(t)
	repo := NewRepository(db)
	service := NewService(repo, fixedMetricsClock{now: time.Date(2026, 6, 23, 12, 35, 0, 0, time.UTC)}, fakeAdminLister{})

	request := IngestRequest{
		Service: SpreadCaptureBotServiceName,
		Snapshots: []SnapshotInput{
			{
				MinuteBucket: time.Date(2026, 6, 23, 12, 34, 0, 0, time.UTC).Unix(),
				Metrics: map[string]float64{
					"heartbeat":    1,
					"cycle_errors": 1,
				},
			},
		},
	}

	if _, err := service.IngestSnapshots(context.Background(), request); err != nil {
		t.Fatalf("IngestSnapshots() error = %v", err)
	}

	request.Snapshots[0].Metrics["cycle_errors"] = 0
	if _, err := service.IngestSnapshots(context.Background(), request); err != nil {
		t.Fatalf("IngestSnapshots() second error = %v", err)
	}

	points, err := service.ListSince(context.Background(), 0)
	if err != nil {
		t.Fatalf("ListSince() error = %v", err)
	}

	values := make(map[string]float64)
	for _, point := range points {
		if point.Service == SpreadCaptureBotServiceName {
			values[point.Name] = point.Value
		}
	}

	if values["cycle_errors"] != 0 {
		t.Fatalf("cycle_errors = %v, want 0", values["cycle_errors"])
	}
}

func TestServiceImportNDJSONMergesDuplicateBucketsAndUpserts(t *testing.T) {
	db := openMetricsTestDB(t)
	repo := NewRepository(db)
	service := NewService(repo, fixedMetricsClock{now: time.Now()}, fakeAdminLister{})

	bucketB := time.Date(2026, 6, 23, 12, 34, 0, 0, time.UTC).Unix()
	bucketB2 := time.Date(2026, 6, 23, 12, 35, 0, 0, time.UTC).Unix()
	bucketB3 := time.Date(2026, 6, 23, 12, 36, 0, 0, time.UTC).Unix()

	ndjson := strings.Join([]string{
		`{"service":"bot-a","minuteBucket":` + fmt.Sprint(bucketB) + `,"metrics":{"a":1,"b":2}}`,
		`{"service":"bot-a","minuteBucket":` + fmt.Sprint(bucketB) + `,"metrics":{"b":3,"c":4}}`,
		`{"service":"bot-a","minuteBucket":` + fmt.Sprint(bucketB2) + `,"metrics":{"x":5}}`,
		``,
		`{"service":"","minuteBucket":` + fmt.Sprint(bucketB) + `,"metrics":{"x":5}}`,
		`{"service":"bot-b","minuteBucket":` + fmt.Sprint(bucketB3) + `,"metrics":{"y":6}}`,
	}, "\n")

	imported, err := service.ImportNDJSON(context.Background(), strings.NewReader(ndjson))
	if err != nil {
		t.Fatalf("ImportNDJSON() error = %v", err)
	}
	if imported != 5 {
		t.Fatalf("imported = %d, want 5", imported)
	}

	points, err := service.ListSince(context.Background(), 0)
	if err != nil {
		t.Fatalf("ListSince() error = %v", err)
	}

	values := make(map[string]float64)
	for _, point := range points {
		values[point.Service+"/"+point.Name] = point.Value
	}

	if values["bot-a/a"] != 1 {
		t.Fatalf("bot-a/a = %v, want 1", values["bot-a/a"])
	}
	if values["bot-a/b"] != 3 {
		t.Fatalf("bot-a/b = %v, want 3", values["bot-a/b"])
	}
	if values["bot-a/c"] != 4 {
		t.Fatalf("bot-a/c = %v, want 4", values["bot-a/c"])
	}
	if values["bot-a/x"] != 5 {
		t.Fatalf("bot-a/x = %v, want 5", values["bot-a/x"])
	}
	if values["bot-b/y"] != 6 {
		t.Fatalf("bot-b/y = %v, want 6", values["bot-b/y"])
	}
}

func TestServiceImportNDJSONRejectsMalformedLine(t *testing.T) {
	db := openMetricsTestDB(t)
	repo := NewRepository(db)
	service := NewService(repo, fixedMetricsClock{now: time.Now()}, fakeAdminLister{})

	if _, err := service.ImportNDJSON(context.Background(), strings.NewReader("not-json")); err == nil {
		t.Fatal("ImportNDJSON() error = nil, want error")
	}
}

func TestServiceCurrentHealthMarksBotStale(t *testing.T) {
	db := openMetricsTestDB(t)
	repo := NewRepository(db)
	service := NewService(repo, fixedMetricsClock{now: time.Date(2026, 6, 23, 12, 40, 0, 0, time.UTC)}, fakeAdminLister{})

	if _, err := service.IngestSnapshots(context.Background(), IngestRequest{
		Service: SpreadCaptureBotServiceName,
		Snapshots: []SnapshotInput{
			{
				MinuteBucket: time.Date(2026, 6, 23, 12, 34, 0, 0, time.UTC).Unix(),
				Metrics: map[string]float64{
					"heartbeat": 1,
				},
			},
		},
	}); err != nil {
		t.Fatalf("IngestSnapshots() error = %v", err)
	}

	health, err := service.CurrentHealth(context.Background())
	if err != nil {
		t.Fatalf("CurrentHealth() error = %v", err)
	}

	got := map[string]string{}
	for _, serviceHealth := range health.Services {
		got[serviceHealth.Service] = serviceHealth.Severity
	}

	if got[MainServiceName] != "ok" {
		t.Fatalf("megaapp severity = %q, want ok", got[MainServiceName])
	}
	if got[SpreadCaptureBotServiceName] != "error" {
		t.Fatalf("bot severity = %q, want error", got[SpreadCaptureBotServiceName])
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
