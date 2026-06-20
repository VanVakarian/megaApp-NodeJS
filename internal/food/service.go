package food

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
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
	imageGenerationRequest  ImageGenerationRequester
	imageVersions           ImageVersionProvider
	clock                   clockplatform.Clock
	coefficientsConfig      CoefficientsConfig
	coefficientsRunMu       sync.Mutex
	coefficientsBatchActive bool
	coefficientsUsersActive map[int64]bool
}

type DiaryEntry struct {
	ID              int64          `json:"id"`
	DateISO         string         `json:"dateISO"`
	FoodCatalogueID int64          `json:"foodCatalogueId"`
	FoodWeight      int64          `json:"foodWeight"`
	History         []HistoryEntry `json:"history"`
}

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
	return &Service{repo: repo, statsCache: NewStatsCache(), searchCache: NewSearchCache(), clock: clockplatform.NewRealClock(), coefficientsConfig: DefaultCoefficientsConfig(), coefficientsUsersActive: make(map[int64]bool)}
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
	coefficients, err := s.GetCoefficients(ctx, userID)
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
	consumedKcals := calculateConsumedKcalsForRange(dates, result, catalogueMap, coefficients)

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

func (s *Service) GetCoefficients(ctx context.Context, userID int64) (map[int64]float64, error) {
	catalogue, err := s.repo.GetCatalogue(ctx)
	if err != nil {
		return nil, err
	}

	result := make(map[int64]float64, len(catalogue))
	for _, row := range catalogue {
		result[row.ID] = 1
	}

	stored, err := s.repo.GetUserCoefficients(ctx, userID)
	if err != nil {
		return nil, err
	}
	if stored == nil || !stored.Coefficients.Valid || stored.Coefficients.String == "" {
		payload, err := json.Marshal(result)
		if err != nil {
			return nil, fmt.Errorf("marshal default coefficients: %w", err)
		}
		if err := s.repo.UpsertUserCoefficients(ctx, userID, string(payload)); err != nil {
			return nil, err
		}
		return result, nil
	}

	var parsed map[string]float64
	if err := json.Unmarshal([]byte(stored.Coefficients.String), &parsed); err != nil {
		payload, marshalErr := json.Marshal(result)
		if marshalErr != nil {
			return nil, fmt.Errorf("marshal repaired coefficients: %w", marshalErr)
		}
		if err := s.repo.UpsertUserCoefficients(ctx, userID, string(payload)); err != nil {
			return nil, err
		}
		return result, nil
	}

	changed := false
	for _, row := range catalogue {
		value, ok := parsed[strconv.FormatInt(row.ID, 10)]
		if !ok {
			changed = true
			continue
		}
		if value <= 0 || math.IsNaN(value) || math.IsInf(value, 0) {
			changed = true
			continue
		}
		result[row.ID] = value
	}

	for key := range parsed {
		id, err := strconv.ParseInt(key, 10, 64)
		if err != nil {
			changed = true
			continue
		}
		if _, ok := result[id]; !ok {
			changed = true
		}
	}

	if changed {
		payload, err := json.Marshal(result)
		if err != nil {
			return nil, fmt.Errorf("marshal normalized coefficients: %w", err)
		}
		if err := s.repo.UpsertUserCoefficients(ctx, userID, string(payload)); err != nil {
			return nil, err
		}
	}

	return result, nil
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
	s.InvalidateStats(userID)
	return DiaryEntry{ID: id, DateISO: dateISO, FoodCatalogueID: foodCatalogueID, FoodWeight: foodWeight, History: history}, nil
}

