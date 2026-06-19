package httpx

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"megaapp-back/internal/config"
)

type StatusResponse struct {
	Status string `json:"status"`
}

type BuildInfoResponse struct {
	Version   string `json:"version"`
	Commit    string `json:"commit"`
	BuildTime string `json:"buildTime"`
	GoVersion string `json:"goVersion"`
	AppEnv    string `json:"appEnv"`
}

type CommitInfoResponse struct {
	CommitHash     string `json:"commitHash"`
	CommitDateTime string `json:"commitDateTime"`
}

type readinessChecker func(context.Context) error

func HealthHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, StatusResponse{Status: "ok"})
	}
}

func ReadinessHandler(check readinessChecker) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()

		if err := check(ctx); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, StatusResponse{Status: "not_ready"})
			return
		}

		writeJSON(w, http.StatusOK, StatusResponse{Status: "ready"})
	}
}

func BuildInfoHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, BuildInfoResponse{
			Version:   cfg.BuildVersion,
			Commit:    cfg.BuildCommit,
			BuildTime: cfg.BuildTime,
			GoVersion: cfg.GoVersion,
			AppEnv:    cfg.AppEnv,
		})
	}
}

func CommitInfoHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, CommitInfoResponse{
			CommitHash:     cfg.BuildCommit,
			CommitDateTime: cfg.BuildTime,
		})
	}
}

func writeJSON(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}
