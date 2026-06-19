package food

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

type DiaryRow struct {
	ID              int64
	DateISO         string
	FoodCatalogueID int64
	FoodWeight      int64
	History         string
}

type WeightRow struct {
	DateISO string
	Weight  float64
}

type CatalogueRow struct {
	ID          int64
	Name        string
	LegacyName  sql.NullString
	Kcals       int64
	Protein     sql.NullFloat64
	Fat         sql.NullFloat64
	Carbs       sql.NullFloat64
	Fiber       sql.NullFloat64
	Description sql.NullString
}

type CoefficientsRow struct {
	Coefficients sql.NullString
}

type StatsDiaryRow struct {
	DateISO         string
	FoodWeight      float64
	FoodCatalogueID int64
	Kcals           float64
}

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) GetDiaryRange(ctx context.Context, userID int64, startDate string, endDate string) ([]DiaryRow, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, dateISO, foodCatalogueId, foodWeight, history
		FROM foodDiary
		WHERE usersId = ? AND dateISO BETWEEN ? AND ?
		ORDER BY dateISO ASC
	`, userID, startDate, endDate)
	if err != nil {
		return nil, fmt.Errorf("get diary range: %w", err)
	}
	defer rows.Close()

	var result []DiaryRow
	for rows.Next() {
		var row DiaryRow
		if err := rows.Scan(&row.ID, &row.DateISO, &row.FoodCatalogueID, &row.FoodWeight, &row.History); err != nil {
			return nil, fmt.Errorf("scan diary row: %w", err)
		}
		result = append(result, row)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate diary rows: %w", err)
	}

	return result, nil
}

func (r *Repository) GetWeightRange(ctx context.Context, userID int64, startDate string, endDate string) ([]WeightRow, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT dateISO, weight
		FROM foodBodyWeight
		WHERE usersId = ? AND dateISO BETWEEN ? AND ?
		ORDER BY dateISO ASC
	`, userID, startDate, endDate)
	if err != nil {
		return nil, fmt.Errorf("get weight range: %w", err)
	}
	defer rows.Close()

	var result []WeightRow
	for rows.Next() {
		var row WeightRow
		if err := rows.Scan(&row.DateISO, &row.Weight); err != nil {
			return nil, fmt.Errorf("scan weight row: %w", err)
		}
		result = append(result, row)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate weight rows: %w", err)
	}

	return result, nil
}

func (r *Repository) GetCatalogue(ctx context.Context) ([]CatalogueRow, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, name, kcals, protein, fat, carbs, fiber, description, legacyName
		FROM foodCatalogue
		ORDER BY name ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("get catalogue: %w", err)
	}
	defer rows.Close()

	var result []CatalogueRow
	for rows.Next() {
		var row CatalogueRow
		if err := rows.Scan(&row.ID, &row.Name, &row.Kcals, &row.Protein, &row.Fat, &row.Carbs, &row.Fiber, &row.Description, &row.LegacyName); err != nil {
			return nil, fmt.Errorf("scan catalogue row: %w", err)
		}
		result = append(result, row)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate catalogue rows: %w", err)
	}

	return result, nil
}

func (r *Repository) GetCatalogueEntry(ctx context.Context, catalogueID int64) (*CatalogueRow, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, name, kcals, protein, fat, carbs, fiber, description, legacyName
		FROM foodCatalogue
		WHERE id = ?
	`, catalogueID)

	var result CatalogueRow
	if err := row.Scan(&result.ID, &result.Name, &result.Kcals, &result.Protein, &result.Fat, &result.Carbs, &result.Fiber, &result.Description, &result.LegacyName); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("get catalogue entry: %w", err)
	}

	return &result, nil
}

func (r *Repository) CountDiaryEntriesByCatalogueID(ctx context.Context, catalogueID int64) (int64, error) {
	row := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM foodDiary WHERE foodCatalogueId = ?`, catalogueID)

	var count int64
	if err := row.Scan(&count); err != nil {
		return 0, fmt.Errorf("count diary entries by catalogue id: %w", err)
	}

	return count, nil
}

func (r *Repository) GetUserCoefficients(ctx context.Context, userID int64) (*CoefficientsRow, error) {
	row := r.db.QueryRowContext(ctx, `SELECT coefficients FROM foodSettings WHERE usersId = ?`, userID)

	var result CoefficientsRow
	if err := row.Scan(&result.Coefficients); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("get user coefficients: %w", err)
	}

	return &result, nil
}

func (r *Repository) UpsertUserCoefficients(ctx context.Context, userID int64, coefficients string) error {
	result, err := r.db.ExecContext(ctx, `UPDATE foodSettings SET coefficients = ? WHERE usersId = ?`, coefficients, userID)
	if err != nil {
		return fmt.Errorf("update user coefficients: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("user coefficients rows affected: %w", err)
	}
	if rowsAffected > 0 {
		return nil
	}

	if _, err := r.db.ExecContext(ctx, `INSERT INTO foodSettings (usersId, coefficients) VALUES (?, ?)`, userID, coefficients); err != nil {
		return fmt.Errorf("insert user coefficients: %w", err)
	}

	return nil
}

func (r *Repository) GetUserGoal(ctx context.Context, userID int64) (string, error) {
	row := r.db.QueryRowContext(ctx, `SELECT goal FROM settings WHERE usersId = ?`, userID)

	var goal sql.NullString
	if err := row.Scan(&goal); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return "", fmt.Errorf("get user goal: %w", err)
	}

	return goal.String, nil
}

func (r *Repository) GetUserFirstDate(ctx context.Context, userID int64) (string, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT MIN(date) as firstDate
		FROM (
			SELECT dateISO as date FROM foodDiary WHERE usersId = ?
			UNION
			SELECT dateISO as date FROM foodBodyWeight WHERE usersId = ?
		)
	`, userID, userID)

	var firstDate sql.NullString
	if err := row.Scan(&firstDate); err != nil {
		return "", fmt.Errorf("get user first date: %w", err)
	}

	return firstDate.String, nil
}

func (r *Repository) GetStatsDiaryHistory(ctx context.Context, userID int64, startDate string, endDate string) ([]StatsDiaryRow, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT d.dateISO, d.foodWeight, d.foodCatalogueId, c.kcals
		FROM foodDiary d JOIN foodCatalogue c ON d.foodCatalogueId = c.id
		WHERE d.usersId = ? AND d.dateISO BETWEEN ? AND ?
		ORDER BY d.dateISO ASC
	`, userID, startDate, endDate)
	if err != nil {
		return nil, fmt.Errorf("get stats diary history: %w", err)
	}
	defer rows.Close()

	var result []StatsDiaryRow
	for rows.Next() {
		var row StatsDiaryRow
		if err := rows.Scan(&row.DateISO, &row.FoodWeight, &row.FoodCatalogueID, &row.Kcals); err != nil {
			return nil, fmt.Errorf("scan stats diary row: %w", err)
		}
		result = append(result, row)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate stats diary rows: %w", err)
	}

	return result, nil
}