func (s *Service) EditDiaryEntry(ctx context.Context, userID int64, diaryID int64, foodWeight int64, newHistoryEntry HistoryEntry) (*DiaryEntry, error) {
	historyJSON, err := s.repo.GetDiaryEntryHistory(ctx, diaryID, userID)
	if err != nil {
		return nil, err
	}
	if historyJSON == "" {
		return nil, nil
	}
	history := parseHistory(historyJSON)
	history = append(history, newHistoryEntry)
	updatedHistoryJSON, err := toHistoryJSON(history)
	if err != nil {
		return nil, err
	}
	updated, err := s.repo.UpdateDiaryEntry(ctx, diaryID, userID, foodWeight, updatedHistoryJSON)
	if err != nil {
		return nil, err
	}
	if !updated {
		return nil, nil
	}
	s.InvalidateStats(userID)
	return &DiaryEntry{ID: diaryID, FoodWeight: foodWeight, History: history}, nil
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
	normalized := make([]DiaryEntry, 0, len(entries))
	for _, entry := range entries {
		history := entry.History
		if len(history) == 0 {
			history = []HistoryEntry{{Action: "init", Value: entry.FoodWeight}}
		}
		normalized = append(normalized, DiaryEntry{DateISO: dateISO, FoodCatalogueID: entry.FoodCatalogueID, FoodWeight: entry.FoodWeight, History: history})
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
	coefficients, err := s.GetCoefficients(ctx, userID)
	if err != nil {
		return nil, err
	}

	weights := prepareWeights(weightRows, allDates)
	diaryEntries := prepareDiaryEntries(diaryRows, allDates)
	dailySumKcals := calculateDailySumKcals(diaryEntries, coefficients, allDates)
	avgDays := 10
	dailySumKcalsAvg := calculateCenteredAverage(dailySumKcals, avgDays, true, 0)
	weightsAvg := calculateCenteredAverage(weights, avgDays, true, 1)
	normDays := 30
	targetKcalsBaseline := computeTargetKcalsFromHistory(dailySumKcalsAvg, weightsAvg, normDays)
	targetKcalsAvgBaseline := calculateCenteredAverage(targetKcalsBaseline, normDays, true, 0)
	targetKcalsForAllDates := normalizeTargetKcalsForAllDates(allDates, targetKcalsAvgBaseline)
	today := s.clock.Now().UTC().Format("2006-01-02")
	dailySumKcalsWithVirtual, virtualDaysFlags := applyVirtualKcalsForMissingPastDays(allDates, dailySumKcals, targetKcalsForAllDates, weightsAvg, today)
	dailySumKcalsWithVirtualAvg := calculateCenteredAverage(dailySumKcalsWithVirtual, avgDays, true, 0)
	targetKcalsFinal := computeTargetKcalsFromHistory(dailySumKcalsWithVirtualAvg, weightsAvg, normDays)
	targetKcalsAvgFinal := calculateCenteredAverage(targetKcalsFinal, normDays, true, 0)

	stats := prepareStats(allDates, weights, weightsAvg, dailySumKcalsWithVirtual, targetKcalsAvgFinal, virtualDaysFlags)
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

func calculateConsumedKcalsForRange(dates []string, diary map[string]DiaryDay, catalogue map[int64]CatalogueEntry, coefficients map[int64]float64) map[string]int64 {
	result := make(map[string]int64, len(dates))
	for _, date := range dates {
		result[date] = calculateDailyKcals(diary[date].Food, catalogue, coefficients)
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

func calculateDailyKcals(entries map[int64]DiaryEntry, catalogue map[int64]CatalogueEntry, coefficients map[int64]float64) int64 {
	var total float64
	for _, entry := range entries {
		catalogueEntry, ok := catalogue[entry.FoodCatalogueID]
		if !ok {
			continue
		}
		coefficient := coefficients[entry.FoodCatalogueID]
		if coefficient == 0 {
			coefficient = 1
		}
		total += float64(catalogueEntry.Kcals) * (float64(entry.FoodWeight) / 100) * coefficient
	}
	return int64(math.Round(total))
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

func calculateDailySumKcals(entries map[string][]StatsDiaryRow, coefficients map[int64]float64, allDates []string) map[string]float64 {
	result := make(map[string]float64, len(allDates))
	known := make(map[string]bool, len(allDates))
	for _, date := range allDates {
		dayEntries := entries[date]
		if dayEntries == nil {
			known[date] = false
			continue
		}
		known[date] = true
		var total float64
		for _, entry := range dayEntries {
			coefficient := coefficients[entry.FoodCatalogueID]
			if coefficient == 0 {
				coefficient = 1
			}
			total += (entry.FoodWeight / 100) * entry.Kcals * coefficient
		}
		result[date] = total
	}
	for _, date := range allDates {
		if !known[date] {
			result[date] = math.NaN()
		}
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

func computeTargetKcalsFromHistory(kcals map[string]float64, weights map[string]float64, n int) map[string]float64 {
	kcalsKeys := sortedKeys(kcals)
	kcalsValues := valuesByKeys(kcals, kcalsKeys)
	weightsValues := valuesByKeys(weights, kcalsKeys)
	result := make(map[string]float64)
	for idx := n - 1; idx < len(kcalsValues); idx++ {
		slice := kcalsValues[idx-n+1 : idx+1]
		weightDiff := weightsValues[idx] - weightsValues[idx-n+1]
		maintenance := (sum(slice) - weightDiff*kcalsIn1KG) / float64(n)
		result[kcalsKeys[idx]] = maintenance
	}
	return result
}

func normalizeTargetKcalsForAllDates(allDates []string, target map[string]float64) map[string]float64 {
	result := make(map[string]float64, len(allDates))
	known := make(map[string]bool, len(allDates))
	for _, date := range allDates {
		value, ok := target[date]
		if ok {
			result[date] = value
			known[date] = true
			continue
		}
		result[date] = math.NaN()
	}
	var prevKnown float64
	prevSet := false
	for _, date := range allDates {
		if known[date] {
			prevKnown = result[date]
			prevSet = true
			continue
		}
		if prevSet {
			result[date] = prevKnown
		}
	}
	var nextKnown float64
	nextSet := false
	for idx := len(allDates) - 1; idx >= 0; idx-- {
		date := allDates[idx]
		if !math.IsNaN(result[date]) {
			nextKnown = result[date]
			nextSet = true
			continue
		}
		if nextSet {
			result[date] = nextKnown
		}
	}
	return result
}

func applyVirtualKcalsForMissingPastDays(allDates []string, factual map[string]float64, target map[string]float64, avgWeights map[string]float64, today string) (map[string]float64, map[string]bool) {
	result := make(map[string]float64, len(factual))
	flags := make(map[string]bool, len(allDates))
	for key, value := range factual {
		result[key] = value
	}
	segmentStart := -1
	commitSegment := func(startIdx int, endIdx int) {
		if startIdx < 0 || endIdx < startIdx {
			return
		}
		segmentDates := allDates[startIdx : endIdx+1]
		segmentTargetValues := make([]float64, 0, len(segmentDates))
		for _, date := range segmentDates {
			value := target[date]
			if math.IsNaN(value) {
				return
			}
			segmentTargetValues = append(segmentTargetValues, value)
		}
		leftAnchorIdx := max(0, startIdx-1)
		rightAnchorIdx := min(len(allDates)-1, endIdx+1)
		leftAnchorWeight := avgWeights[allDates[leftAnchorIdx]]
		rightAnchorWeight := avgWeights[allDates[rightAnchorIdx]]
		segmentTargetTotal := sum(segmentTargetValues)
		if segmentTargetTotal == 0 {
			return
		}
		segmentRequiredTotal := segmentTargetTotal + (rightAnchorWeight-leftAnchorWeight)*kcalsIn1KG
		segmentRatio := segmentRequiredTotal / segmentTargetTotal
		for idx, date := range segmentDates {
			result[date] = roundFloat(segmentTargetValues[idx]*segmentRatio, 0)
			flags[date] = true
		}
	}
	for idx, date := range allDates {
		isPast := date < today
		hasFactual := !math.IsNaN(factual[date])
		if isPast && !hasFactual {
			if segmentStart == -1 {
				segmentStart = idx
			}
			continue
		}
		if segmentStart != -1 {
			commitSegment(segmentStart, idx-1)
			segmentStart = -1
		}
	}
	if segmentStart != -1 {
		commitSegment(segmentStart, len(allDates)-1)
	}
	return result, flags
}

func prepareStats(allDates []string, weights map[string]float64, avgWeights map[string]float64, dailySumKcals map[string]float64, targetKcalsAvg map[string]float64, virtualDaysFlags map[string]bool) map[string][5]any {
	result := make(map[string][5]any, len(allDates))
	for _, date := range allDates {
		result[date] = [5]any{weights[date], avgWeights[date], nullableNaN(dailySumKcals[date]), nullableNaN(targetKcalsAvg[date]), virtualDaysFlags[date]}
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

func valuesByKeys(input map[string]float64, keys []string) []float64 {
	result := make([]float64, 0, len(keys))
	for _, key := range keys {
		result = append(result, input[key])
	}
	return result
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

func nullableNaN(value float64) any {
	if math.IsNaN(value) {
		return nil
	}
	return value
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
