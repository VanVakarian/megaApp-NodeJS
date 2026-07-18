package food

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"sync"
	"time"

	"megaapp-back/internal/httpx/legacy"
	clockplatform "megaapp-back/internal/platform/clock"
)

const kcalsIn1KG = 7700

type Service struct {
	repo                   *Repository
	statsCache             *StatsCache
	searchCache            *SearchCache
	productGenerator       ProductGenerator
	embeddingGenerator     EmbeddingGenerator
	imageAnalyzer          ImageAnalyzer
	imageGenerationRequest ImageGenerationRequester
	imageVersions          ImageVersionProvider
	clock                  clockplatform.Clock
	personalKcalConfig     PersonalKcalConfig
	personalKcalRunMu      sync.Mutex
	personalKcalJobActive  bool
}

type DiaryEntry struct {
	ID                  int64          `json:"id"`
	DateISO             string         `json:"dateISO"`
	FoodCatalogueID     int64          `json:"foodCatalogueId"`
	FoodWeight          int64          `json:"foodWeight"`
	Kcals               int64          `json:"kcals"`
	History             []HistoryEntry `json:"history"`
	AppliedHistoryEntry *HistoryEntry  `json:"-"`
}

const (
	historyActionInit     = "init"
	historyActionSet      = "set"
	historyActionAdd      = "add"
	historyActionSubtract = "subtract"
)

type RestoreDiaryEntryInput struct {
	FoodCatalogueID int64
	FoodWeight      int64
	History         []HistoryEntry
}

type HistoryEntry struct {
	Action string `json:"action"`
	Value  int64  `json:"value"`
}

type DayNutrients struct {
	TargetKcals     *int64 `json:"targetKcals"`
	ConsumedKcals   int64  `json:"consumedKcals"`
	TargetProtein   int64  `json:"targetProtein"`
	TargetFat       int64  `json:"targetFat"`
	TargetCarbs     int64  `json:"targetCarbs"`
	TargetFiber     int64  `json:"targetFiber"`
	ConsumedProtein int64  `json:"consumedProtein"`
	ConsumedFat     int64  `json:"consumedFat"`
	ConsumedCarbs   int64  `json:"consumedCarbs"`
	ConsumedFiber   int64  `json:"consumedFiber"`
}

type DiaryDay struct {
	Food       map[int64]DiaryEntry `json:"food"`
	BodyWeight *float64             `json:"bodyWeight"`
	Nutrients  DayNutrients         `json:"nutrients"`
}

type CatalogueEntry struct {
	ID           int64   `json:"id"`
	Name         string  `json:"name"`
	LegacyName   *string `json:"legacyName,omitempty"`
	Kcals        int64   `json:"kcals"`
	Protein      float64 `json:"protein"`
	Fat          float64 `json:"fat"`
	Carbs        float64 `json:"carbs"`
	Fiber        float64 `json:"fiber"`
	Description  string  `json:"description"`
	ImageVersion *int64  `json:"imageVersion,omitempty"`
	CanDelete    *bool   `json:"canDelete,omitempty"`
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo, statsCache: NewStatsCache(), searchCache: NewSearchCache(), clock: clockplatform.NewRealClock(), personalKcalConfig: DefaultPersonalKcalConfig()}
}

func (s *Service) SetProductGenerator(generator ProductGenerator) {
	s.productGenerator = generator
}

func (s *Service) SetEmbeddingGenerator(generator EmbeddingGenerator) {
	s.embeddingGenerator = generator
}

func (s *Service) SetImageAnalyzer(analyzer ImageAnalyzer) {
	s.imageAnalyzer = analyzer
}

func (s *Service) SetImageGenerationRequester(requester ImageGenerationRequester) {
	s.imageGenerationRequest = requester
}

func (s *Service) SetImageVersionProvider(provider ImageVersionProvider) {
	s.imageVersions = provider
}

func (s *Service) SetClock(clk clockplatform.Clock) {
	if clk == nil {
		return
	}

	s.clock = clk
}

