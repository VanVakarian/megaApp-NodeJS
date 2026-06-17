package food

import (
	"context"
	"database/sql"
	"fmt"
)

type SearchVectorRow struct {
	ID             int64
	Name           string
	Kcals          int64
	Protein        float64
	Fat            float64
	Carbs          float64
	Fiber          float64
	Description    string
	LegacyName     *string
	NameVector     []byte
	DescriptionVec []byte
}

func (r *Repository) GetQueryEmbedding(ctx context.Context, query string) ([]byte, error) {
	row := r.db.QueryRowContext(ctx, `SELECT embedding FROM foodSearchQueryEmbeddings WHERE query = ?`, query)

	var embedding []byte
	if err := row.Scan(&embedding); err != nil {
		return nil, nil
	}

	if _, err := r.db.ExecContext(ctx, `
		UPDATE foodSearchQueryEmbeddings
		SET hitCount = hitCount + 1, lastUsedAt = ?
		WHERE query = ?
	`, nowUnixMilli(), query); err != nil {
		return nil, fmt.Errorf("update query embedding usage: %w", err)
	}

	return embedding, nil
}

func (r *Repository) SaveQueryEmbedding(ctx context.Context, query string, embedding []byte) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT OR REPLACE INTO foodSearchQueryEmbeddings (query, embedding, hitCount, lastUsedAt, createdAt)
		VALUES (?, ?, 1, ?, ?)
	`, query, embedding, nowUnixMilli(), nowUnixMilli())
	if err != nil {
		return fmt.Errorf("save query embedding: %w", err)
	}
	return nil
}

func (r *Repository) GetSearchVectors(ctx context.Context) ([]SearchVectorRow, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, name, kcals, protein, fat, carbs, fiber, description, legacyName, nameVec, descriptionVec
		FROM foodCatalogue
		WHERE nameVec IS NOT NULL OR descriptionVec IS NOT NULL
		ORDER BY name ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("get search vectors: %w", err)
	}
	defer rows.Close()

	result := make([]SearchVectorRow, 0)
	for rows.Next() {
		var row SearchVectorRow
		var legacyName sql.NullString
		if err := rows.Scan(&row.ID, &row.Name, &row.Kcals, &row.Protein, &row.Fat, &row.Carbs, &row.Fiber, &row.Description, &legacyName, &row.NameVector, &row.DescriptionVec); err != nil {
			return nil, fmt.Errorf("scan search vector row: %w", err)
		}
		if legacyName.Valid {
			value := legacyName.String
			row.LegacyName = &value
		}
		result = append(result, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate search vector rows: %w", err)
	}
	return result, nil
}
