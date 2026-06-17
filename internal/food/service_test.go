package food

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

type fakeProductGenerator struct{}

var fakeGeneratedProductPreview = ProductPreviewData{
	GeneralizedName: "Новый продукт",
	Kcals:           123,
	Protein:         4.5,
	Fat:             6.7,
	Carbs:           8.9,
	Fiber:           1.2,
	Description:     "Новый продукт для теста",
	Confidence:      0.9,
}

var fakeVoiceProductPreview = ProductPreviewData{
	GeneralizedName: "Яблоко",
	Kcals:           50,
	Protein:         1,
	Fat:             0,
	Carbs:           10,
	Fiber:           2,
	Description:     "Fruit",
	Confidence:      0.9,
}

func (fakeProductGenerator) GenerateProduct(ctx context.Context, description string) (ProductPreviewData, error) {
	return fakeGeneratedProductPreview, nil
}

func (fakeProductGenerator) AnalyzeVoice(ctx context.Context, transcript string) (ProductPreviewData, error) {
	return fakeVoiceProductPreview, nil
}

type fakeEmbeddingGenerator struct{}

func (fakeEmbeddingGenerator) GenerateEmbedding(ctx context.Context, text string) ([]float64, error) {
	switch text {
	case "apple-semantic", "Apple", "Fruit":
		return []float64{1, 0}, nil
	default:
		return []float64{0, 1}, nil
	}
}

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

func TestWriteOperationsPersistData(t *testing.T) {
	db := openFoodTestDB(t)
	service := NewService(NewRepository(db))

	created, err := service.CreateDiaryEntry(context.Background(), 1, "2026-06-18", 1, 120, []HistoryEntry{{Action: "init", Value: 120}})
	if err != nil {
		t.Fatalf("CreateDiaryEntry() error = %v", err)
	}
	if created.ID <= 0 {
		t.Fatalf("created.ID = %d, want > 0", created.ID)
	}

	updated, err := service.EditDiaryEntry(context.Background(), 1, 10, 80, HistoryEntry{Action: "set", Value: 80})
	if err != nil {
		t.Fatalf("EditDiaryEntry() error = %v", err)
	}
	if updated == nil || updated.FoodWeight != 80 || len(updated.History) != 2 {
		t.Fatalf("updated = %+v", updated)
	}

	ok, err := service.SetBodyWeight(context.Background(), 1, "2026-06-18", 81)
	if err != nil {
		t.Fatalf("SetBodyWeight() error = %v", err)
	}
	if !ok {
		t.Fatal("SetBodyWeight() = false, want true")
	}

	deletedCount, err := service.DeleteDiaryEntriesForDay(context.Background(), 1, "2026-06-18")
	if err != nil {
		t.Fatalf("DeleteDiaryEntriesForDay() error = %v", err)
	}
	if deletedCount != 1 {
		t.Fatalf("deletedCount = %d, want 1", deletedCount)
	}

	restored, err := service.RestoreDiaryEntriesForDay(context.Background(), 1, "2026-06-18", []createDiaryEntryRequest{{
		FoodCatalogueID: 1,
		FoodWeight:      120,
		History:         []HistoryEntry{{Action: "init", Value: 120}},
	}})
	if err != nil {
		t.Fatalf("RestoreDiaryEntriesForDay() error = %v", err)
	}
	if len(restored) != 1 || restored[0].ID <= 0 {
		t.Fatalf("restored = %+v", restored)
	}

	deleted, err := service.DeleteDiaryEntry(context.Background(), 1, 10)
	if err != nil {
		t.Fatalf("DeleteDiaryEntry() error = %v", err)
	}
	if !deleted {
		t.Fatal("DeleteDiaryEntry() = false, want true")
	}
}

func TestGetCoefficientsRepairsInvalidValues(t *testing.T) {
	db := openFoodTestDB(t)
	if _, err := db.Exec(`INSERT INTO foodSettings(usersId, coefficients) VALUES (1, '{"1":0,"2":-3,"999":2}')`); err != nil {
		t.Fatalf("Exec() error = %v", err)
	}

	service := NewService(NewRepository(db))
	coefficients, err := service.GetCoefficients(context.Background(), 1)
	if err != nil {
		t.Fatalf("GetCoefficients() error = %v", err)
	}
	if len(coefficients) != 2 {
		t.Fatalf("len(coefficients) = %d, want 2", len(coefficients))
	}
	if coefficients[1] != 1 || coefficients[2] != 1 {
		t.Fatalf("coefficients = %+v, want defaults repaired", coefficients)
	}
}

