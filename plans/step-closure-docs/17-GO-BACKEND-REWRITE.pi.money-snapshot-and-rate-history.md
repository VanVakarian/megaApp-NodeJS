# Go Backend Rewrite — Money Snapshot And Rate History

> Step 16 Step Closure Doc. Фиксирует перенос money snapshot projection и rate-history contract, от которых зависит текущая money analytics часть frontend.

---

## 1. Scope of the step

Step 16 closes:
- `GET /api/money/snapshot`
- `GET /api/money/trades`
- `GET /api/money/rate-history`
- legacy-compatible snapshot projection assembly
- filtered rate-history projection behavior for snapshot
- snapshot `ratesJson` object shaping for frontend analytics
- direct raw rate-history endpoint compatibility
- representative automated coverage for snapshot, trades, and rate-history behavior

Step 16 does not close:
- quotes ingestion job
- automatic rate updates
- backup job
- final parity pass and cutover

---

## 2. Implemented structure

Updated:
- `megaapp-back/internal/money/types.go`
- `megaapp-back/internal/money/service.go`
- `megaapp-back/internal/money/http.go`
- `megaapp-back/internal/money/service_test.go`
- `megaapp-back/internal/money/http_test.go`
- `megaapp-back/plans/02-GO-BACKEND-REWRITE.pi.implementation-plan.md`
- `megaapp-back/plans/step-closure-docs/17-GO-BACKEND-REWRITE.pi.money-snapshot-and-rate-history.md`

---

## 3. Runtime decisions fixed by this step

## 3.1 Split raw and projected rate-history contracts

The standalone `GET /api/money/rate-history` route keeps the raw DB-facing contract with `ratesJson` stored as a string, while snapshot shaping now uses a dedicated projection path.

## 3.2 Legacy-compatible snapshot filtering

Snapshot `rateHistory` now follows the inherited JS behavior: currency tickers remain available on all dates, while held-asset tickers are retained only on end-of-month rows when positions are still open.

## 3.3 Analytics-facing object shaping

Snapshot `ratesJson` is emitted as an object rather than a raw string so the current frontend analytics and chart code receive the shape they already expect.

## 3.4 Held-position computation boundary

End-of-month held tickers are derived from persisted `invest_buy` and `invest_sell` trades, ordered deterministically and bounded by the injected clock so the projection remains testable and stable.

## 3.5 Compatibility-first route restoration

`/api/money/trades` was restored as a first-class compatibility route even though the current frontend primarily boots from `/api/money/snapshot`, because the legacy backend exposed both contracts and Step 16 explicitly covers them.

---

## 4. Automated coverage introduced in this step

Covered:
- snapshot rate-history filtering
- end-of-month held-asset projection behavior
- snapshot `ratesJson` object shaping
- raw `/api/money/rate-history` response behavior
- `/api/money/trades` response behavior
- snapshot, trades, and rate-history HTTP coverage

`go test ./...` in `megaapp-back` passed after the Step 16 implementation pass.

---

## 5. Manual verification status

User reran the Step 16 money projection smoke checklist after implementation.

Confirmed manually:
- money screen loads correctly
- lists and charts load correctly
- display-currency switching works
- chart-range behavior works
- frontend analytics does not break on the Go snapshot
- no obvious runtime problems were observed during the check

Step 16 is therefore closed.

---

## 6. What this opens next

This step opens the next migration work:
- Step 17: Quotes Job
- Step 18: Backup Job
- Step 19: Final Parity Pass