// buildPersonalKcalResolver loads a user's full personal-kcal history (and the shared
// catalogue) once and returns a resolver that can answer "applied value as of month X" for
// any product/norm/X without further DB round-trips (§7.1, §7.3).
func (s *Service) buildPersonalKcalResolver(ctx context.Context, userID int64) (*PersonalKcalResolver, error) {
	firstDate, err := s.repo.GetUserFirstDate(ctx, userID)
	if err != nil {
		return nil, err
	}
	catalogueRows, err := s.repo.GetCatalogue(ctx)
	if err != nil {
		return nil, err
	}
	catalogueKcals := make(map[int64]float64, len(catalogueRows))
	for _, row := range catalogueRows {
		catalogueKcals[row.ID] = float64(row.Kcals)
	}
	kcalHistoryRows, err := s.repo.GetPersonalKcalHistory(ctx, userID)
	if err != nil {
		return nil, err
	}
	normHistoryRows, err := s.repo.GetPersonalNormHistory(ctx, userID)
	if err != nil {
		return nil, err
	}

	currentYearMonth := s.clock.Now().UTC().Format("2006-01")
	firstYearMonth := currentYearMonth
	if firstDate != "" {
		firstYearMonth = firstDate[:7]
	}
	allMonths := sequentialYearMonths(firstYearMonth, currentYearMonth)
	return NewPersonalKcalResolver(allMonths, catalogueKcals, kcalHistoryRows, normHistoryRows, s.personalKcalConfig), nil
}

// GetPersonalKcalsNow is the direct replacement for GetCoefficients: a complete
// catalogueId->kcal/100g map for the CURRENT month, used only for live client-side preview of
// an unsaved diary entry (§7.3, §7.4) — every other consumer resolves "at the entry's own
// month" through the resolver instead.
func (s *Service) GetPersonalKcalsNow(ctx context.Context, userID int64) (map[int64]float64, error) {
	resolver, err := s.buildPersonalKcalResolver(ctx, userID)
	if err != nil {
		return nil, err
	}
	currentYearMonth := s.clock.Now().UTC().Format("2006-01")
	return resolver.AppliedKcalsNow(currentYearMonth), nil
}

func (s *Service) GetDiaryFullUpdate(ctx context.Context, userID int64, dateISO string, offsetDays int) (map[string]DiaryDay, error) {
	dates := getDateRange(dateISO, offsetDays)
	startDate, endDate := getStartAndEndDates(dateISO, offsetDays)
	result := make(map[string]DiaryDay, len(dates))
	for _, date := range dates {
		result[date] = DiaryDay{Food: map[int64]DiaryEntry{}}
	}

	diaryRows, err := s.repo.GetDiaryRange(ctx, userID, startDate, endDate)
	if err != nil {
		return nil, err
	}
	weights, err := s.repo.GetWeightRange(ctx, userID, startDate, endDate)
	if err != nil {
		return nil, err
	}
	stats, err := s.GetStats(ctx, userID)
	if err != nil {
		return nil, err
	}
	goal, err := s.repo.GetUserGoal(ctx, userID)
	if err != nil {
		return nil, err
	}
	if goal == "" {
		goal = "lose"
	}
	catalogue, err := s.GetCatalogue(ctx)
	if err != nil {
		return nil, err
	}
	resolver, err := s.buildPersonalKcalResolver(ctx, userID)
	if err != nil {
		return nil, err
	}

	catalogueMap := make(map[int64]CatalogueEntry, len(catalogue))
	for id, entry := range catalogue {
		catalogueMap[id] = entry
	}

	for _, row := range diaryRows {
		day, ok := result[row.DateISO]
		if !ok {
			continue
		}
		if day.Food == nil {
			day.Food = map[int64]DiaryEntry{}
		}
		day.Food[row.ID] = DiaryEntry{
			ID:              row.ID,
			DateISO:         row.DateISO,
			FoodCatalogueID: row.FoodCatalogueID,
			FoodWeight:      row.FoodWeight,
			Kcals:           resolvePersonalKcalsForEntry(resolver, row.FoodCatalogueID, row.DateISO, row.FoodWeight),
			History:         parseHistory(row.History),
		}
		result[row.DateISO] = day
	}

	bodyWeightMap := make(map[string]float64, len(weights))
	for _, row := range weights {
		day, ok := result[row.DateISO]
		if !ok {
			continue
		}
		bodyWeightMap[row.DateISO] = row.Weight
		weight := row.Weight
		day.BodyWeight = &weight
		result[row.DateISO] = day
	}

	targetKcals := buildTargetKcalsForRange(dates, stats)
	targetNutrients := calculateTargetNutrientsForRange(dates, bodyWeightMap, stats, goal, targetKcals)
	consumedNutrients := calculateConsumedNutrientsForRange(dates, result, catalogueMap)
	consumedKcals := calculateConsumedKcalsForRange(dates, result)

	for _, date := range dates {
		day := result[date]
		target := targetNutrients[date]
		consumed := consumedNutrients[date]
		day.Nutrients = DayNutrients{
			TargetKcals:     targetKcals[date],
			ConsumedKcals:   consumedKcals[date],
			TargetProtein:   target.TargetProtein,
			TargetFat:       target.TargetFat,
			TargetCarbs:     target.TargetCarbs,
			TargetFiber:     target.TargetFiber,
			ConsumedProtein: consumed.Protein,
			ConsumedFat:     consumed.Fat,
			ConsumedCarbs:   consumed.Carbs,
			ConsumedFiber:   consumed.Fiber,
		}
		result[date] = day
	}

	return result, nil
}

