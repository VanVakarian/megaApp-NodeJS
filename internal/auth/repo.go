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
	IsAdmin        bool
}

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) CreateUser(ctx context.Context, username string, hashedPassword string) (int64, error) {
	result, err := r.db.ExecContext(ctx, `INSERT INTO users (username, hashedPassword, isAdmin) VALUES (?, ?, 0)`, username, hashedPassword)
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
	row := r.db.QueryRowContext(ctx, `SELECT id, username, hashedPassword, isAdmin FROM users WHERE username = ?`, username)
	return scanUser(row)
}

func (r *Repository) GetUserByID(ctx context.Context, userID int64) (*User, error) {
	row := r.db.QueryRowContext(ctx, `SELECT id, username, hashedPassword, isAdmin FROM users WHERE id = ?`, userID)
	return scanUser(row)
}

func (r *Repository) ListAdminUserIDs(ctx context.Context) ([]int64, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id FROM users WHERE isAdmin = 1`)
	if err != nil {
		return nil, fmt.Errorf("list admin user ids: %w", err)
	}
	defer rows.Close()

	var userIDs []int64
	for rows.Next() {
		var userID int64
		if err := rows.Scan(&userID); err != nil {
			return nil, fmt.Errorf("scan admin user id: %w", err)
		}
		userIDs = append(userIDs, userID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate admin user ids: %w", err)
	}
	return userIDs, nil
}

func scanUser(row *sql.Row) (*User, error) {
	var user User
	var isAdmin sql.NullBool
	if err := row.Scan(&user.ID, &user.Username, &user.HashedPassword, &isAdmin); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("get user by username: %w", err)
	}
	user.IsAdmin = isAdmin.Valid && isAdmin.Bool

	return &user, nil
}
