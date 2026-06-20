# Go Backend Rewrite — Money Assets

> Step 13 Step Closure Doc. Фиксирует перенос money assets foundation, нужной для Assets tab и последующих invest transaction stepов.

---

## 1. Scope of the step

Step 13 closes:
- assets CRUD
- normalized asset read model
- sorted unique `accountIds` normalization
- brokerage-or-crypto account binding rules
- suspension date validation for asset payloads
- delete guard by linked transactions
- update guard preventing removal of accounts already referenced by linked transactions

Step 13 does not close:
- invest transaction creation and validation
- non-invest transaction engine
- transfer semantics
- rate-history logic
- quotes and backup jobs

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
- `megaapp-back/plans/step-closure-docs/14-GO-BACKEND-REWRITE.pi.money-assets.md`

---

## 3. Runtime decisions fixed by this step

## 3.1 Asset boundary

Money assets now run fully inside the Go money module instead of remaining behind the inherited JS runtime.

## 3.2 Frontend compatibility

The current frontend still consumes assets through the existing snapshot-backed state. Step 13 therefore restores `/api/money/assets` CRUD while keeping asset visibility compatible with the Step 12 snapshot bootstrap path.

## 3.3 Account binding rules

Assets now enforce the inherited rule that only `brokerage` and `crypto` accounts may be attached.

## 3.4 Normalization rules

Incoming `accountIds` are normalized to sorted unique positive ids so frontend state and persisted JSON stay stable.

## 3.5 Linked-transaction guards

Asset deletion is blocked once transactions reference the asset. Asset updates also block removal of account bindings that are already referenced by linked asset transactions.

---

## 4. Automated coverage introduced in this step

Covered:
- assets route reachability
- asset CRUD behavior
- accountIds normalization
- brokerage-or-crypto account validation
- suspension date validation
- delete guard for linked transactions
- update guard for linked account removal

`go test ./...` in `megaapp-back` passed after the Step 13 implementation pass.

---

## 5. Manual verification status

User reran the Step 13 manual Assets-tab smoke checklist after implementation.

Confirmed manually:
- assets tab works through the Go backend
- asset creation works
- account binding works
- asset editing works
- asset guard behavior works correctly on the intended UI path

Step 13 is therefore closed.

---

## 6. What this opens next

This step opens the next money migration work:
- Step 14: Money Transactions Core
- Step 15: Money Invest Transactions
- Step 16: Money Snapshot And Rate History refinement
