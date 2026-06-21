# Go Backend Rewrite — Coefficients Recalculation Parity

> Step 21 Step Closure Doc. Фиксирует полный перенос legacy-совместимого пересчёта персональных food coefficients в Go runtime — ручной триггер и cron execution.

---

## 1. Scope of the step

Step 21 closes:
- full Go port of the legacy coefficient recalculation loop
- whole-user scheduled job wiring through the shared Go job runtime
- manual operator-driven recalculation trigger
- persistence of recalculated payloads into `foodSettings.coefficients`
- real recalculation behind `GET /api/food/coefficients-gen` (replacing the earlier normalization-only stub from Step 08)

Step does not close:
- legacy detachment / `old-js` removal (Step 22)

---

## 2. Implemented structure

Core files:
- `megaapp-back/internal/food/coefficients_job.go`
- `megaapp-back/internal/food/lab_debug_http.go`
- `megaapp-back/internal/food/lab_debug_service.go`
- `megaapp-back/internal/httpx/app.go` (scheduled job registration)

---

## 3. Runtime decisions fixed by this step

## 3.1 Calculation concept preserved, implementation idiomatic Go

The legacy JavaScript worker-based recalculation algorithm was reimplemented in Go without changing the underlying calculation concept.

## 3.2 Dual trigger paths

Recalculation runs both on a cron schedule through the shared job runtime and on-demand through an operator debug route (`GET /api/debug/run-coefficients-job`), sharing the same service-level implementation.

## 3.3 Real persistence instead of read-only normalization

`GET /api/food/coefficients-gen` now performs an actual recalculation and writes the result into `foodSettings.coefficients`, instead of only repairing already-stored values as in the Step 08 compatibility stub.

---

## 4. Verification focus

Expected checks:
- manual debug trigger actually recalculates and persists, not just reads
- diary and stats kcal totals change consistently before/after recalculation
- cron schedule registers and runs successfully in the test environment

---

## 5. Automated coverage introduced in this step

Covered:
- deterministic coefficient recalculation on representative fixtures
- parity assertions against legacy outputs on copied data
- manual trigger route behavior
- scheduled job registration and execution

`go test ./...` in `megaapp-back` passed after the Step 21 implementation.

---

## 6. Manual verification status

User manually triggered recalculation via the debug route and confirmed:
- `foodSettings.coefficients` is actually updated, not just read
- diary and stats kcal totals change consistently before and after recalculation
- cron schedule registers and runs successfully in the test environment

Step 21 is therefore closed.

---

## 7. What this opens next

This step opens the final migration step:
- Step 22: Legacy Detachment And Old JS Removal
