package food

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

type WeightByDateRow struct {
	ID     int64
	Weight float64
}

func (r *Repository) CreateDiaryEntry(ctx context.Context, userID int64, dateISO string, foodCatalogueID int64, foodWeight int64, history string) (int64, error) {
	result, err := r.db.ExecContext(ctx, `
		INSERT INTO foodDiary (dateISO, foodCatalogueId, foodWeight, history, usersId, ver, del)
		VALUES (?, ?, ?, ?, ?, 0, 0)
	`, dateISO, foodCatalogueID, foodWeight, history, userID)
	if err != nil {
		return 0, fmt.Errorf("create diary entry: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("create diary entry last insert id: %w", err)
	}

	return id, nil
}

func (r *Repository) CreateDiaryEntriesBatch(ctx context.Context, userID int64, entries []DiaryEntry) ([]DiaryEntry, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin create diary entries batch: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	result := make([]DiaryEntry, 0, len(entries))
	for _, entry := range entries {
		historyJSON, err := toHistoryJSON(entry.History)
		if err != nil {
			return nil, err
		}
		execResult, err := tx.ExecContext(ctx, `
			INSERT INTO foodDiary (dateISO, foodCatalogueId, foodWeight, history, usersId, ver, del)
			VALUES (?, ?, ?, ?, ?, 0, 0)
		`, entry.DateISO, entry.FoodCatalogueID, entry.FoodWeight, historyJSON, userID)
		if err != nil {
			return nil, fmt.Errorf("insert diary entry in batch: %w", err)
		}
		id, err := execResult.LastInsertId()
		if err != nil {
			return nil, fmt.Errorf("batch diary entry last insert id: %w", err)
		}
		entry.ID = id
		result = append(result, entry)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit create diary entries batch: %w", err)
	}

	return result, nil
}

func (r *Repository) GetDiaryEntryHistory(ctx context.Context, diaryID int64, userID int64) (string, error) {
	row := r.db.QueryRowContext(ctx, `SELECT history FROM foodDiary WHERE id = ? AND usersId = ?`, diaryID, userID)

	var history string
	if err := row.Scan(&history); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return "", fmt.Errorf("get diary entry history: %w", err)
	}

	return history, nil
}

func (r *Repository) UpdateDiaryEntry(ctx context.Context, diaryID int64, userID int64, foodWeight int64, history string) (bool, error) {
	result, err := r.db.ExecContext(ctx, `
		UPDATE foodDiary
		SET foodWeight = ?, history = ?
		WHERE id = ? AND usersId = ?
	`, foodWeight, history, diaryID, userID)
	if err != nil {
		return false, fmt.Errorf("update diary entry: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("update diary entry rows affected: %w", err)
	}

	return rowsAffected > 0, nil
}

func (r *Repository) DeleteDiaryEntry(ctx context.Context, diaryID int64, userID int64) (bool, error) {
	result, err := r.db.ExecContext(ctx, `DELETE FROM foodDiary WHERE id = ? AND usersId = ?`, diaryID, userID)
	if err != nil {
		return false, fmt.Errorf("delete diary entry: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("delete diary entry rows affected: %w", err)
	}

	return rowsAffected > 0, nil
}

func (r *Repository) DeleteDiaryEntriesByDate(ctx context.Context, dateISO string, userID int64) (int64, error) {
	result, err := r.db.ExecContext(ctx, `DELETE FROM foodDiary WHERE dateISO = ? AND usersId = ?`, dateISO, userID)
	if err != nil {
		return 0, fmt.Errorf("delete diary entries by date: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("delete diary entries by date rows affected: %w", err)
	}

	return rowsAffected, nil
}

func (r *Repository) GetWeightByDate(ctx context.Context, dateISO string, userID int64) (*WeightByDateRow, error) {
	row := r.db.QueryRowContext(ctx, `SELECT id, weight FROM foodBodyWeight WHERE dateISO = ? AND usersId = ?`, dateISO, userID)

	var result WeightByDateRow
	if err := row.Scan(&result.ID, &result.Weight); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("get weight by date: %w", err)
	}

	return &result, nil
}

func (r *Repository) CreateWeight(ctx context.Context, dateISO string, weight float64, userID int64) (int64, error) {
	result, err := r.db.ExecContext(ctx, `INSERT INTO foodBodyWeight (dateISO, weight, usersId) VALUES (?, ?, ?)`, dateISO, weight, userID)
	if err != nil {
		return 0, fmt.Errorf("create weight: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("create weight last insert id: %w", err)
	}
	return id, nil
}

func (r *Repository) UpdateWeight(ctx context.Context, dateISO string, weight float64, userID int64) (bool, error) {
	result, err := r.db.ExecContext(ctx, `UPDATE foodBodyWeight SET weight = ? WHERE dateISO = ? AND usersId = ?`, weight, dateISO, userID)
	if err != nil {
		return false, fmt.Errorf("update weight: %w", err)
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("update weight rows affected: %w", err)
	}
	return rowsAffected > 0, nil
}
