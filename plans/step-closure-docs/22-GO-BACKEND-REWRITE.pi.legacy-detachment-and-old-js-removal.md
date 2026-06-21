# Go Backend Rewrite — Legacy Detachment And Old JS Removal

> Step 22 Step Closure Doc. Фиксирует полное отвязывание Go backend workspace и deploy/runtime flows от `old-js`. Это последний шаг migration plan'а — после него весь перенос сервера с JavaScript на Go считается завершённым.

---

## 1. Scope of the step

Step 22 closes:
- audit of remaining code, test, workflow, and documentation references to `old-js`
- confirmation that no runtime or CI flow depends on files inside `old-js`
- relocation of `old-js` out of the active backend workspace
- confirmation that no obsolete side-by-side coexistence hooks remain
- a safe, reversible deletion path for `megaapp-back/old-js`

Step does not close:
- permanent, irreversible deletion of `old-js` content — owner chose to keep it recoverable for now (see Section 4)

---

## 2. Audit findings

Full-repo audit for `old-js` references outside `plans/` and the relocated folder itself found exactly one hit:
- `megaapp-back/internal/httpx/legacy_fixture_test.go` — an optional reference-fixture path (`MEGAAPP_LEGACY_FIXTURE_DB` override, falling back to a path under `old-js`). Already designed to `t.Skip()` cleanly when the fixture DB is unavailable, instead of failing.

No CI workflow (`deploy-backend.yml`, `deploy-prod.yml`, `deploy-test.yml`) ever referenced `old-js`, node, or npm — the deploy pipeline was already pure Go.

No side-by-side coexistence mechanism was found to clean up: the migration strategy was a one-shot cutover (Step 20), not a gradual piece-by-piece release, so there was never a runtime mechanism routing traffic between `old-js` and the Go backend that would need decommissioning.

---

## 3. Verification performed

- `go test ./...` run with `old-js` physically absent from the workspace: full suite green, legacy fixture parity tests skip cleanly (`legacy fixture db not available; reference parity suite skipped`) instead of failing.
- Confirmed deploy workflows contain no structural dependency on `old-js` presence.
- User manually confirmed backend startup, full test suite, and deploy workflow all work correctly with `old-js` physically removed from the active workspace, and that cutover checklist, env handling, and runtime paths carry no remaining dependency on the old JS source tree.

---

## 4. Deletion approach taken

`old-js` was moved out of the git-tracked tree into a locally gitignored folder rather than deleted outright (72 of 72 previously tracked files removed from git, none orphaned). This keeps the reference implementation recoverable on disk without it being part of the active, git-tracked backend workspace. Permanent deletion is left as an explicit future decision by the repository owner, not a requirement of this step.

---

## 5. Manual verification status

Confirmed by the user:
- backend starts, tests pass, and deploy workflow works with `old-js` physically absent
- cutover checklist, env handling, and runtime paths no longer reference the old JS source tree
- removal does not break local run, test deploy, or prod deploy

Step 22 is therefore closed.

---

## 6. What this closes

This was the last step of the Go Backend Rewrite implementation plan (`02-GO-BACKEND-REWRITE.pi.implementation-plan.md`). With Step 22 closed, the full migration of the backend from JavaScript to Go is considered complete.
