# Go Backend Rewrite — Backup Job

> Step 18 Step Closure Doc. Фиксирует перенос backup flow, manual trigger, scheduler integration, и S3-compatible archive upload.

---

## 1. Scope of the step

Step 18 closes:
- SQLite snapshot creation
- ZIP archive creation
- S3-compatible upload flow
- local temp-file cleanup
- shared job runtime integration
- config-gated scheduled execution
- manual compatibility trigger at `/api/debug/run-backup-job`
- automated coverage for archive creation, cleanup, runtime wiring, and trigger behavior

Step 18 does not close:
- final parity pass
- cutover and deploy

---

## 2. Implemented structure

Added:
- `megaapp-back/internal/backup/service.go`
- `megaapp-back/internal/backup/http.go`
- `megaapp-back/internal/backup/service_test.go`
- `megaapp-back/internal/backup/http_test.go`
- `megaapp-back/internal/platform/s3/client.go`

Updated:
- `megaapp-back/internal/config/config.go`
- `megaapp-back/internal/config/config_test.go`
- `megaapp-back/internal/httpx/app.go`
- `megaapp-back/internal/httpx/modules.go`
- `megaapp-back/.env.example`
- `megaapp-back/.env.test.example`
- `megaapp-back/.env`
- `megaapp-back/plans/02-GO-BACKEND-REWRITE.pi.implementation-plan.md`
- `megaapp-back/plans/step-closure-docs/19-GO-BACKEND-REWRITE.pi.backup-job.md`

---

## 3. Runtime decisions fixed by this step

## 3.1 Snapshot-first backup pipeline

The Go backup flow now follows the explicit sequence `snapshot -> archive -> upload -> cleanup` instead of trying to copy live SQLite files directly.

## 3.2 SQLite-native snapshot safety

Backup creation uses `VACUUM INTO` so the uploaded archive contains a clean SQLite snapshot without relying on manual WAL-side-file handling.

## 3.3 Shared scheduler model

Backup execution is attached to the same in-process job runtime already introduced for quotes so async lifecycle rules remain centralized.

## 3.4 Manual and scheduled trigger split

Scheduled execution is config-gated, while `/api/debug/run-backup-job` remains available for operator-triggered verification and maintenance runs.

## 3.5 One local backup workspace

The local temporary backup workspace now consistently uses `./backups` across environments. Environment separation remains in DB naming, config values, and uploaded object keys rather than in separate local folder names.

---

## 4. Automated coverage introduced in this step

Covered:
- snapshot creation flow
- ZIP archive creation
- upload invocation with expected key and content type
- cleanup after success
- cleanup after upload failure
- manual debug trigger response
- config validation for backup settings
- runtime wiring in the app bootstrap

`go test ./...` in `megaapp-back` passed after the Step 18 implementation pass.

---

## 5. Manual verification status

User reran the Step 18 backup smoke checklist after implementation.

Confirmed manually:
- backup trigger works
- snapshot is created locally
- archive is created locally
- archive upload succeeds
- temporary files are deleted afterward
- no visible problems were observed during the check

Step 18 is therefore closed.

---

## 6. What this opens next

This step opens the final remaining migration work:
- Step 19: Final Parity Pass
- Step 20: Cutover And One-Shot Deploy
