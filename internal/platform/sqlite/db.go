package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

type DB struct {
	conn *sql.DB
}

func Open(ctx context.Context, path string) (*DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(0)
	db.SetConnMaxIdleTime(0)

	wrapper := &DB{conn: db}

	if err := wrapper.configure(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}

	return wrapper, nil
}

func (d *DB) SQL() *sql.DB {
	return d.conn
}

func (d *DB) PingContext(ctx context.Context) error {
	return d.conn.PingContext(ctx)
}

func (d *DB) Close() error {
	return d.conn.Close()
}

func (d *DB) configure(ctx context.Context) error {
	pragmaTimeout, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	pragmas := []string{
		"PRAGMA foreign_keys = ON;",
		"PRAGMA journal_mode = WAL;",
		"PRAGMA synchronous = NORMAL;",
		"PRAGMA busy_timeout = 5000;",
	}

	for _, query := range pragmas {
		if _, err := d.conn.ExecContext(pragmaTimeout, query); err != nil {
			return fmt.Errorf("configure sqlite: %w", err)
		}
	}

	if err := d.conn.PingContext(pragmaTimeout); err != nil {
		return fmt.Errorf("ping sqlite: %w", err)
	}

	return nil
}