func (s *Service) GetCatalogue(ctx context.Context) (map[int64]CatalogueEntry, error) {
	rows, err := s.repo.GetCatalogue(ctx)
	if err != nil {
		return nil, err
	}

	result := make(map[int64]CatalogueEntry, len(rows))
	for _, row := range rows {
		result[row.ID] = CatalogueEntry{
			ID:           row.ID,
			Name:         row.Name,
			LegacyName:   nullableStringPtr(row.LegacyName),
			Kcals:        row.Kcals,
			Protein:      nullableFloat64Value(row.Protein),
			Fat:          nullableFloat64Value(row.Fat),
			Carbs:        nullableFloat64Value(row.Carbs),
			Fiber:        nullableFloat64Value(row.Fiber),
			Description:  nullableStringValue(row.Description),
			ImageVersion: s.imageVersion(row.ID),
		}
	}

	return result, nil
}

func (s *Service) GetCatalogueEntry(ctx context.Context, catalogueID int64) (*CatalogueEntry, error) {
	row, err := s.repo.GetCatalogueEntry(ctx, catalogueID)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, nil
	}

	count, err := s.repo.CountDiaryEntriesByCatalogueID(ctx, catalogueID)
	if err != nil {
		return nil, err
	}
	canDelete := count == 0

	return &CatalogueEntry{
		ID:           row.ID,
		Name:         row.Name,
		LegacyName:   nullableStringPtr(row.LegacyName),
		Kcals:        row.Kcals,
		Protein:      nullableFloat64Value(row.Protein),
		Fat:          nullableFloat64Value(row.Fat),
		Carbs:        nullableFloat64Value(row.Carbs),
		Fiber:        nullableFloat64Value(row.Fiber),
		Description:  nullableStringValue(row.Description),
		ImageVersion: s.imageVersion(row.ID),
		CanDelete:    &canDelete,
	}, nil
}

func (s *Service) imageVersion(catalogueID int64) *int64 {
	if s.imageVersions == nil {
		return nil
	}
	return s.imageVersions.ImageVersion(catalogueID)
}

func (s *Service) CreateDiaryEntry(ctx context.Context, userID int64, dateISO string, foodCatalogueID int64, foodWeight int64, history []HistoryEntry) (DiaryEntry, error) {
	historyJSON, err := toHistoryJSON(history)
	if err != nil {
		return DiaryEntry{}, err
	}
	id, err := s.repo.CreateDiaryEntry(ctx, userID, dateISO, foodCatalogueID, foodWeight, historyJSON)
	if err != nil {
		return DiaryEntry{}, err
	}
	kcals, err := s.resolvePersonalKcalsForCurrentMonth(ctx, userID, foodCatalogueID, foodWeight)
	if err != nil {
		return DiaryEntry{}, err
	}
	s.InvalidateStats(userID)
	return DiaryEntry{ID: id, DateISO: dateISO, FoodCatalogueID: foodCatalogueID, FoodWeight: foodWeight, Kcals: kcals, History: history}, nil
}

