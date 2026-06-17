package food

import (
	"context"
	"time"

	"megaapp-back/internal/ws"
)

func NewSearchWSHandler(service *Service) ws.MessageHandler {
	return func(client *ws.Client, message map[string]any) error {
		query, _ := message["query"].(string)
		sequenceNumber := int64(0)
		switch typed := message["sequenceNumber"].(type) {
		case float64:
			sequenceNumber = int64(typed)
		case int64:
			sequenceNumber = typed
		case int:
			sequenceNumber = int64(typed)
		}

		ids, err := service.SearchCatalogueRealtime(context.Background(), query)
		if err != nil {
			return err
		}

		return client.SendJSON(map[string]any{
			"type": "SEARCH_RESULTS",
			"payload": map[string]any{
				"query":          query,
				"catalogueIds":   ids,
				"timestamp":      time.Now().UnixMilli(),
				"sequenceNumber": sequenceNumber,
			},
		})
	}
}
