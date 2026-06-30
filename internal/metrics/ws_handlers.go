package metrics

import (
	"context"
	"log/slog"

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

// No client-sent cursor: every (re)subscribe — fresh page load, IDB cache
// wipe, WS reconnect after the tab was suspended — backfills the full fixed
// relay window per granularity, same as hour/day already did. A client
// cursor here would only reintroduce the single failure mode this is meant
// to avoid (clock skew, a stale in-memory cursor after a cache wipe, a race
// with the async IDB load) silently swallowing real history.
func NewSubscribeHandler(service *Service, realtime *Realtime, flatlineClient *FlatlineClient, clk clockplatform.Clock, logger *slog.Logger) ws.MessageHandler {
	return func(client *ws.Client, _ map[string]any) error {
		ctx := context.Background()

		isAdmin, err := service.IsAdmin(ctx, client.UserID())
		if err != nil {
			logger.Warn("metrics_subscribe_admin_check_failed", "err", err)
			return err
		}
		if !isAdmin {
			return nil
		}

		realtime.Subscribe(client)

		points, err := flatlineClient.Since(ctx, 0)
		if err != nil {
			logger.Warn("metrics_subscribe_backfill_failed", "err", err)
			return err
		}

		if err := client.SendJSON(map[string]any{
			"type":    "METRICS_UPDATE",
			"payload": DetailUpdate{Points: filterPointsForRelay(points, clk.Now().Unix())},
		}); err != nil {
			logger.Warn("metrics_subscribe_send_failed", "err", err)
			return err
		}
		return nil
	}
}

// filterPointsForRelay trims a full Since(0) dump down to each granularity's
// fixed relay window — no per-client cursor for any granularity.
func filterPointsForRelay(points []MetricPoint, nowUnix int64) []MetricPoint {
	filtered := make([]MetricPoint, 0, len(points))
	for _, point := range points {
		var window int64
		switch point.Granularity {
		case GranularityHour:
			window = hourRelayWindowSeconds
		case GranularityDay:
			window = dayRelayWindowSeconds
		default: // minute, and any unset/legacy value
			window = minuteRelayWindowSeconds
		}
		if point.Bucket < nowUnix-window {
			continue
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
