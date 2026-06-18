# Go Backend Rewrite — Architecture Hardening And Runtime Guardrails

> Step 10 Step Closure Doc. Фиксирует выравнивание архитектурных границ и runtime guardrails перед входом в money и job-heavy stepы.

---

## 1. Scope of the step

Step 10 closes:
- removal of remaining transport leakage from already migrated service flows
- shared internal error taxonomy with centralized legacy-compatible HTTP error writing
- minimal realtime publication seam between food handlers and WebSocket transport
- injected clock foundation for food stats, search timestamps, sync timestamps, and future job-oriented modules
- composition-root split into smaller module assembly units
- HTTP and WebSocket runtime guardrails
- stricter config validation for insecure defaults and feature-scoped provider config

Step 10 does not close:
- image generation and multipart-heavy food flows
- money domain migration itself
- shared job runtime for quotes and backup implementation
- production deploy and final parity rehearsal

---

## 2. Implemented structure

Added files:
- `megaapp-back/internal/platform/clock/clock.go`
- `megaapp-back/internal/httpx/legacy/legacy.go`
- `megaapp-back/internal/httpx/modules.go`
- `megaapp-back/internal/food/realtime.go`
- `megaapp-back/plans/step-closure-docs/11-GO-BACKEND-REWRITE.pi.architecture-hardening-and-runtime-guardrails.md`

Updated:
- `megaapp-back/internal/httpx/app.go`
- `megaapp-back/internal/httpx/middleware.go`
- `megaapp-back/internal/ws/hub.go`
- `megaapp-back/internal/ws/http.go`
- `megaapp-back/internal/config/config.go`
- `megaapp-back/internal/auth/http.go`
- `megaapp-back/internal/settings/http.go`
- `megaapp-back/internal/settings/service.go`
- `megaapp-back/internal/food/service.go`
- `megaapp-back/internal/food/search_ws.go`
- `megaapp-back/internal/food/catalogue_service.go`
- `megaapp-back/internal/food/catalogue_http.go`
- `megaapp-back/internal/food/write_http.go`
- env example files and automated tests

---

## 3. Runtime decisions fixed by this step

## 3.1 Service boundary cleanup

Settings single-field update no longer reaches the service layer as raw transport maps. Food restore-day flow no longer reaches the service layer through HTTP request structs. The migrated service layer now keeps typed app inputs for these paths.

## 3.2 Shared error model with legacy output preservation

A shared internal app error taxonomy now exists for validation, unauthorized, not-found, conflict, internal, external-provider, and oversized-request cases.

HTTP handlers now reuse centralized legacy-compatible writers, so migrated routes keep their old response body shapes such as:
- `{"message": ...}`
- `{"detail": ...}`
- `{"result": false, "error": ...}`

The change is internal architecture cleanup, not a contract rewrite.

## 3.3 Realtime publication seam

Food write and catalogue handlers no longer talk to the raw WebSocket hub directly. A food-scoped realtime publisher now owns sync timestamp updates and transport event emission for:
- diary create/update/delete
- day delete
- body-weight update
- catalogue saved broadcast

This keeps sender exclusion and current message contracts intact while removing raw hub ownership from handlers.

## 3.4 Clock abstraction

Food stats now derive current dates through injected clock access instead of direct `time.Now()` calls. WebSocket search timestamps and sync timestamps are also routed through injected clock-aware publishers or handlers, creating the platform seam needed by later money, quotes, backup, and scheduler work.

## 3.5 Composition root split

`internal/httpx/app.go` now delegates auth, settings, food, and ws wiring to smaller assembly helpers instead of growing a single large bootstrap block.

## 3.6 Runtime guardrails

Added guardrails:
- request-body limit middleware
- HTTP read, write, and idle timeouts from config
- WebSocket read-size limit
- WebSocket write deadline
- WebSocket read deadline extension on activity
- stricter config validation for insecure JWT default usage outside dev-like environments
- feature-scoped provider config validation

## 3.7 Stats runtime model fixed explicitly

Current stats runtime model is now treated as:
- cache
- explicit invalidation on writes
- recompute on read

No separate debounce scheduler is required at this stage unless later profiling proves it necessary.

---

## 4. Automated coverage introduced in this step

Covered:
- config defaults for new timeout and limit settings
- config rejection of insecure JWT default outside dev-like environments
- oversized HTTP request rejection
- continued WebSocket upgrade through middleware
- continued app startup and shutdown path
- typed settings update parsing
- food service tests no longer depending on transport request structs
- food HTTP tests using the realtime publisher seam
- all existing migrated-package test suites remain green

`go test ./...` in `megaapp-back` passed after the Step 10 changes.

---

## 5. Manual verification status

User reran the Step 10 manual smoke checklist after implementation.

Confirmed manually:
- normal backend startup from the working `.env`
- settings save flow
- food default search flow
- diary create, edit, delete, delete-day, and restore-day flows
- body-weight save and stats refresh
- stable WebSocket `101` behavior without reconnect loops
- cross-tab sync for the already migrated realtime flows

The step is now field-verified on the intended smoke path as well as automated-test-complete.

---

## 6. What this opens next

This step opens the next migration work on stronger foundations:
- Step 11: Food Images, Lab, Debug
- Step 12: Money Setup Foundation
- Step 17: Quotes Job foundation alignment through clock and config discipline
- Step 18: Backup Job foundation alignment through clock and config discipline
