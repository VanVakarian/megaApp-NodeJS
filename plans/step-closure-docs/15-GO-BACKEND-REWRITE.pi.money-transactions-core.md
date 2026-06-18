# Go Backend Rewrite — Money Transactions Core

> Step 14 Step Closure Doc. Фиксирует перенос non-invest money transactions и transfer pair semantics, нужных для Transactions tab и последующих invest flows.

---

## 1. Scope of the step

Step 14 closes:
- transactions read route
- income create, update, and delete
- expense create, update, and delete
- transfer pair create, update, and delete
- category compatibility validation for non-invest transactions
- transfer-specific validation and invariants
- explicit SQL transaction boundaries for multi-row transfer mutations
- legacy-compatible transfer pair shape with `twinId` and `detailsJSON.direction`

Step 14 does not close:
- invest transaction rules
- invest payload validation
- opened positions logic
- quotes and backup jobs
- final snapshot/rate-history refinement

---

## 2. Implemented structure

Updated:
- `megaapp-back/internal/money/types.go`
- `megaapp-back/internal/money/repo.go`
- `megaapp-back/internal/money/service.go`
- `megaapp-back/internal/money/http.go`
- `megaapp-back/internal/money/service_test.go`
- `megaapp-back/internal/money/http_test.go`
- `megaapp-back/plans/02-GO-BACKEND-REWRITE.pi.implementation-plan.md`
- `megaapp-back/plans/step-closure-docs/15-GO-BACKEND-REWRITE.pi.money-transactions-core.md`

---

## 3. Runtime decisions fixed by this step

## 3.1 Transaction boundary

Non-invest money transactions now run fully inside the Go money module instead of remaining behind the inherited JS runtime.

## 3.2 Frontend compatibility

The current frontend still bootstraps from the compatibility snapshot, but create, update, and delete flows already hit `/api/money/transactions` directly. Step 14 restores those write paths without changing the existing snapshot-first startup model.

## 3.3 Transfer persistence model

Transfers remain stored as a two-row pair linked through `twinId`, matching the inherited SQLite contract and frontend assumptions.

## 3.4 Transfer mutation safety

Transfer create and update operations now run inside explicit SQL transactions so paired mutations do not leave half-written state.

## 3.5 Delete behavior

Deleting one side of a transfer still removes the paired row through the inherited `twinId` foreign-key cascade behavior.

---

## 4. Automated coverage introduced in this step

Covered:
- transactions route reachability
- income lifecycle
- expense lifecycle
- transfer pair create and update semantics
- delete behavior for regular transactions and transfer pairs
- category/type validation
- transfer rollback behavior under pair-creation failure

`go test ./...` in `megaapp-back` passed after the Step 14 implementation pass.

---

## 5. Manual verification status

User reran the Step 14 manual Transactions-tab smoke checklist after implementation.

Confirmed manually:
- transactions tab works through the Go backend
- income flow works
- expense flow works
- transfer flow works
- transfer update works
- regular transaction delete works
- transfer delete works
- lists and balances stay stable on the intended UI path

Step 14 is therefore closed.

---

## 6. What this opens next

This step opens the next money migration work:
- Step 15: Money Invest Transactions
- Step 16: Money Snapshot And Rate History refinement