func (s *Service) EditDiaryEntry(ctx context.Context, userID int64, diaryID int64, targetFoodWeight int64, requestedAction string) (*DiaryEntry, error) {
	tx, existing, err := s.repo.BeginEditDiaryEntry(ctx, diaryID, userID)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, nil
	}

	delta := targetFoodWeight - existing.FoodWeight
	if delta == 0 {
		if err := tx.Rollback(); err != nil {
			return nil, fmt.Errorf("rollback no-op diary edit: %w", err)
		}
		kcals, err := s.resolvePersonalKcalsForCurrentMonth(ctx, userID, existing.FoodCatalogueID, existing.FoodWeight)
		if err != nil {
			return nil, err
		}
		return &DiaryEntry{ID: diaryID, FoodCatalogueID: existing.FoodCatalogueID, FoodWeight: existing.FoodWeight, Kcals: kcals, History: parseHistory(existing.History)}, nil
	}

	appliedEntry := buildHistoryEntry(requestedAction, targetFoodWeight, delta)
	history := append(parseHistory(existing.History), appliedEntry)

	updatedHistoryJSON, err := toHistoryJSON(history)
	if err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if err := s.repo.CommitEditDiaryEntry(ctx, tx, diaryID, userID, targetFoodWeight, updatedHistoryJSON); err != nil {
		return nil, err
	}

	kcals, err := s.resolvePersonalKcalsForCurrentMonth(ctx, userID, existing.FoodCatalogueID, targetFoodWeight)
	if err != nil {
		return nil, err
	}
	s.InvalidateStats(userID)
	return &DiaryEntry{ID: diaryID, FoodCatalogueID: existing.FoodCatalogueID, FoodWeight: targetFoodWeight, Kcals: kcals, History: history, AppliedHistoryEntry: &appliedEntry}, nil
}

func buildHistoryEntry(requestedAction string, targetFoodWeight int64, delta int64) HistoryEntry {
	if requestedAction == historyActionSet {
		return HistoryEntry{Action: historyActionSet, Value: targetFoodWeight}
	}
	if delta > 0 {
		return HistoryEntry{Action: historyActionAdd, Value: delta}
	}
	return HistoryEntry{Action: historyActionSubtract, Value: -delta}
}

func (s *Service) resolvePersonalKcalsForCurrentMonth(ctx context.Context, userID int64, foodCatalogueID int64, foodWeight int64) (int64, error) {
	resolver, err := s.buildPersonalKcalResolver(ctx, userID)
	if err != nil {
		return 0, err
	}
	nowISO := s.clock.Now().UTC().Format("2006-01-02")
	return resolvePersonalKcalsForEntry(resolver, foodCatalogueID, nowISO, foodWeight), nil
}

func resolvePersonalKcalsForEntry(resolver *PersonalKcalResolver, foodCatalogueID int64, dateISO string, foodWeight int64) int64 {
	kcalPer100g := resolver.AppliedKcal(foodCatalogueID, dateISO[:7])
	return int64(math.Round(kcalPer100g * float64(foodWeight) / 100))
}

func (s *Service) DeleteDiaryEntry(ctx context.Context, userID int64, diaryID int64) (bool, error) {
	deleted, err := s.repo.DeleteDiaryEntry(ctx, diaryID, userID)
	if err != nil {
		return false, err
	}
	if deleted {
		s.InvalidateStats(userID)
	}
	return deleted, nil
}

func (s *Service) DeleteDiaryEntriesForDay(ctx context.Context, userID int64, dateISO string) (int64, error) {
	rows, err := s.repo.GetDiaryRange(ctx, userID, dateISO, dateISO)
	if err != nil {
		return 0, err
	}
	if len(rows) == 0 {
		return 0, legacy.NewError(legacy.ErrorKindNotFound, "Entries not found")
	}
	deletedCount, err := s.repo.DeleteDiaryEntriesByDate(ctx, dateISO, userID)
	if err != nil {
		return 0, err
	}
	s.InvalidateStats(userID)
	return deletedCount, nil
}

