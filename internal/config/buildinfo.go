package config

import (
	"encoding/json"
	"os"
)

type buildInfoFile struct {
	Commit string `json:"commit"`
	Time   string `json:"time"`
}

func loadBuildInfo(path string) (commit, buildTime string) {
	commit, buildTime = "local", "unknown"

	data, err := os.ReadFile(path)
	if err != nil {
		return commit, buildTime
	}

	var parsed buildInfoFile
	if err := json.Unmarshal(data, &parsed); err != nil {
		return commit, buildTime
	}

	if parsed.Commit != "" {
		commit = parsed.Commit
	}
	if parsed.Time != "" {
		buildTime = parsed.Time
	}
	return commit, buildTime
}
