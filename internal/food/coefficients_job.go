package food

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"math/rand"
	"sort"
	"time"
)

type CoefficientsConfig struct {
	StartWithDefaults      bool
	DifferentTriesPerRound int
	ChildrenAmt            int
	BestAmt                int
	Days7                  int
	Days60                 int
	MaxTriesIfUnchanged    int
}

type CoefficientsRecalculationResult struct {
	UserID        int64             `json:"userId"`
	Coefficients  map[int64]float64 `json:"coefficients"`
	Laps          int               `json:"laps"`
	BestScore     float64           `json:"bestScore"`
	DiaryDayCount int               `json:"diaryDayCount"`
	WeightCount   int               `json:"weightCount"`
}

type CoefficientsJobUserResult struct {
	UserID        int64   `json:"userId"`
	Success       bool    `json:"success"`
	Laps          int     `json:"laps,omitempty"`
	BestScore     float64 `json:"bestScore,omitempty"`
	DiaryDayCount int     `json:"diaryDayCount,omitempty"`
	WeightCount   int     `json:"weightCount,omitempty"`
	Error         string  `json:"error,omitempty"`
}

type CoefficientsJobResult struct {
	ProcessedCount int                         `json:"processedCount"`
	SuccessCount   int                         `json:"successCount"`
	FailedCount    int                         `json:"failedCount"`
	Users          []CoefficientsJobUserResult `json:"users"`
}

var ErrCoefficientsRecalculationAlreadyRunning = errors.New("coefficients recalculation is already running")

type coefficientDiaryEntry struct {
	FoodID int64
	Weight int64
}

type coefficientPopulationScore struct {
	Score        float64
	Coefficients map[int64]float64
}

func DefaultCoefficientsConfig() CoefficientsConfig {
	return CoefficientsConfig{
		DifferentTriesPerRound: 100,
		ChildrenAmt:            10,
		BestAmt:                10,
		Days7:                  7,
		Days60:                 60,
		MaxTriesIfUnchanged:    20,
	}
}

func (s *Service) SetCoefficientsConfig(cfg CoefficientsConfig) {
	s.coefficientsConfig = cfg
}

func (s *Service) RecalculateCoefficients(ctx context.Context, userID int64) (*CoefficientsRecalculationResult, error) {
	if !s.beginCoefficientUserRun(userID) {
		return nil, ErrCoefficientsRecalculationAlreadyRunning
	}
	defer s.endCoefficientUserRun(userID)
	return s.recalculateCoefficients(ctx, userID)
}

