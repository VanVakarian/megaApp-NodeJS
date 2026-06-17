package settings

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

func TestGetCreatesDefaultsAndReturnsUserMetadata(t *testing.T) {
	db := openSettingsTestDB(t)
	service := NewService(NewRepository(db))

	userID := insertSettingsTestUser(t, db, "alice", true)

	result, err := service.Get(context.Background(), userID, "alice")
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if result.UserName != "alice" {
		t.Fatalf("UserName = %q, want alice", result.UserName)
	}
	if !result.IsUserAdmin {
		t.Fatal("IsUserAdmin = false, want true")
	}
	if result.DarkTheme || result.SelectedChapterFood || result.SelectedChapterMoney || result.LiteVersion {
		t.Fatal("default boolean settings should be false")
	}
	if result.Height != nil {
		t.Fatalf("Height = %v, want nil", result.Height)
	}

	stored, err := NewRepository(db).GetByUserID(context.Background(), userID)
	if err != nil {
		t.Fatalf("GetByUserID() error = %v", err)
	}
	if stored == nil {
		t.Fatal("stored settings = nil, want row")
	}
}

func TestPutUpdatesSingleSetting(t *testing.T) {
	db := openSettingsTestDB(t)
	service := NewService(NewRepository(db))
	userID := insertSettingsTestUser(t, db, "alice", false)

	if err := service.Put(context.Background(), userID, map[string]any{"darkTheme": true}); err != nil {
		t.Fatalf("Put() error = %v", err)
	}

	result, err := service.Get(context.Background(), userID, "alice")
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if !result.DarkTheme {
		t.Fatal("DarkTheme = false, want true")
	}
}

func TestPutRejectsInvalidField(t *testing.T) {
	db := openSettingsTestDB(t)
	service := NewService(NewRepository(db))
	userID := insertSettingsTestUser(t, db, "alice", false)

	if err := service.Put(context.Background(), userID, map[string]any{"userName": "bob"}); err != ErrInvalidSetting {
		t.Fatalf("Put() error = %v, want ErrInvalidSetting", err)
	}
}

func TestPostUpsertsSettings(t *testing.T) {
	db := openSettingsTestDB(t)
	service := NewService(NewRepository(db))
	userID := insertSettingsTestUser(t, db, "alice", false)
	height := int64(185)

	if err := service.Post(context.Background(), userID, UserSettings{
		DarkTheme:            true,
		SelectedChapterFood:  true,
		SelectedChapterMoney: false,
		LiteVersion:          true,
		Height:               &height,
	}); err != nil {
		t.Fatalf("Post() error = %v", err)
	}

	result, err := service.Get(context.Background(), userID, "alice")
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if !result.DarkTheme || !result.SelectedChapterFood || !result.LiteVersion {
		t.Fatal("stored settings mismatch")
	}
	if result.Height == nil || *result.Height != 185 {
		t.Fatalf("Height = %v, want 185", result.Height)
	}
}

func openSettingsTestDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("sql.Open() error = %v", err)
	}

	if _, err := db.Exec(`
		CREATE TABLE users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT,
			hashedPassword TEXT,
			isAdmin BOOLEAN
		);

		CREATE TABLE settings (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			usersId INTEGER,
			darkTheme BOOLEAN,
			selectedChapterFood BOOLEAN,
			selectedChapterMoney BOOLEAN,
			liteVersion BOOLEAN,
			height INTEGER,
			sex TEXT DEFAULT NULL,
			birthDate TEXT DEFAULT NULL,
			activityLevel TEXT DEFAULT NULL,
			goal TEXT DEFAULT NULL
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

func insertSettingsTestUser(t *testing.T, db *sql.DB, username string, isAdmin bool) int64 {
	t.Helper()

	result, err := db.Exec(`INSERT INTO users (username, hashedPassword, isAdmin) VALUES (?, ?, ?)`, username, "hash", isAdmin)
	if err != nil {
		t.Fatalf("Exec() error = %v", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		t.Fatalf("LastInsertId() error = %v", err)
	}

	return id
}
