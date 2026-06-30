package metrics

import "testing"

func TestFilterPointsForRelayMinuteBoundedByWindow(t *testing.T) {
	now := int64(1_000_000_000)
	points := []MetricPoint{
		{Name: "a", Granularity: GranularityMinute, Bucket: now - 100},                           // inside window
		{Name: "a", Granularity: GranularityMinute, Bucket: now - minuteRelayWindowSeconds - 60}, // outside window
	}

	got := filterPointsForRelay(points, now)

	if len(got) != 1 || got[0].Bucket != now-100 {
		t.Fatalf("got = %+v, want only bucket=%d", got, now-100)
	}
}

func TestFilterPointsForRelayHourBoundedByWindow(t *testing.T) {
	now := int64(1_000_000_000)
	points := []MetricPoint{
		{Name: "a", Granularity: GranularityHour, Bucket: now - hourRelayWindowSeconds - 3600}, // outside window
		{Name: "a", Granularity: GranularityHour, Bucket: now - 3600},                          // inside window
	}

	got := filterPointsForRelay(points, now)

	if len(got) != 1 || got[0].Bucket != now-3600 {
		t.Fatalf("got = %+v, want only the in-window hour point", got)
	}
}

func TestFilterPointsForRelayDayBoundedByWindow(t *testing.T) {
	now := int64(10_000_000_000)
	points := []MetricPoint{
		{Name: "a", Granularity: GranularityDay, Bucket: now - dayRelayWindowSeconds - 86400}, // outside window
		{Name: "a", Granularity: GranularityDay, Bucket: now - 86400},                         // inside window
	}

	got := filterPointsForRelay(points, now)

	if len(got) != 1 || got[0].Bucket != now-86400 {
		t.Fatalf("got = %+v, want only the in-window day point", got)
	}
}
