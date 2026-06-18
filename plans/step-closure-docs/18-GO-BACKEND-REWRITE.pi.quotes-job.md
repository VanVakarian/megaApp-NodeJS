# Go Backend Rewrite — Quotes Job

> Step 17 Step Closure Doc. Фиксирует перенос quotes ingestion, manual trigger, scheduler runtime integration, и запись rate history для money analytics.

---

## 1. Scope of the step

Step 17 closes:
- quotes ingestion job
- provider fallback logic
- retry behavior for quote fetches
- ticker discovery from currencies and open positions
- rate-history upsert flow into `moneyRateHistory`
- shared in-process job runtime integration
- config-gated scheduled execution
- manual compatibility trigger at `/api/debug/run-quotes-job`
- automated coverage for job runtime, trigger path, and quote aggregation behavior

Step 17 does not close:
- backup job
- final parity pass
- cutover and deploy

---

## 2. Implemented structure

Added:
- `megaapp-back/internal/jobs/runtime.go`
- `megaapp-back/internal/jobs/runtime_test.go`
- `megaapp-back/internal/quotes/types.go`
- `megaapp-back/internal/quotes/repo.go`
- `megaapp-back/internal/quotes/fetcher.go`
- `megaapp-back/internal/quotes/service.go`
- `megaapp-back/internal/quotes/service_test.go`
- `megaapp-back/internal/quotes/http.go`
- `megaapp-back/internal/quotes/http_test.go`

Updated:
- `megaapp-back/internal/config/config.go`
- `megaapp-back/internal/config/config_test.go`
- `megaapp-back/internal/httpx/app.go`
- `megaapp-back/internal/httpx/app_test.go`
- `megaapp-back/internal/httpx/modules.go`
- `megaapp-back/.env.example`
- `megaapp-back/.env.dev.example`
- `megaapp-back/.env.test.example`
- `megaapp-back/.env`
- `megaapp-back/plans/02-GO-BACKEND-REWRITE.pi.implementation-plan.md`
- `megaapp-back/plans/step-closure-docs/18-GO-BACKEND-REWRITE.pi.quotes-job.md`

---

## 3. Runtime decisions fixed by this step

## 3.1 Shared runtime before more jobs

Quotes now run through a shared in-process job runtime rather than ad-hoc bootstrap scheduling so later backup and remaining async work can attach to the same lifecycle model.

## 3.2 Scheduler and manual trigger split

Scheduled execution is config-gated, while manual execution remains reachable through `/api/debug/run-quotes-job` for smoke verification and operator-triggered refreshes.

## 3.3 Ticker discovery compatibility

The Go quotes job follows the inherited discovery model: currencies come from configured money currencies, and asset quotes come only from currently open invest positions.

## 3.4 Provider fallback ordering

Currencies, crypto, stocks, and bonds keep distinct fallback chains that mirror the inherited provider intent rather than collapsing all quote sources into one generic fetch flow.

## 3.5 Currency-first dependency for MOEX normalization

Stock and bond normalization requires RUB-to-USD rates for matching dates, so the quotes job first merges existing and freshly fetched currency rates and only then executes the MOEX-backed stock and bond fetchers.

---

## 4. Automated coverage introduced in this step

Covered:
- job runtime registration and scheduled execution smoke
- invalid schedule rejection
- quotes ticker discovery and aggregation behavior
- fallback behavior after provider failure
- manual debug trigger response
- config validation for quotes settings
- app wiring with the added runtime

`go test ./...` in `megaapp-back` passed after the Step 17 implementation pass.

---

## 5. Manual verification status

User reran the Step 17 manual quotes smoke checklist after implementation.

Confirmed manually:
- manual quotes trigger works
- rate history updates after the run
- money graphs keep working after updated quotes data
- no visible problems were observed during the check

Step 17 is therefore closed.

---

## 6. What this opens next

This step opens the next migration work:
- Step 18: Backup Job
- Step 19: Final Parity Pass
- Step 20: Cutover And One-Shot Deploy