func (s *Service) recalculateCoefficients(ctx context.Context, userID int64) (*CoefficientsRecalculationResult, error) {
	startedAt := time.Now()
	cfg := s.coefficientsConfig
	log.Printf("Starting coefficients calculation for user: %d", userID)

	diaryRows, err := s.repo.GetAllDiaryEntries(ctx, userID)
	if err != nil {
		return nil, err
	}
	weightsRows, err := s.repo.GetAllWeightEntries(ctx, userID)
	if err != nil {
		return nil, err
	}
	catalogueRows, err := s.repo.GetCatalogue(ctx)
	if err != nil {
		return nil, err
	}
	if len(weightsRows) < cfg.Days7+1 {
		return nil, fmt.Errorf("insufficient weight data for calculation")
	}
	if len(diaryRows) == 0 {
		return nil, fmt.Errorf("no valid diary entries for calculation")
	}

	seedCoefficients, err := s.getCoefficientSeed(ctx, userID, catalogueRows, cfg.StartWithDefaults)
	if err != nil {
		return nil, err
	}

	diaryEntries := prepareCoefficientDiaryEntries(diaryRows)
	weights := prepareCoefficientWeights(weightsRows)
	catalogue := prepareCoefficientCatalogue(catalogueRows)
	catalogueFrequency := prepareCoefficientFrequency(seedCoefficients, diaryRows)
	coefficientIDs := sortedCoefficientIDs(seedCoefficients)
	weightsAvg := averageCoefficientSeries(weights, cfg.Days7)

	population := make([]map[int64]float64, 0, cfg.DifferentTriesPerRound)
	rng := rand.New(rand.NewSource(s.clock.Now().UnixNano() + userID))
	for i := 0; i < cfg.DifferentTriesPerRound; i++ {
		population = append(population, mutateCoefficients(coefficientIDs, seedCoefficients, catalogueFrequency, rng))
	}

	bestScoreCounter := 0
	prevBestScore := math.NaN()
	bestScore := 0.0
	topCoefficients := cloneCoefficientMap(seedCoefficients)
	laps := 0

	for bestScoreCounter < cfg.MaxTriesIfUnchanged {
		scoredPopulation, err := scoreCoefficientPopulation(population, diaryEntries, catalogue, weightsAvg, coefficientIDs, cfg)
		if err != nil {
			return nil, err
		}
		if len(scoredPopulation) == 0 {
			return nil, fmt.Errorf("empty coefficient population")
		}
		sort.Slice(scoredPopulation, func(i int, j int) bool {
			return scoredPopulation[i].Score < scoredPopulation[j].Score
		})

		bestScore = scoredPopulation[0].Score
		topCoefficients = cloneCoefficientMap(scoredPopulation[0].Coefficients)
		laps++

		nextPopulation := make([]map[int64]float64, 0, cfg.BestAmt*cfg.ChildrenAmt)
		limit := min(cfg.BestAmt, len(scoredPopulation))
		for i := 0; i < limit; i++ {
			parent := cloneCoefficientMap(scoredPopulation[i].Coefficients)
			nextPopulation = append(nextPopulation, parent)
			for child := 1; child < cfg.ChildrenAmt; child++ {
				nextPopulation = append(nextPopulation, mutateCoefficients(coefficientIDs, parent, catalogueFrequency, rng))
			}
		}
		population = nextPopulation

		if bestScore == prevBestScore {
			bestScoreCounter++
		} else {
			bestScoreCounter = 0
		}
		prevBestScore = bestScore
	}

	payload, err := json.Marshal(topCoefficients)
	if err != nil {
		return nil, fmt.Errorf("marshal recalculated coefficients: %w", err)
	}
	if err := s.repo.UpsertUserCoefficients(ctx, userID, string(payload)); err != nil {
		return nil, err
	}
	s.InvalidateStats(userID)
	log.Printf("Coefficients calculated successfully for user: %d (%d laps in %.2f seconds)", userID, laps, time.Since(startedAt).Seconds())

	return &CoefficientsRecalculationResult{
		UserID:        userID,
		Coefficients:  topCoefficients,
		Laps:          laps,
		BestScore:     bestScore,
		DiaryDayCount: len(diaryEntries),
		WeightCount:   len(weights),
	}, nil
}

func (s *Service) RunCoefficientsJob(ctx context.Context) (*CoefficientsJobResult, error) {
	if !s.beginCoefficientBatchRun() {
		return nil, ErrCoefficientsRecalculationAlreadyRunning
	}
	defer s.endCoefficientBatchRun()
	userIDs, err := s.repo.GetAllUserIDs(ctx)
	if err != nil {
		return nil, err
	}
	log.Printf("Running coefficient calculation for all users...")
	result := &CoefficientsJobResult{
		ProcessedCount: len(userIDs),
		Users:          make([]CoefficientsJobUserResult, 0, len(userIDs)),
	}
	for _, userID := range userIDs {
		userResult := CoefficientsJobUserResult{UserID: userID}
		recalculated, err := s.recalculateCoefficients(ctx, userID)
		if err != nil {
			log.Printf("Error calculating coefficients for user %d: %v", userID, err)
			userResult.Error = err.Error()
			result.FailedCount++
			result.Users = append(result.Users, userResult)
			continue
		}
		userResult.Success = true
		userResult.Laps = recalculated.Laps
		userResult.BestScore = recalculated.BestScore
		userResult.DiaryDayCount = recalculated.DiaryDayCount
		userResult.WeightCount = recalculated.WeightCount
		result.SuccessCount++
		result.Users = append(result.Users, userResult)
	}
	return result, nil
}

