package auth

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"megaapp-back/internal/platform/sqlite"

	_ "modernc.org/sqlite"
)

func TestServiceRegisterLoginRefreshVerify(t *testing.T) {
	db := openAuthTestDB(t)
	repo := NewRepository(db, sqlite.WriteDB{DB: db})
	service := NewService(repo, NewTokenManager("secret", time.Hour, 24*time.Hour))

	userID, err := service.Register(context.Background(), "alice", "password123")
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}
	if userID <= 0 {
		t.Fatalf("Register() userID = %d, want > 0", userID)
	}

	if _, err := service.Register(context.Background(), "alice", "password123"); err != ErrUsernameTaken {
		t.Fatalf("Register() duplicate error = %v, want ErrUsernameTaken", err)
	}

	tokens, err := service.Login(context.Background(), "alice", "password123")
	if err != nil {
		t.Fatalf("Login() error = %v", err)
	}
	if tokens.AccessToken == "" || tokens.RefreshToken == "" {
		t.Fatal("Login() returned empty tokens")
	}

	if _, err := service.Login(context.Background(), "alice", "wrong"); err != ErrInvalidCreds {
		t.Fatalf("Login() wrong password error = %v, want ErrInvalidCreds", err)
	}

	verifiedClaims, err := service.Verify(tokens.AccessToken)
	if err != nil {
		t.Fatalf("Verify() error = %v", err)
	}
	if verifiedClaims.UserID != userID || verifiedClaims.Username != "alice" {
		t.Fatalf("Verify() claims = %+v", verifiedClaims)
	}

	refreshedTokens, err := service.Refresh(context.Background(), tokens.RefreshToken)
	if err != nil {
		t.Fatalf("Refresh() error = %v", err)
	}
	if refreshedTokens.AccessToken == "" || refreshedTokens.RefreshToken == "" {
		t.Fatal("Refresh() returned empty tokens")
	}
}

func openAuthTestDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("sql.Open() error = %v", err)
	}

	schema := `
		CREATE TABLE users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT,
			hashedPassword TEXT,
			isAdmin BOOLEAN
		);
	`

	if _, err := db.Exec(schema); err != nil {
		_ = db.Close()
		t.Fatalf("Exec() error = %v", err)
	}

	t.Cleanup(func() {
		_ = db.Close()
	})

	return db
}
