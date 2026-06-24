package metrics

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
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
		ORDER BY minuteBucket ASC, service ASC, metricName ASC
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

func (r *Repository) ReplaceSnapshots(ctx context.Context, service string, snapshots []SnapshotInput) ([]MetricPoint, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin metrics tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	points := make([]MetricPoint, 0)
	for _, snapshot := range snapshots {
		for name, value := range snapshot.Metrics {
			if _, err := tx.ExecContext(ctx, `
				INSERT INTO metrics (service, metricName, minuteBucket, value)
				VALUES (?, ?, ?, ?)
				ON CONFLICT(service, metricName, minuteBucket) DO UPDATE SET value = excluded.value
			`, service, name, snapshot.MinuteBucket, value); err != nil {
				return nil, fmt.Errorf("replace metrics snapshot: %w", err)
			}

			points = append(points, MetricPoint{
				Service: service,
				Name:    name,
				Bucket:  snapshot.MinuteBucket,
				Value:   value,
			})
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit metrics tx: %w", err)
	}

	sort.Slice(points, func(i, j int) bool {
		if points[i].Bucket != points[j].Bucket {
			return points[i].Bucket < points[j].Bucket
		}
		if points[i].Service != points[j].Service {
			return points[i].Service < points[j].Service
		}
		return points[i].Name < points[j].Name
	})

	return points, nil
}

func (r *Repository) ListLatestPointsByService(ctx context.Context) ([]MetricPoint, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT m.service, m.metricName, m.minuteBucket, m.value
		FROM metrics m
		JOIN (
			SELECT service, MAX(minuteBucket) AS minuteBucket
			FROM metrics
			GROUP BY service
		) latest
		  ON latest.service = m.service
		 AND latest.minuteBucket = m.minuteBucket
		ORDER BY m.service ASC, m.metricName ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("list latest metric points by service: %w", err)
	}
	defer rows.Close()

	points := make([]MetricPoint, 0)
	for rows.Next() {
		var point MetricPoint
		if err := rows.Scan(&point.Service, &point.Name, &point.Bucket, &point.Value); err != nil {
			return nil, fmt.Errorf("scan latest metric point: %w", err)
		}
		points = append(points, point)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate latest metric points: %w", err)
	}

	return points, nil
}
