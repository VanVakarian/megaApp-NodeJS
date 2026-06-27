package metrics

import "testing"

func TestFilterPointsForRelayMinuteBoundedByCursorAndWindow(t *testing.T) {
	now := int64(1_000_000_000)
	cursor := now - 300
	points := []MetricPoint{
		{Name: "a", Granularity: GranularityMinute, Bucket: now - 500},                           // already seen (<= cursor)
		{Name: "a", Granularity: GranularityMinute, Bucket: now - 100},                           // new, within window
		{Name: "a", Granularity: GranularityMinute, Bucket: now - minuteRelayWindowSeconds - 60}, // new but outside window
	}

	got := filterPointsForRelay(points, now, cursor)

	if len(got) != 1 || got[0].Bucket != now-100 {
		t.Fatalf("got = %+v, want only bucket=%d", got, now-100)
	}
}

func TestFilterPointsForRelayHourBoundedByWindowOnlyNoCursor(t *testing.T) {
	now := int64(1_000_000_000)
	farPastButOlderThanMinuteCursor := now - 500 // would fail a minute-style cursor check, but hour ignores the cursor entirely
	points := []MetricPoint{
		{Name: "a", Granularity: GranularityHour, Bucket: farPastButOlderThanMinuteCursor},
		{Name: "a", Granularity: GranularityHour, Bucket: now - hourRelayWindowSeconds - 3600}, // outside window
		{Name: "a", Granularity: GranularityHour, Bucket: now - 3600},                          // inside window
	}

	// A minuteCursor sitting after the first point's bucket would have
	// excluded it if it were (incorrectly) applied to hour granularity too.
	got := filterPointsForRelay(points, now, now-300)

	if len(got) != 2 {
		t.Fatalf("len(got) = %d, want 2 (cursor must not filter hour points)", len(got))
	}
	for _, point := range got {
		if point.Bucket == now-hourRelayWindowSeconds-3600 {
			t.Fatalf("point outside hour relay window leaked through: %+v", point)
		}
	}
}

func TestFilterPointsForRelayDayBoundedByWindow(t *testing.T) {
	now := int64(10_000_000_000)
	points := []MetricPoint{
		{Name: "a", Granularity: GranularityDay, Bucket: now - dayRelayWindowSeconds - 86400}, // outside window
		{Name: "a", Granularity: GranularityDay, Bucket: now - 86400},                         // inside window
	}

	got := filterPointsForRelay(points, now, 0)

	if len(got) != 1 || got[0].Bucket != now-86400 {
		t.Fatalf("got = %+v, want only the in-window day point", got)
	}
}
