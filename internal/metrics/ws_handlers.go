package metrics

import (
	"context"

	"megaapp-back/internal/ws"
)

func NewSubscribeHandler(service *Service, realtime *Realtime, flatlineClient *FlatlineClient) ws.MessageHandler {
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

		var cursor int64
		if rawCursor, ok := message["cursor"].(float64); ok {
			cursor = int64(rawCursor)
		}

		points, err := flatlineClient.Since(ctx, cursor)
		if err != nil {
			return err
		}

		return client.SendJSON(map[string]any{
			"type":    "METRICS_UPDATE",
			"payload": DetailUpdate{Points: points},
		})
	}
}

func NewUnsubscribeHandler(realtime *Realtime) ws.MessageHandler {
	return func(client *ws.Client, _ map[string]any) error {
		realtime.Unsubscribe(client)
		return nil
	}
}
