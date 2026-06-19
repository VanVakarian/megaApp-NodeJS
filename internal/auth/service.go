package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrUsernameTaken  = errors.New("username is taken")
	ErrInvalidCreds   = errors.New("invalid username and/or password")
	ErrInvalidToken   = errors.New("invalid token")
	ErrInvalidPayload = errors.New("invalid payload")
)

type Service struct {
	repo         *Repository
	tokenManager *TokenManager
}

func NewService(repo *Repository, tokenManager *TokenManager) *Service {
	return &Service{repo: repo, tokenManager: tokenManager}
}

func (s *Service) Register(ctx context.Context, username string, password string) (int64, error) {
	username = strings.TrimSpace(username)
	password = strings.TrimSpace(password)
	if username == "" || password == "" {
		return 0, ErrInvalidPayload
	}

	existingUser, err := s.repo.GetUserByUsername(ctx, username)
	if err != nil {
		return 0, err
	}
	if existingUser != nil {
		return 0, ErrUsernameTaken
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return 0, fmt.Errorf("hash password: %w", err)
	}

	return s.repo.CreateUser(ctx, username, string(hashedPassword))
}

func (s *Service) Login(ctx context.Context, username string, password string) (TokenPair, error) {
	user, err := s.repo.GetUserByUsername(ctx, strings.TrimSpace(username))
	if err != nil {
		return TokenPair{}, err
	}
	if user == nil {
		return TokenPair{}, ErrInvalidCreds
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.HashedPassword), []byte(password)); err != nil {
		return TokenPair{}, ErrInvalidCreds
	}

	return s.tokenManager.Issue(TokenClaims{
		UserID:   user.ID,
		Username: user.Username,
	})
}

func (s *Service) Refresh(_ context.Context, refreshToken string) (TokenPair, error) {
	claims, err := s.tokenManager.Verify(refreshToken)
	if err != nil {
		return TokenPair{}, ErrInvalidToken
	}

	if claims.ExpiresAt != nil && claims.ExpiresAt.Time.Before(time.Now()) {
		return TokenPair{}, ErrInvalidToken
	}

	return s.tokenManager.Issue(TokenClaims{
		UserID:   claims.UserID,
		Username: claims.Username,
	})
}

func (s *Service) Verify(token string) (TokenClaims, error) {
	claims, err := s.tokenManager.Verify(token)
	if err != nil {
		return TokenClaims{}, ErrInvalidToken
	}
	return claims, nil
}
