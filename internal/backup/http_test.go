package backup

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

func TestDebugRouteRunsBackupJob(t *testing.T) {
	db, _ := openBackupTestDB(t)
	seedBackupTestDB(t, db)
	service := NewService(db, Config{
		DatabaseName:    "megaapp",
		DatabaseEnv:     "test",
		DatabaseVersion: "005",
		BackupsDir:      filepath.Join(t.TempDir(), "backups"),
		StorageEnabled:  true,
	}, fixedClock{now: time.Date(2026, time.July, 20, 10, 30, 0, 0, time.UTC)}, &fakeUploader{})

	router := chi.NewRouter()
	RegisterDebugRoutes(router, NewDebugHandler(service))
	server := httptest.NewServer(router)
	defer server.Close()

	response, err := http.Get(server.URL + "/api/debug/run-backup-job")
	if err != nil {
		t.Fatalf("http.Get() error = %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", response.StatusCode)
	}

	var payload map[string]any
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("Decode() error = %v", err)
	}
	if payload["result"] != true {
		t.Fatalf("result = %v, want true", payload["result"])
	}
	if payload["cleanedUp"] != true {
		t.Fatalf("cleanedUp = %v, want true", payload["cleanedUp"])
	}
}