func (s *Service) beginCoefficientUserRun(userID int64) bool {
	s.coefficientsRunMu.Lock()
	defer s.coefficientsRunMu.Unlock()
	if s.coefficientsBatchActive || s.coefficientsUsersActive[userID] {
		return false
	}
	s.coefficientsUsersActive[userID] = true
	return true
}

func (s *Service) endCoefficientUserRun(userID int64) {
	s.coefficientsRunMu.Lock()
	defer s.coefficientsRunMu.Unlock()
	delete(s.coefficientsUsersActive, userID)
}

func (s *Service) beginCoefficientBatchRun() bool {
	s.coefficientsRunMu.Lock()
	defer s.coefficientsRunMu.Unlock()
	if s.coefficientsBatchActive || len(s.coefficientsUsersActive) > 0 {
		return false
	}
	s.coefficientsBatchActive = true
	return true
}

func (s *Service) endCoefficientBatchRun() {
	s.coefficientsRunMu.Lock()
	defer s.coefficientsRunMu.Unlock()
	s.coefficientsBatchActive = false
}

func (s *Service) getCoefficientSeed(ctx context.Context, userID int64, catalogueRows []CatalogueRow, startWithDefaults bool) (map[int64]float64, error) {
	if startWithDefaults {
		result := make(map[int64]float64, len(catalogueRows))
		for _, row := range catalogueRows {
			result[row.ID] = 1
		}
		return result, nil
	}
	return s.GetCoefficients(ctx, userID)
}

func prepareCoefficientDiaryEntries(rows []DiaryRow) [][]coefficientDiaryEntry {
	if len(rows) == 0 {
		return nil
	}
	result := make([][]coefficientDiaryEntry, 0)
	currentDate := rows[0].DateISO
	currentDay := make([]coefficientDiaryEntry, 0)
	for _, row := range rows {
		if row.DateISO != currentDate {
			result = append(result, currentDay)
			currentDate = row.DateISO
			currentDay = make([]coefficientDiaryEntry, 0)
		}
		currentDay = append(currentDay, coefficientDiaryEntry{FoodID: row.FoodCatalogueID, Weight: row.FoodWeight})
	}
	result = append(result, currentDay)
	return result
}

func prepareCoefficientWeights(rows []WeightRow) []float64 {
	result := make([]float64, 0, len(rows))
	for _, row := range rows {
		result = append(result, row.Weight)
	}
	return result
}

func prepareCoefficientCatalogue(rows []CatalogueRow) map[int64]int64 {
	result := make(map[int64]int64, len(rows))
	for _, row := range rows {
		result[row.ID] = row.Kcals
	}
	return result
}

func countCoefficientDailyKcals(entries [][]coefficientDiaryEntry, catalogue map[int64]int64, coefficients map[int64]float64) []float64 {
	result := make([]float64, 0, len(entries))
	for _, day := range entries {
		total := 0.0
		for _, food := range day {
			total += (float64(catalogue[food.FoodID]) * coefficients[food.FoodID] * float64(food.Weight)) / 100
		}
		result = append(result, total)
	}
	return result
}

func prepareCoefficientFrequency(coefficients map[int64]float64, diaryRows []DiaryRow) map[int64]int {
	result := make(map[int64]int, len(coefficients))
	for id := range coefficients {
		result[id] = 0
	}
	for _, row := range diaryRows {
		result[row.FoodCatalogueID]++
	}
	return result
}

func averageCoefficientSeries(values []float64, avgRange int) []float64 {
	result := make([]float64, 0, len(values))
	for i := 1; i <= len(values); i++ {
		start := max(0, i-avgRange)
		slice := values[start:i]
		result = append(result, average(slice))
	}
	return result
}

