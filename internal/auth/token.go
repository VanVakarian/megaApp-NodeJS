package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type TokenClaims struct {
	UserID   int64  `json:"id"`
	Username string `json:"username"`
	jwt.RegisteredClaims
}

type TokenPair struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
}

type TokenManager struct {
	secret          []byte
	accessTokenTTL  time.Duration
	refreshTokenTTL time.Duration
}

func NewTokenManager(secret string, accessTokenTTL time.Duration, refreshTokenTTL time.Duration) *TokenManager {
	return &TokenManager{
		secret:          []byte(secret),
		accessTokenTTL:  accessTokenTTL,
		refreshTokenTTL: refreshTokenTTL,
	}
}

func (m *TokenManager) Issue(claims TokenClaims) (TokenPair, error) {
	accessToken, err := m.sign(claims, m.accessTokenTTL)
	if err != nil {
		return TokenPair{}, err
	}

	refreshToken, err := m.sign(claims, m.refreshTokenTTL)
	if err != nil {
		return TokenPair{}, err
	}

	return TokenPair{AccessToken: accessToken, RefreshToken: refreshToken}, nil
}

func (m *TokenManager) Verify(token string) (TokenClaims, error) {
	parsed, err := jwt.ParseWithClaims(token, &TokenClaims{}, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return m.secret, nil
	})
	if err != nil {
		return TokenClaims{}, err
	}

	claims, ok := parsed.Claims.(*TokenClaims)
	if !ok || !parsed.Valid {
		return TokenClaims{}, fmt.Errorf("invalid token claims")
	}

	return *claims, nil
}

func (m *TokenManager) sign(baseClaims TokenClaims, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := TokenClaims{
		UserID:   baseClaims.UserID,
		Username: baseClaims.Username,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signedToken, err := token.SignedString(m.secret)
	if err != nil {
		return "", fmt.Errorf("sign token: %w", err)
	}

	return signedToken, nil
}
