# Go Backend Rewrite — Money Setup Foundation

> Step 12 Step Closure Doc. Фиксирует перенос money reference-data foundation, нужной для Setup tab и последующих assets/transactions stepов.

---

## 1. Scope of the step

Step 12 closes:
- organizations CRUD
- currencies CRUD
- categories CRUD
- accounts CRUD
- typed validation for reference-data payloads
- delete guards for linked dependencies
- compatibility `GET /api/money/snapshot` bootstrap path for the current frontend
- fresh-database money schema bootstrap through Go migrations

Step 12 does not close:
- assets CRUD
- transaction engine
- invest-specific rules
- final money snapshot shaping for the later dedicated step
- quotes and backup jobs

---

## 2. Implemented structure

Added files:
- `megaapp-back/migrations/000002_money_schema.sql`
- `megaapp-back/internal/money/types.go`
- `megaapp-back/internal/money/repo.go`
- `megaapp-back/internal/money/service.go`
- `megaapp-back/internal/money/http.go`
- `megaapp-back/internal/money/service_test.go`
- `megaapp-back/internal/money/http_test.go`
- `megaapp-back/plans/step-closure-docs/13-GO-BACKEND-REWRITE.pi.money-setup-foundation.md`

Updated:
- `megaapp-back/internal/httpx/app.go`
- `megaapp-back/internal/httpx/modules.go`
- `megaapp-back/plans/02-GO-BACKEND-REWRITE.pi.implementation-plan.md`

---

## 3. Runtime decisions fixed by this step

## 3.1 Money reference-data boundary

Money setup entities now live in a dedicated Go module instead of remaining behind the inherited JS runtime.

## 3.2 Frontend bootstrap compatibility

The current money frontend still starts from `GET /api/money/snapshot`, not from separate per-entity preload calls. Step 12 therefore adds a compatibility snapshot path immediately so the migrated Setup flows are reachable in the real UI before the later snapshot-focused step.

## 3.3 Validation and guard behavior

Organizations, currencies, categories, and accounts now enforce typed validation and inherited delete-guard rules in Go runtime, including:
- required fields
- enum validation
- parent-category compatibility
- organization and currency existence for accounts
- delete blocking when dependent rows already exist

## 3.4 Schema bootstrap role of the migration

The new SQL migration is bootstrap-only in this step. It creates the money tables when the database is fresh, but it does not rewrite or transform inherited existing money data.

---

## 4. Automated coverage introduced in this step

Covered:
- snapshot bootstrap path reachability
- CRUD route reachability for organizations, currencies, categories, and accounts
- validation failures for bad reference-data payloads
- delete-guard behavior for linked accounts, categories, transactions, and assets
- normalized snapshot asset/account handling required by the current frontend bootstrap

`go test ./...` in `megaapp-back` passed after the Step 12 implementation pass.

---

## 5. Manual verification status

User reran the Step 12 manual Setup-tab smoke checklist after implementation.

Confirmed manually:
- money screen bootstrap works through the Go backend
- organizations CRUD works
- currencies CRUD works
- categories CRUD works
- accounts CRUD works
- delete guards behave correctly on the intended UI path

Step 12 is therefore closed.

---

## 6. What this opens next

This step opens the next money migration work:
- Step 13: Money Assets
- Step 14: Money Transactions Core
- Step 16: Money Snapshot And Rate History refinement
