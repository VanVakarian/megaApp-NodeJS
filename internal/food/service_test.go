package food

import (
	"context"
	"database/sql"
	"testing"
	"time"

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

type fixedFoodClock struct {
	now time.Time
}

func (c fixedFoodClock) Now() time.Time {
	return c.now
}

func (fakeEmbeddingGenerator) GenerateEmbedding(ctx context.Context, text string) ([]float64, error) {
	switch text {
	case "apple-semantic", "Apple", "Fruit":
		return []float64{1, 0}, nil
	default:
		return []float64{0, 1}, nil
	}
}

func TestGetCatalogueAndPersonalKcalsAndStats(t *testing.T) {
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

	personalKcals, err := service.GetPersonalKcalsNow(context.Background(), 1)
	if err != nil {
		t.Fatalf("GetPersonalKcalsNow() error = %v", err)
	}
	if len(personalKcals) != 2 || personalKcals[1] != 50 || personalKcals[2] != 250 {
		t.Fatalf("personalKcals = %+v, want catalogue bootstrap {1:50, 2:250}", personalKcals)
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

	restored, err := service.RestoreDiaryEntriesForDay(context.Background(), 1, "2026-06-18", []RestoreDiaryEntryInput{{
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

func testPersonalKcalConfig() PersonalKcalConfig {
	return PersonalKcalConfig{
		LookbackMonths:          3,
		DecayRate:               0.6,
		CoverageThreshold:       0,
		MaxMonthlyChangePercent: 50,
		AnchorLambda:            1,
		EvidenceHalfKcal:        100,
		CoefLogStep:             0.05,
		NormStep:                50,
		XStep:                   50,
		Population:              8,
		MaxGenerations:          10,
		MaxStale:                5,
	}
}

func TestRunPersonalKcalJobStoresHistoryAndInvalidatesStats(t *testing.T) {
	db := openFoodTestDB(t)
	seedFoodDiaryAndWeightHistory(t, db, 1)
	service := NewService(NewRepository(db))
	service.SetClock(fixedFoodClock{now: time.Date(2026, time.July, 5, 12, 0, 0, 0, time.UTC)})
	service.SetPersonalKcalConfig(testPersonalKcalConfig())

	if _, err := service.GetStats(context.Background(), 1); err != nil {
		t.Fatalf("GetStats() error = %v", err)
	}
	if _, ok := service.statsCache.Get(1); !ok {
		t.Fatal("stats cache missing before job run")
	}

	result, err := service.RunPersonalKcalJob(context.Background())
	if err != nil {
		t.Fatalf("RunPersonalKcalJob() error = %v", err)
	}
	if result.SuccessCount != 1 || result.FailedCount != 0 {
		t.Fatalf("result = %+v", result)
	}
	if result.Users[0].MonthsComputed != 1 {
		t.Fatalf("MonthsComputed = %d, want 1", result.Users[0].MonthsComputed)
	}
	if _, ok := service.statsCache.Get(1); ok {
		t.Fatal("stats cache still present after job run")
	}

	kcalHistory, err := NewRepository(db).GetPersonalKcalHistory(context.Background(), 1)
	if err != nil {
		t.Fatalf("GetPersonalKcalHistory() error = %v", err)
	}
	if len(kcalHistory) != 2 {
		t.Fatalf("len(kcalHistory) = %d, want 2 (one row per touched product)", len(kcalHistory))
	}
	normHistory, err := NewRepository(db).GetPersonalNormHistory(context.Background(), 1)
	if err != nil {
		t.Fatalf("GetPersonalNormHistory() error = %v", err)
	}
	if len(normHistory) != 1 || normHistory[0].YearMonth != "2026-06" {
		t.Fatalf("normHistory = %+v, want one 2026-06 row", normHistory)
	}

	rerun, err := service.RunPersonalKcalJob(context.Background())
	if err != nil {
		t.Fatalf("RunPersonalKcalJob() second run error = %v", err)
	}
	if rerun.Users[0].MonthsComputed != 0 {
		t.Fatalf("second run MonthsComputed = %d, want 0 (idempotent)", rerun.Users[0].MonthsComputed)
	}
}

func TestRunPersonalKcalJobProcessesAllUsers(t *testing.T) {
	db := openFoodTestDB(t)
	seedFoodDiaryAndWeightHistory(t, db, 1)
	if _, err := db.Exec(`INSERT INTO users(id, username, isAdmin) VALUES (2, 'bob', 0)`); err != nil {
		t.Fatalf("Exec() error = %v", err)
	}
	service := NewService(NewRepository(db))
	service.SetClock(fixedFoodClock{now: time.Date(2026, time.July, 5, 12, 0, 0, 0, time.UTC)})
	service.SetPersonalKcalConfig(testPersonalKcalConfig())

	result, err := service.RunPersonalKcalJob(context.Background())
	if err != nil {
		t.Fatalf("RunPersonalKcalJob() error = %v", err)
	}
	if result.ProcessedCount != 2 || result.SuccessCount != 2 || result.FailedCount != 0 {
		t.Fatalf("result = %+v", result)
	}
	if result.Users[0].MonthsComputed != 1 {
		t.Fatalf("first user MonthsComputed = %d, want 1", result.Users[0].MonthsComputed)
	}
	if result.Users[1].MonthsComputed != 0 {
		t.Fatalf("second user (no diary) MonthsComputed = %d, want 0", result.Users[1].MonthsComputed)
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

	entry, err := service.SaveProduct(context.Background(), nil, ProductInput{
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
	if entry == nil || entry.ID <= 0 {
		t.Fatalf("entry = %+v", entry)
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

func TestGetDiaryFullUpdateIgnoresRowsOutsideRequestedRange(t *testing.T) {
	db := openFoodTestDB(t)
	if _, err := db.Exec(`
		INSERT INTO foodDiary(id, dateISO, foodCatalogueId, foodWeight, history, usersId, ver, del) VALUES
			(11, '2026-06-19', 1, 120, '[{"action":"init","value":120}]', 1, 0, 0);
		INSERT INTO foodBodyWeight(dateISO, weight, usersId) VALUES ('2026-06-19', 81, 1);
	`); err != nil {
		t.Fatalf("Exec() error = %v", err)
	}
	service := NewService(NewRepository(db))

	result, err := service.GetDiaryFullUpdate(context.Background(), 1, "2026-06-17", 1)
	if err != nil {
		t.Fatalf("GetDiaryFullUpdate() error = %v", err)
	}

	if _, ok := result["2026-06-19"]; ok {
		t.Fatal("unexpected out-of-range day present")
	}
	day := result["2026-06-18"]
	if len(day.Food) != 0 {
		t.Fatalf("len(day.Food) = %d, want 0", len(day.Food))
	}
	if day.BodyWeight != nil {
		t.Fatalf("BodyWeight = %v, want nil", day.BodyWeight)
	}
}

func seedFoodDiaryAndWeightHistory(t *testing.T, db *sql.DB, userID int64) {
	t.Helper()
	if _, err := db.Exec(`
		INSERT INTO foodDiary(id, dateISO, foodCatalogueId, foodWeight, history, usersId, ver, del) VALUES
			(101, '2026-06-10', 1, 180, '[{"action":"init","value":180}]', ?, 0, 0),
			(102, '2026-06-11', 2, 140, '[{"action":"init","value":140}]', ?, 0, 0),
			(103, '2026-06-12', 1, 190, '[{"action":"init","value":190}]', ?, 0, 0),
			(104, '2026-06-13', 2, 150, '[{"action":"init","value":150}]', ?, 0, 0),
			(105, '2026-06-14', 1, 200, '[{"action":"init","value":200}]', ?, 0, 0),
			(106, '2026-06-15', 2, 160, '[{"action":"init","value":160}]', ?, 0, 0),
			(107, '2026-06-16', 1, 170, '[{"action":"init","value":170}]', ?, 0, 0);
		INSERT INTO foodBodyWeight(dateISO, weight, usersId) VALUES
			('2026-06-10', 80.8, ?),
			('2026-06-11', 80.6, ?),
			('2026-06-12', 80.4, ?),
			('2026-06-13', 80.2, ?),
			('2026-06-14', 80.1, ?),
			('2026-06-15', 79.9, ?),
			('2026-06-16', 79.8, ?);
	`, userID, userID, userID, userID, userID, userID, userID, userID, userID, userID, userID, userID, userID, userID); err != nil {
		t.Fatalf("Exec() error = %v", err)
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
		CREATE TABLE foodPersonalKcalHistory (id INTEGER PRIMARY KEY AUTOINCREMENT, usersId INTEGER NOT NULL, foodCatalogueId INTEGER NOT NULL, yearMonth TEXT NOT NULL, kcalsPer100g REAL NOT NULL, createdAt TEXT NOT NULL, UNIQUE(usersId, foodCatalogueId, yearMonth));
		CREATE TABLE foodPersonalNormHistory (id INTEGER PRIMARY KEY AUTOINCREMENT, usersId INTEGER NOT NULL, yearMonth TEXT NOT NULL, normKcals REAL NOT NULL, kcalPerKg REAL NOT NULL, createdAt TEXT NOT NULL, UNIQUE(usersId, yearMonth));

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
