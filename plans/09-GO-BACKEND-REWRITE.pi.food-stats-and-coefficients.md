# Go Backend Rewrite — Food Stats And Coefficients

> Step 08 artifact. Фиксирует перенос stats cache behavior и coefficients normalization в Go runtime.

---

## 1. Scope of the step

Step 08 closes:
- food stats cache behavior in Go runtime
- stats invalidation after diary and body-weight writes
- coefficients normalization for malformed stored payloads
- `GET /api/food/coefficients-gen` compatibility path reachability
- regression coverage for representative stats and coefficients cases

Step does not close:
- semantic search
- AI product flows
- advanced coefficient-generation worker parity
- catalogue mutation flows

---

## 2. Implemented structure

Added files:
- `megaapp-back/internal/food/stats_cache.go`

Updated:
- `megaapp-back/internal/food/service.go`
- `megaapp-back/internal/food/http.go`
- `megaapp-back/internal/food/http_test.go`
- `megaapp-back/internal/food/service_test.go`
- `megaapp-back/internal/httpx/app.go`
- `megaapp-back/internal/httpx/ops.go`
- `megaapp-back/internal/httpx/router_test.go`
- `megaapp-back/plans/02-GO-BACKEND-REWRITE.pi.implementation-plan.md`

---

## 3. Runtime decisions fixed by this step

## 3.1 Stats cache model

Computed stats are now cached per user inside the Go food service.

## 3.2 Stats invalidation model

Successful diary and body-weight writes invalidate cached stats immediately, so the next stats read recomputes fresh values.

## 3.3 Coefficients normalization model

Stored coefficients are now repaired when payload values are missing, non-positive, `NaN`, `Inf`, or reference unknown catalogue ids.

## 3.4 Compatibility route model

`GET /api/food/coefficients-gen` is reachable in Go runtime and preserves current route compatibility for the migration.

## 3.5 Debug commit-info compatibility

`GET /api/debug/commit-info` is now exposed in Go runtime so the frontend build-info helper no longer produces a recurring `404` during normal application use.

---

## 4. Verification focus

This step must be verified through visible stats behavior rather than raw route existence only.

Expected checks:
- stats endpoint responds successfully
- stats still render after refresh
- diary writes change stats after invalidation and reload
- body-weight writes change stats after invalidation and reload
- no frontend shape mismatch on charts or slider state

---

## 5. Automated coverage introduced in this step

Covered:
- coefficients repair for invalid stored values
- stats cache invalidation after writes
- coefficients-gen route reachability
- debug commit-info route reachability
- existing read and write food tests remain green

---

## 6. Known limitation kept explicit

The old JavaScript coefficient-generation worker is not ported in full yet. Current Go step preserves route compatibility and normalization behavior needed by the active frontend-visible flows, while deeper coefficient-generation parity remains a later migration concern.

The debug commit-info fix was folded into this step because it was a small compatibility gap already visible during the same manual verification cycle and did not require a separate migration boundary.
