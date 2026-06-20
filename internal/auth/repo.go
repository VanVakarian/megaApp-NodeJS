package auth

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

type User struct {
	ID             int64
	Username       string
	HashedPassword string
}

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) CreateUser(ctx context.Context, username string, hashedPassword string) (int64, error) {
	result, err := r.db.ExecContext(ctx, `INSERT INTO users (username, hashedPassword) VALUES (?, ?)`, username, hashedPassword)
	if err != nil {
		return 0, fmt.Errorf("create user: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("create user last insert id: %w", err)
	}

	return id, nil
}

func (r *Repository) GetUserByUsername(ctx context.Context, username string) (*User, error) {
	row := r.db.QueryRowContext(ctx, `SELECT id, username, hashedPassword FROM users WHERE username = ?`, username)

	var user User
	if err := row.Scan(&user.ID, &user.Username, &user.HashedPassword); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("get user by username: %w", err)
	}

	return &user, nil
}
