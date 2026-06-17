package settings

import (
	"context"
	"errors"
	"fmt"
)

var ErrInvalidSetting = errors.New("invalid setting name")
var ErrInvalidSettingPayload = errors.New("request body must contain exactly one setting")

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) Get(ctx context.Context, userID int64, fallbackUserName string) (UserSettings, error) {
	stored, err := s.repo.GetByUserID(ctx, userID)
	if err != nil {
		return UserSettings{}, err
	}
	if stored == nil {
		stored = defaultStoredSettings()
		if err := s.repo.Upsert(ctx, userID, *stored); err != nil {
			return UserSettings{}, err
		}
	}

	isAdmin, userName, err := s.repo.GetUserAdminAndName(ctx, userID)
	if err != nil {
		return UserSettings{}, err
	}
	if userName == "" {
		userName = fallbackUserName
	}

	return UserSettings{
		SelectedChapterFood:  stored.SelectedChapterFood,
		SelectedChapterMoney: stored.SelectedChapterMoney,
		DarkTheme:            stored.DarkTheme,
		LiteVersion:          stored.LiteVersion,
		Height:               stored.Height,
		UserName:             userName,
		IsUserAdmin:          isAdmin,
	}, nil
}

func (s *Service) Put(ctx context.Context, userID int64, payload map[string]any) error {
	stored, err := s.repo.GetByUserID(ctx, userID)
	if err != nil {
		return err
	}
	if stored == nil {
		stored = defaultStoredSettings()
	}

	if len(payload) != 1 {
		return ErrInvalidSettingPayload
	}

	for key, value := range payload {
		switch key {
		case "darkTheme":
			parsed, ok := value.(bool)
			if !ok {
				return fmt.Errorf("invalid darkTheme value")
			}
			stored.DarkTheme = parsed
		case "selectedChapterFood":
			parsed, ok := value.(bool)
			if !ok {
				return fmt.Errorf("invalid selectedChapterFood value")
			}
			stored.SelectedChapterFood = parsed
		case "selectedChapterMoney":
			parsed, ok := value.(bool)
			if !ok {
				return fmt.Errorf("invalid selectedChapterMoney value")
			}
			stored.SelectedChapterMoney = parsed
		case "liteVersion":
			parsed, ok := value.(bool)
			if !ok {
				return fmt.Errorf("invalid liteVersion value")
			}
			stored.LiteVersion = parsed
		case "height":
			parsed, ok := parseHeight(value)
			if !ok {
				return fmt.Errorf("invalid height value")
			}
			stored.Height = parsed
		default:
			return ErrInvalidSetting
		}
	}

	return s.repo.Upsert(ctx, userID, *stored)
}

func (s *Service) Post(ctx context.Context, userID int64, request UserSettings) error {
	return s.repo.Upsert(ctx, userID, StoredSettings{
		SelectedChapterFood:  request.SelectedChapterFood,
		SelectedChapterMoney: request.SelectedChapterMoney,
		DarkTheme:            request.DarkTheme,
		LiteVersion:          request.LiteVersion,
		Height:               request.Height,
	})
}

func defaultStoredSettings() *StoredSettings {
	return &StoredSettings{}
}

func parseHeight(value any) (*int64, bool) {
	switch typed := value.(type) {
	case nil:
		return nil, true
	case float64:
		parsed := int64(typed)
		if float64(parsed) != typed {
			return nil, false
		}
		return &parsed, true
	case int:
		parsed := int64(typed)
		return &parsed, true
	case int64:
		parsed := typed
		return &parsed, true
	}

	return nil, false
}
