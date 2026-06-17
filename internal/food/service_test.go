package food

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

func TestGetCatalogueAndCoefficientsAndStats(t *testing.T) {
	db := openFoodTestDB(t)
	repo := NewRepository(db)
	service := NewService(repo)

	catalogue, err := service.GetCatalogue(context.Background())
	if err != nil {
		t.Fatalf("GetCatalogue() error = %v", err)
	}
	if len(catalogue) != 2 {
		t.Fatalf("len(catalogue) = %d, want 2", len(catalogue))
	}

	entry, err := service.GetCatalogueEntry(context.Background(), 2)
	if err != nil {
		t.Fatalf("GetCatalogueEntry() error = %v", err)
	}
	if entry == nil || entry.CanDelete == nil || *entry.CanDelete {
		t.Fatalf("entry.CanDelete = %v, want false", entry)
	}

	coefficients, err := service.GetCoefficients(context.Background(), 1)
	if err != nil {
		t.Fatalf("GetCoefficients() error = %v", err)
	}
	if len(coefficients) != 2 || coefficients[1] != 1 || coefficients[2] != 1 {
		t.Fatalf("coefficients = %+v", coefficients)
	}

	stats, err := service.GetStats(context.Background(), 1)
	if err != nil {
		t.Fatalf("GetStats() error = %v", err)
	}
	if len(stats) == 0 {
		t.Fatal("stats is empty")
	}
}

func TestGetDiaryFullUpdateReturnsFoodAndNutrients(t *testing.T) {
	db := openFoodTestDB(t)
	service := NewService(NewRepository(db))

	result, err := service.GetDiaryFullUpdate(context.Background(), 1, "2026-06-17", 1)
	if err != nil {
		t.Fatalf("GetDiaryFullUpdate() error = %v", err)
	}

	day, ok := result["2026-06-17"]
	if !ok {
		t.Fatal("day not found")
	}
	if len(day.Food) != 1 {
		t.Fatalf("len(day.Food) = %d, want 1", len(day.Food))
	}
	if day.BodyWeight == nil || *day.BodyWeight != 80 {
		t.Fatalf("BodyWeight = %v, want 80", day.BodyWeight)
	}
	if day.Nutrients.ConsumedKcals == 250 {
		return
	}
	if day.Nutrients.ConsumedKcals != 250 {
		t.Fatalf("ConsumedKcals = %d, want 250", day.Nutrients.ConsumedKcals)
	}
}

func openFoodTestDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("sql.Open() error = %v", err)
	}

	if _, err := db.Exec(`
		CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, hashedPassword TEXT, isAdmin BOOLEAN);
		CREATE TABLE settings (id INTEGER PRIMARY KEY AUTOINCREMENT, usersId INTEGER, goal TEXT, darkTheme BOOLEAN, selectedChapterFood BOOLEAN, selectedChapterMoney BOOLEAN, liteVersion BOOLEAN, height INTEGER);
		CREATE TABLE foodSettings (id INTEGER PRIMARY KEY AUTOINCREMENT, height INTEGER, useCoeffs BOOLEAN, coefficients TEXT, usersId INTEGER);
		CREATE TABLE foodCatalogue (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, kcals INTEGER, protein REAL, fat REAL, carbs REAL, fiber REAL, description TEXT, legacyName TEXT);
		CREATE TABLE foodDiary (id INTEGER PRIMARY KEY AUTOINCREMENT, dateISO TEXT, foodCatalogueId INTEGER, foodWeight INTEGER, history TEXT, usersId INTEGER, ver INTEGER, del BOOLEAN);
		CREATE TABLE foodBodyWeight (id INTEGER PRIMARY KEY AUTOINCREMENT, dateISO TEXT, weight NUMERIC, usersId INTEGER);

		INSERT INTO users(id, username, isAdmin) VALUES (1, 'alice', 0);
		INSERT INTO settings(usersId, goal, darkTheme, selectedChapterFood, selectedChapterMoney, liteVersion, height) VALUES (1, 'lose', 0, 1, 0, 0, 180);
		INSERT INTO foodCatalogue(id, name, kcals, protein, fat, carbs, fiber, description, legacyName) VALUES
			(1, 'Apple', 50, 1, 0, 10, 2, 'Fruit', 'Apple'),
			(2, 'Bread', 250, 9, 2, 49, 3, 'Bread', 'Bread');
		INSERT INTO foodDiary(id, dateISO, foodCatalogueId, foodWeight, history, usersId, ver, del) VALUES
			(10, '2026-06-17', 2, 100, '[{"action":"init","value":100}]', 1, 0, 0);
		INSERT INTO foodBodyWeight(dateISO, weight, usersId) VALUES ('2026-06-17', 80, 1);
	`); err != nil {
		_ = db.Close()
		t.Fatalf("Exec() error = %v", err)
	}

	t.Cleanup(func() { _ = db.Close() })
	return db
}
