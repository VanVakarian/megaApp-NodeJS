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

		// Bounds applied in Flatline's SQL, not after the fact here — Flatline
		// retains weeks of minute rows across every service (hundreds of
		// thousands of points); fetching that whole table on every subscribe
		// and discarding most of it in Go was slow enough to blow the HTTP
		// client's timeout and silently fail the entire backfill.
		nowUnix := clk.Now().Unix()
		points, err := flatlineClient.Since(ctx, 0,
			nowUnix-minuteRelayWindowSeconds,
			nowUnix-hourRelayWindowSeconds,
			nowUnix-dayRelayWindowSeconds,
		)
		if err != nil {
			logger.Warn("metrics_subscribe_backfill_failed", "err", err)
			return err
		}

		if err := client.SendJSON(map[string]any{
			"type":    "METRICS_UPDATE",
			"payload": DetailUpdate{Points: points},
		}); err != nil {
			logger.Warn("metrics_subscribe_send_failed", "err", err)
			return err
		}
		return nil
	}
}

func NewUnsubscribeHandler(realtime *Realtime) ws.MessageHandler {
	return func(client *ws.Client, _ map[string]any) error {
		realtime.Unsubscribe(client)
		return nil
	}
}