func (s *Service) RestoreDiaryEntriesForDay(ctx context.Context, userID int64, dateISO string, entries []RestoreDiaryEntryInput) ([]DiaryEntry, error) {
	if len(entries) == 0 {
		return nil, legacy.NewError(legacy.ErrorKindValidation, "Entries not found")
	}
	resolver, err := s.buildPersonalKcalResolver(ctx, userID)
	if err != nil {
		return nil, err
	}
	normalized := make([]DiaryEntry, 0, len(entries))
	for _, entry := range entries {
		history := entry.History
		if len(history) == 0 {
			history = []HistoryEntry{{Action: historyActionInit, Value: entry.FoodWeight}}
		}
		kcals := resolvePersonalKcalsForEntry(resolver, entry.FoodCatalogueID, dateISO, entry.FoodWeight)
		normalized = append(normalized, DiaryEntry{DateISO: dateISO, FoodCatalogueID: entry.FoodCatalogueID, FoodWeight: entry.FoodWeight, Kcals: kcals, History: history})
	}
	restored, err := s.repo.CreateDiaryEntriesBatch(ctx, userID, normalized)
	if err != nil {
		return nil, err
	}
	s.InvalidateStats(userID)
	return restored, nil
}

func (s *Service) SetBodyWeight(ctx context.Context, userID int64, dateISO string, bodyWeight float64) (bool, error) {
	existing, err := s.repo.GetWeightByDate(ctx, dateISO, userID)
	if err != nil {
		return false, err
	}
	if existing == nil {
		_, err := s.repo.CreateWeight(ctx, dateISO, bodyWeight, userID)
		if err != nil {
			return false, err
		}
		s.InvalidateStats(userID)
		return true, nil
	}
	updated, err := s.repo.UpdateWeight(ctx, dateISO, bodyWeight, userID)
	if err != nil {
		return false, err
	}
	if updated {
		s.InvalidateStats(userID)
	}
	return updated, nil
}

func (s *Service) InvalidateStats(userID int64) {
	s.statsCache.Delete(userID)
}

func (s *Service) GetStats(ctx context.Context, userID int64) (map[string][5]any, error) {
	if cached, ok := s.statsCache.Get(userID); ok {
		return cached, nil
	}
	firstDate, err := s.repo.GetUserFirstDate(ctx, userID)
	if err != nil {
		return nil, err
	}
	if firstDate == "" {
		return map[string][5]any{}, nil
	}

	lastDate := s.clock.Now().UTC().Format("2006-01-02")
	allDates := getDatesList(firstDate, lastDate)
	weightRows, err := s.repo.GetWeightRange(ctx, userID, firstDate, lastDate)
	if err != nil {
		return nil, err
	}
	diaryRows, err := s.repo.GetStatsDiaryHistory(ctx, userID, firstDate, lastDate)
	if err != nil {
		return nil, err
	}
	resolver, err := s.buildPersonalKcalResolver(ctx, userID)
	if err != nil {
		return nil, err
	}

	weights := prepareWeights(weightRows, allDates)
	weightsAvg := calculateCenteredAverage(weights, 10, true, 1)
	diaryEntries := prepareDiaryEntries(diaryRows, allDates)

	stats := make(map[string][5]any, len(allDates))
	for _, date := range allDates {
		yearMonth := date[:7]
		var consumed float64
		for _, row := range diaryEntries[date] {
			consumed += resolver.AppliedKcal(row.FoodCatalogueID, yearMonth) * row.FoodWeight / 100
		}
		target := roundFloat(resolver.AppliedNorm(yearMonth), 0)
		stats[date] = [5]any{weights[date], weightsAvg[date], consumed, target, false}
	}

	s.statsCache.Set(userID, stats)
	return stats, nil
}

type nutrientTotals struct {
	Protein int64
	Fat     int64
	Carbs   int64
	Fiber   int64
}

type nutrientTargets struct {
	TargetProtein int64
	TargetFat     int64
	TargetCarbs   int64
	TargetFiber   int64
}

func parseHistory(history string) []HistoryEntry {
	var result []HistoryEntry
	if err := json.Unmarshal([]byte(history), &result); err != nil {
		return []HistoryEntry{}
	}
	if result == nil {
		return []HistoryEntry{}
	}
	return result
}

func toHistoryJSON(history []HistoryEntry) (string, error) {
	payload, err := json.Marshal(history)
	if err != nil {
		return "", fmt.Errorf("marshal history: %w", err)
	}
	return string(payload), nil
}

func getDateRange(dateISO string, offsetDays int) []string {
	center := createUTCDate(dateISO)
	result := make([]string, 0, offsetDays*2+1)
	for i := -offsetDays; i <= offsetDays; i++ {
		day := center.AddDate(0, 0, i)
		result = append(result, day.Format("2006-01-02"))
	}
	return result
}

