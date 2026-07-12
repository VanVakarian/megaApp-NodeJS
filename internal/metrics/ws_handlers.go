package metrics

import (
	"context"

	"megaapp-back/internal/ws"
)

func NewSubscribeHandler(service *Service, realtime *Realtime) ws.MessageHandler {
	return func(client *ws.Client, _ map[string]any) error {
		ctx := context.Background()

		isAdmin, err := service.IsAdmin(ctx, client.UserID())
		if err != nil {
			return err
		}
		if !isAdmin {
			return nil
		}

		realtime.Subscribe(client)
		return nil
	}
}

func NewUnsubscribeHandler(realtime *Realtime) ws.MessageHandler {
	return func(client *ws.Client, _ map[string]any) error {
		realtime.Unsubscribe(client)
		return nil
	}
}