func TestStatsCacheInvalidatesAfterWrites(t *testing.T) {
	db := openFoodTestDB(t)
	service := NewService(NewRepository(db))

	before, err := service.GetStats(context.Background(), 1)
	if err != nil {
		t.Fatalf("GetStats() error = %v", err)
	}
	beforeValue, ok := before["2026-06-17"]
	if !ok {
		t.Fatal("before stats missing 2026-06-17")
	}
	beforeKcals, ok := beforeValue[2].(float64)
	if !ok {
		t.Fatalf("before stats = %+v, want factual kcals", beforeValue)
	}

	if _, err := service.CreateDiaryEntry(context.Background(), 1, "2026-06-17", 1, 100, []HistoryEntry{{Action: "init", Value: 100}}); err != nil {
		t.Fatalf("CreateDiaryEntry() error = %v", err)
	}

	after, err := service.GetStats(context.Background(), 1)
	if err != nil {
		t.Fatalf("GetStats() error = %v", err)
	}
	afterValue, ok := after["2026-06-17"]
	if !ok {
		t.Fatal("after stats missing 2026-06-17")
	}
	afterKcals, ok := afterValue[2].(float64)
	if !ok {
		t.Fatalf("after stats = %+v, want factual kcals", afterValue)
	}
	if afterKcals <= beforeKcals {
		t.Fatalf("afterKcals = %v, want > %v", afterKcals, beforeKcals)
	}
}

func TestSearchPreviewAndSaveProduct(t *testing.T) {
	db := openFoodTestDB(t)
	service := NewService(NewRepository(db))
	service.SetProductGenerator(fakeProductGenerator{})
	service.SetEmbeddingGenerator(fakeEmbeddingGenerator{})

	results, err := service.SearchCatalogue(context.Background(), "apple-semantic")
	if err != nil {
		t.Fatalf("SearchCatalogue() error = %v", err)
	}
	if len(results) == 0 || results[0].Name != "Apple" {
		t.Fatalf("results = %+v, want Apple first", results)
	}

	preview, err := service.GenerateProductPreview(context.Background(), "Apple")
	if err != nil {
		t.Fatalf("GenerateProductPreview() error = %v", err)
	}
	if preview != fakeGeneratedProductPreview {
		t.Fatalf("preview = %+v", preview)
	}

	entry, statusCode, err := service.SaveProduct(context.Background(), nil, ProductInput{
		Name:        "Orange",
		Kcals:       47,
		Protein:     1,
		Fat:         0,
		Carbs:       12,
		Fiber:       2,
		Description: "Orange fruit",
	})
	if err != nil {
		t.Fatalf("SaveProduct() error = %v", err)
	}
	if statusCode != 201 || entry == nil || entry.ID <= 0 {
		t.Fatalf("entry = %+v, statusCode = %d", entry, statusCode)
	}

	deleted, err := service.DeleteProduct(context.Background(), entry.ID)
	if err != nil {
		t.Fatalf("DeleteProduct() error = %v", err)
	}
	if !deleted {
		t.Fatal("DeleteProduct() = false, want true")
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
		CREATE TABLE foodCatalogue (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, kcals INTEGER, protein REAL, fat REAL, carbs REAL, fiber REAL, description TEXT, legacyName TEXT, nameVec BLOB, descriptionVec BLOB);
		CREATE TABLE foodDiary (id INTEGER PRIMARY KEY AUTOINCREMENT, dateISO TEXT, foodCatalogueId INTEGER, foodWeight INTEGER, history TEXT, usersId INTEGER, ver INTEGER, del BOOLEAN);
		CREATE TABLE foodBodyWeight (id INTEGER PRIMARY KEY AUTOINCREMENT, dateISO TEXT, weight NUMERIC, usersId INTEGER);
		CREATE TABLE foodSearchQueryEmbeddings (query TEXT PRIMARY KEY, embedding BLOB, hitCount INTEGER, lastUsedAt INTEGER, createdAt INTEGER);

		INSERT INTO users(id, username, isAdmin) VALUES (1, 'alice', 0);
		INSERT INTO settings(usersId, goal, darkTheme, selectedChapterFood, selectedChapterMoney, liteVersion, height) VALUES (1, 'lose', 0, 1, 0, 0, 180);
		INSERT INTO foodCatalogue(id, name, kcals, protein, fat, carbs, fiber, description, legacyName, nameVec, descriptionVec) VALUES
			(1, 'Apple', 50, 1, 0, 10, 2, 'Fruit', 'Apple', X'0000803F00000000', X'0000803F00000000'),
			(2, 'Bread', 250, 9, 2, 49, 3, 'Bread', 'Bread', X'000000000000803F', X'000000000000803F');
		INSERT INTO foodDiary(id, dateISO, foodCatalogueId, foodWeight, history, usersId, ver, del) VALUES
			(10, '2026-06-17', 2, 100, '[{"action":"init","value":100}]', 1, 0, 0);
		INSERT INTO foodBodyWeight(dateISO, weight, usersId) VALUES ('2026-06-17', 80, 1);
		INSERT INTO foodSearchQueryEmbeddings(query, embedding, hitCount, lastUsedAt, createdAt) VALUES ('apple-semantic', X'0000803F00000000', 1, 0, 0);
	`); err != nil {
		_ = db.Close()
		t.Fatalf("Exec() error = %v", err)
	}

	t.Cleanup(func() { _ = db.Close() })
	return db
}