func getStartAndEndDates(dateISO string, offsetDays int) (string, string) {
	date := createUTCDate(dateISO)
	start := date.AddDate(0, 0, -offsetDays)
	end := date.AddDate(0, 0, offsetDays+1)
	return start.Format("2006-01-02"), end.Format("2006-01-02")
}

func buildTargetKcalsForRange(dates []string, stats map[string][5]any) map[string]*int64 {
	result := make(map[string]*int64, len(dates))
	var lastKnown *int64
	for _, date := range dates {
		stat, ok := stats[date]
		if ok {
			if value, ok := toInt64Pointer(stat[3]); ok {
				lastKnown = value
				result[date] = value
				continue
			}
		}
		result[date] = lastKnown
	}
	return result
}

func calculateTargetNutrientsForRange(dates []string, bodyWeights map[string]float64, stats map[string][5]any, goal string, targetKcals map[string]*int64) map[string]nutrientTargets {
	result := make(map[string]nutrientTargets, len(dates))
	for _, date := range dates {
		weight := 75.0
		if stat, ok := stats[date]; ok {
			if value, ok := toFloat64(stat[1]); ok && value != 0 {
				weight = value
			} else if value, ok := bodyWeights[date]; ok && value != 0 {
				weight = value
			}
		} else if value, ok := bodyWeights[date]; ok && value != 0 {
			weight = value
		}

		dayTargetKcals := int64(2000)
		if value := targetKcals[date]; value != nil {
			dayTargetKcals = *value
		}

		result[date] = calculateTargetNutrients(weight, goal, dayTargetKcals)
	}
	return result
}

func calculateConsumedNutrientsForRange(dates []string, diary map[string]DiaryDay, catalogue map[int64]CatalogueEntry) map[string]nutrientTotals {
	result := make(map[string]nutrientTotals, len(dates))
	for _, date := range dates {
		result[date] = calculateDailyNutrients(diary[date].Food, catalogue)
	}
	return result
}

func calculateConsumedKcalsForRange(dates []string, diary map[string]DiaryDay) map[string]int64 {
	result := make(map[string]int64, len(dates))
	for _, date := range dates {
		var total int64
		for _, entry := range diary[date].Food {
			total += entry.Kcals
		}
		result[date] = total
	}
	return result
}

func calculateTargetNutrients(weight float64, goal string, targetKcals int64) nutrientTargets {
	coefficient := 1.4
	switch goal {
	case "gain":
		coefficient = 2.0
	case "lose":
		coefficient = 1.8
	}

	targetProtein := weight * coefficient
	targetFat := (float64(targetKcals) * 0.25) / 9
	kcalsForCarbs := float64(targetKcals) - targetProtein*4 - targetFat*9
	targetCarbs := kcalsForCarbs / 4

	return nutrientTargets{
		TargetProtein: int64(math.Round(targetProtein)),
		TargetFat:     int64(math.Round(targetFat)),
		TargetCarbs:   int64(math.Round(targetCarbs)),
		TargetFiber:   30,
	}
}

func calculateDailyNutrients(entries map[int64]DiaryEntry, catalogue map[int64]CatalogueEntry) nutrientTotals {
	var protein float64
	var fat float64
	var carbs float64
	var fiber float64

	for _, entry := range entries {
		catalogueEntry, ok := catalogue[entry.FoodCatalogueID]
		if !ok {
			continue
		}
		portionMultiplier := float64(entry.FoodWeight) / 100
		protein += catalogueEntry.Protein * portionMultiplier
		fat += catalogueEntry.Fat * portionMultiplier
		carbs += catalogueEntry.Carbs * portionMultiplier
		fiber += catalogueEntry.Fiber * portionMultiplier
	}

	return nutrientTotals{Protein: int64(math.Round(protein)), Fat: int64(math.Round(fat)), Carbs: int64(math.Round(carbs)), Fiber: int64(math.Round(fiber))}
}

func createUTCDate(dateISO string) time.Time {
	parsed, _ := time.Parse("2006-01-02", dateISO)
	return parsed.UTC()
}

func getDatesList(firstDate string, lastDate string) []string {
	start := createUTCDate(firstDate)
	end := createUTCDate(lastDate)
	result := make([]string, 0)
	for current := start; !current.After(end); current = current.AddDate(0, 0, 1) {
		result = append(result, current.Format("2006-01-02"))
	}
	return result
}

