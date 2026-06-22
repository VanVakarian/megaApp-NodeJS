package metrics

import (
	"context"
	"database/sql"
	"fmt"
)

type MetricPoint struct {
	Service string  `json:"service"`
	Name    string  `json:"name"`
	Bucket  int64   `json:"bucket"`
	Value   float64 `json:"value"`
}

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) AddToCounter(ctx context.Context, service string, name string, bucket int64, delta float64) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO metrics (service, metricName, minuteBucket, value)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(service, metricName, minuteBucket) DO UPDATE SET value = value + excluded.value
	`, service, name, bucket, delta)
	if err != nil {
		return fmt.Errorf("add to metric counter: %w", err)
	}
	return nil
}

func (r *Repository) ListSince(ctx context.Context, sinceBucket int64) ([]MetricPoint, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT service, metricName, minuteBucket, value
		FROM metrics
		WHERE minuteBucket > ?
		ORDER BY minuteBucket ASC
	`, sinceBucket)
	if err != nil {
		return nil, fmt.Errorf("list metrics since: %w", err)
	}
	defer rows.Close()

	points := make([]MetricPoint, 0)
	for rows.Next() {
		var point MetricPoint
		if err := rows.Scan(&point.Service, &point.Name, &point.Bucket, &point.Value); err != nil {
			return nil, fmt.Errorf("scan metric point: %w", err)
		}
		points = append(points, point)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate metrics: %w", err)
	}
	return points, nil
}