func computeCoefficientTargets(kcals []float64, weights []float64, n int) ([]float64, error) {
	if len(kcals) < n || len(weights) < n {
		return nil, fmt.Errorf("insufficient data for targetKcalsPrep calculation - need at least %d entries", n)
	}
	effectiveLength := min(len(kcals), len(weights))
	result := make([]float64, 0, max(0, effectiveLength-n+1))
	for i := n - 1; i < effectiveLength; i++ {
		startIdx := i - n + 1
		slice := kcals[startIdx : i+1]
		weightDiff := weights[i] - weights[startIdx]
		target := (sum(slice) - weightDiff*kcalsIn1KG) / float64(n)
		result = append(result, target)
	}
	return result, nil
}

func scoreCoefficientPopulation(population []map[int64]float64, diaryEntries [][]coefficientDiaryEntry, catalogue map[int64]int64, weightsAvg []float64, coefficientIDs []int64, cfg CoefficientsConfig) ([]coefficientPopulationScore, error) {
	result := make([]coefficientPopulationScore, 0, len(population))
	for _, coefficients := range population {
		dailySumKcals := countCoefficientDailyKcals(diaryEntries, catalogue, coefficients)
		dailySumKcalsAvg := averageCoefficientSeries(dailySumKcals, cfg.Days7)
		targetEdgy, err := computeCoefficientTargets(dailySumKcalsAvg, weightsAvg, cfg.Days7)
		if err != nil {
			return nil, err
		}
		targetSmooth := averageCoefficientSeries(targetEdgy, cfg.Days60)
		result = append(result, coefficientPopulationScore{
			Score:        coefficientFitness(targetEdgy, targetSmooth, coefficients, coefficientIDs),
			Coefficients: coefficients,
		})
	}
	return result, nil
}

func coefficientFitness(edgy []float64, smooth []float64, coefficients map[int64]float64, coefficientIDs []int64) float64 {
	diff := 0.0
	for i := range edgy {
		diff += math.Abs(edgy[i] - smooth[i])
	}
	coefficientsSum := 0.0
	for _, id := range coefficientIDs {
		value := coefficients[id]
		if value > 1 {
			coefficientsSum += value - 1
		}
		if value < 1 {
			coefficientsSum += (1 - value) * 2
		}
	}
	coefficientsSum = math.Max(0.1, math.Abs(coefficientsSum))
	return diff * coefficientsSum
}

func mutateCoefficients(coefficientIDs []int64, coefficients map[int64]float64, frequency map[int64]int, rng *rand.Rand) map[int64]float64 {
	result := make(map[int64]float64, len(coefficients))
	mostFrequent := 0
	for _, value := range frequency {
		if value > mostFrequent {
			mostFrequent = value
		}
	}
	if mostFrequent <= 0 {
		mostFrequent = 1
	}
	for _, id := range coefficientIDs {
		value := coefficients[id]
		newValue := roundFloat(value+(rng.Float64()*0.02-0.01), 2)
		maxIncrease := math.Sqrt(float64(frequency[id]) / float64(mostFrequent))
		maximum := 1 + maxIncrease
		minimum := 1 - maxIncrease/2
		switch {
		case newValue > maximum:
			result[id] = maximum
		case newValue < minimum:
			result[id] = minimum
		default:
			result[id] = newValue
		}
	}
	return result
}

func sortedCoefficientIDs(input map[int64]float64) []int64 {
	result := make([]int64, 0, len(input))
	for key := range input {
		result = append(result, key)
	}
	sort.Slice(result, func(i int, j int) bool {
		return result[i] < result[j]
	})
	return result
}

func cloneCoefficientMap(input map[int64]float64) map[int64]float64 {
	result := make(map[int64]float64, len(input))
	for key, value := range input {
		result[key] = value
	}
	return result
}