func prepareWeights(rows []WeightRow, allDates []string) map[string]float64 {
	weights := make(map[string]float64, len(allDates))
	known := make(map[string]*float64, len(allDates))
	for _, date := range allDates {
		known[date] = nil
	}
	for _, row := range rows {
		value := row.Weight
		known[row.DateISO] = &value
	}

	points := make([]struct {
		Index int
		Value float64
	}, 0)
	for idx, date := range allDates {
		if known[date] != nil {
			points = append(points, struct {
				Index int
				Value float64
			}{Index: idx, Value: *known[date]})
		}
	}
	if len(points) == 0 {
		for _, date := range allDates {
			weights[date] = 0
		}
		return weights
	}

	for idx := 0; idx < points[0].Index; idx++ {
		weights[allDates[idx]] = points[0].Value
	}
	for pointIdx := 0; pointIdx < len(points)-1; pointIdx++ {
		left := points[pointIdx]
		right := points[pointIdx+1]
		weights[allDates[left.Index]] = left.Value
		gap := right.Index - left.Index
		for idx := left.Index + 1; idx < right.Index; idx++ {
			progress := float64(idx-left.Index) / float64(gap)
			weights[allDates[idx]] = left.Value + (right.Value-left.Value)*progress
		}
	}
	last := points[len(points)-1]
	weights[allDates[last.Index]] = last.Value
	for idx := last.Index + 1; idx < len(allDates); idx++ {
		weights[allDates[idx]] = last.Value
	}

	return weights
}

func prepareDiaryEntries(rows []StatsDiaryRow, allDates []string) map[string][]StatsDiaryRow {
	result := make(map[string][]StatsDiaryRow, len(allDates))
	for _, date := range allDates {
		result[date] = nil
	}
	for _, row := range rows {
		if result[row.DateISO] == nil {
			result[row.DateISO] = []StatsDiaryRow{}
		}
		result[row.DateISO] = append(result[row.DateISO], row)
	}
	return result
}

func calculateCenteredAverage(input map[string]float64, avgRange int, round bool, roundPlaces int) map[string]float64 {
	keys := sortedKeys(input)
	values := make([]float64, 0, len(keys))
	for _, key := range keys {
		values = append(values, input[key])
	}
	for idx := 1; idx < len(values); idx++ {
		if math.IsNaN(values[idx]) {
			values[idx] = values[idx-1]
		}
	}
	if len(values) > 0 && math.IsNaN(values[0]) {
		values[0] = 0
	}
	result := make(map[string]float64, len(keys))
	halfRange := avgRange / 2
	for idx := range values {
		start := max(0, idx-halfRange)
		end := min(len(values), idx+halfRange+1)
		avg := average(values[start:end])
		if round {
			avg = roundFloat(avg, roundPlaces)
		}
		result[keys[idx]] = avg
	}
	return result
}

func nullableStringPtr(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	result := value.String
	return &result
}

func nullableStringValue(value sql.NullString) string {
	if !value.Valid {
		return ""
	}
	return value.String
}

func nullableFloat64Value(value sql.NullFloat64) float64 {
	if !value.Valid {
		return 0
	}
	return value.Float64
}

func sortedKeys(input map[string]float64) []string {
	keys := make([]string, 0, len(input))
	for key := range input {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func average(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	return sum(values) / float64(len(values))
}

func sum(values []float64) float64 {
	var result float64
	for _, value := range values {
		result += value
	}
	return result
}

func roundFloat(value float64, places int) float64 {
	multiplier := math.Pow(10, float64(places))
	return math.Round(value*multiplier) / multiplier
}

func toInt64Pointer(value any) (*int64, bool) {
	switch typed := value.(type) {
	case int64:
		result := typed
		return &result, true
	case float64:
		result := int64(typed)
		return &result, true
	case int:
		result := int64(typed)
		return &result, true
	case nil:
		return nil, false
	default:
		return nil, false
	}
}

func toFloat64(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case int64:
		return float64(typed), true
	case int:
		return float64(typed), true
	case nil:
		return 0, false
	default:
		return 0, false
	}
}

func min(a int, b int) int {
	if a < b {
		return a
	}
	return b
}

func max(a int, b int) int {
	if a > b {
		return a
	}
	return b
}
