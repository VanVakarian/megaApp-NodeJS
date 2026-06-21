package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadBuildInfo(t *testing.T) {
	tests := []struct {
		name          string
		fileContent   string
		writeFile     bool
		wantCommit    string
		wantBuildTime string
	}{
		{
			name:          "missing file falls back to defaults",
			writeFile:     false,
			wantCommit:    "local",
			wantBuildTime: "unknown",
		},
		{
			name:          "valid json is parsed",
			writeFile:     true,
			fileContent:   `{"commit":"abc1234","time":"21.06.2026, 14:32:10"}`,
			wantCommit:    "abc1234",
			wantBuildTime: "21.06.2026, 14:32:10",
		},
		{
			name:          "invalid json falls back to defaults",
			writeFile:     true,
			fileContent:   `not json`,
			wantCommit:    "local",
			wantBuildTime: "unknown",
		},
		{
			name:          "empty fields fall back to defaults",
			writeFile:     true,
			fileContent:   `{"commit":"","time":""}`,
			wantCommit:    "local",
			wantBuildTime: "unknown",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "build-info.json")
			if tt.writeFile {
				if err := os.WriteFile(path, []byte(tt.fileContent), 0o644); err != nil {
					t.Fatalf("WriteFile() error = %v", err)
				}
			}

			commit, buildTime := loadBuildInfo(path)
			if commit != tt.wantCommit {
				t.Fatalf("commit = %q, want %q", commit, tt.wantCommit)
			}
			if buildTime != tt.wantBuildTime {
				t.Fatalf("buildTime = %q, want %q", buildTime, tt.wantBuildTime)
			}
		})
	}
}
