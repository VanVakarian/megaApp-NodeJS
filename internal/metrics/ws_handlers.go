package metrics

import (
	"context"

	clockplatform "megaapp-back/internal/platform/clock"
	"megaapp-back/internal/ws"
)

// Relay windows: how far back METRICS_SUBSCRIBE backfills history per
// granularity, not how long Flatline keeps it stored — see
// METRICS-GRANULARITY._implementation-plan.md, section 6.
const (
	minuteRelayWindowSeconds = 24 * 3600
	hourRelayWindowSeconds   = 30 * 24 * 3600
	dayRelayWindowSeconds    = 365 * 24 * 3600
)

func NewSubscribeHandler(service *Service, realtime *Realtime, flatlineClient *FlatlineClient, clk clockplatform.Clock) ws.MessageHandler {
	return func(client *ws.Client, message map[string]any) error {
		ctx := context.Background()

		isAdmin, err := service.IsAdmin(ctx, client.UserID())
		if err != nil {
			return err
		}
		if !isAdmin {
			return nil
		}

		realtime.Subscribe(client)

		var minuteCursor int64
		if rawCursor, ok := message["cursor"].(float64); ok {
			minuteCursor = int64(rawCursor)
		}

		points, err := flatlineClient.Since(ctx, 0)
		if err != nil {
			return err
		}

		return client.SendJSON(map[string]any{
			"type":    "METRICS_UPDATE",
			"payload": DetailUpdate{Points: filterPointsForRelay(points, clk.Now().Unix(), minuteCursor)},
		})
	}
}

// filterPointsForRelay trims a full Since(0) dump down to what a single
// subscribing client actually needs: minute points bounded by both its own
// cursor and the relay window, hour/day points bounded only by their
// (much larger, but still finite) relay window — their volume is tiny
// enough that a per-client cursor isn't worth the complexity.
func filterPointsForRelay(points []MetricPoint, nowUnix int64, minuteCursor int64) []MetricPoint {
	filtered := make([]MetricPoint, 0, len(points))
	for _, point := range points {
		switch point.Granularity {
		case GranularityHour:
			if point.Bucket < nowUnix-hourRelayWindowSeconds {
				continue
			}
		case GranularityDay:
			if point.Bucket < nowUnix-dayRelayWindowSeconds {
				continue
			}
		default: // minute, and any unset/legacy value
			if point.Bucket <= minuteCursor {
				continue
			}
			if point.Bucket < nowUnix-minuteRelayWindowSeconds {
				continue
			}
		}
		filtered = append(filtered, point)
	}
	return filtered
}

func NewUnsubscribeHandler(realtime *Realtime) ws.MessageHandler {
	return func(client *ws.Client, _ map[string]any) error {
		realtime.Unsubscribe(client)
		return nil
	}
}
