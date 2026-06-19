# Go Backend Rewrite — Money Invest Transactions

> Step 15 Step Closure Doc. Фиксирует перенос invest-specific money transactions, нужных для buy/sell/dividend flows и frontend opened positions logic.

---

## 1. Scope of the step

Step 15 closes:
- `invest_buy`
- `invest_sell`
- `invest_dividend`
- invest-specific payload validation
- server-side invest amount recomputation
- brokerage-or-crypto account requirement for invest flows
- asset-to-account binding checks
- asset immutability on invest transaction updates
- snapshot-compatible `investAssetTrades` inputs for the current frontend

Step 15 does not close:
- final money snapshot shaping
- rate-history filtering/refinement
- quotes and backup jobs
- final parity pass and cutover

---

## 2. Implemented structure

Updated:
- `megaapp-back/internal/money/types.go`
- `megaapp-back/internal/money/repo.go`
- `megaapp-back/internal/money/service.go`
- `megaapp-back/internal/money/service_test.go`
- `megaapp-back/internal/money/http_test.go`
- `megaapp-back/plans/02-GO-BACKEND-REWRITE.pi.implementation-plan.md`
- `megaapp-back/plans/step-closure-docs/16-GO-BACKEND-REWRITE.pi.money-invest-transactions.md`

---

## 3. Runtime decisions fixed by this step

## 3.1 Shared transaction contract

Invest writes continue to use the same `/api/money/transactions` route family as non-invest writes so the existing frontend contract stays unchanged.

## 3.2 Server-derived invest amounts

Invest transaction amounts are not trusted from the client. Go recomputes the stored amount from normalized asset details before persistence.

## 3.3 Asset and account constraints

Invest transactions now enforce the inherited constraints that only `brokerage` and `crypto` accounts are valid, the referenced asset must exist, and the asset must belong to the selected account.

## 3.4 Update immutability

Existing invest transactions keep their original asset binding on update. Changing the referenced asset is blocked to preserve inherited behavior.

## 3.5 Opened positions compatibility

The current frontend still derives opened positions from snapshot-provided `investAssetTrades`, so Step 15 keeps that input shape compatible by emitting invest trades from persisted Go-side transactions.

---

## 4. Automated coverage introduced in this step

Covered:
- invest buy lifecycle
- invest sell lifecycle
- invest dividend lifecycle
- invest payload validation
- bond-only accrued-interest rule
- invalid account and asset binding scenarios
- invest update immutability checks
- snapshot `investAssetTrades` compatibility

`go test ./...` in `megaapp-back` passed after the Step 15 implementation pass.

---

## 5. Manual verification status

User reran the Step 15 manual invest-transaction smoke checklist after implementation.

Confirmed manually:
- invest buy works
- invest sell works
- dividend/coupon flow works
- invest edit works
- opened positions behavior works
- invalid account/asset combinations are blocked correctly

Step 15 is therefore closed.

---

## 6. What this opens next

This step opens the next money migration work:
- Step 16: Money Snapshot And Rate History
- Step 17: Quotes Job
- Step 19: Final Parity Pass
