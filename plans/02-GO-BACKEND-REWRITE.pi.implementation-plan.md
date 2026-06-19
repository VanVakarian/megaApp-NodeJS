# Go Backend Rewrite — Implementation Plan

> Цель: переписать `megaapp-back` на Go по stepам, тестировать по stepам, но деплоить один раз целиком после полной функциональной готовности и полной проверки.

---

## 1. Назначение документа

Этот документ фиксирует верхнеуровневую последовательность реализации.

Он intentionally грубый и будет уточняться по мере движения. Документ ведём append-only:
- уже зафиксированные stepы не переписываем заново
- после завершения stepа добавляем только краткий Result
- детализацию конкретного stepа выносим в отдельный implementation plan, когда до него доходим

---

## 2. Рабочая модель миграции

- Старый backend остаётся рабочим до финального cutover.
- Исходный JavaScript-код хранится рядом как reference implementation.
- Реализация идёт по независимым или слабо связанным stepам.
- Каждый step доводится до локальной работоспособности, покрывается обычными Go tests и отдельно проверяется вручную через mouse-driven сценарии с дополнительной проверкой запросов в DevTools.
- Если пользовательское поведение можно сохранить без изменений, его нужно сохранять полностью. Менять default user-facing flow, default mode, default route, default search behavior или другой заметный UX ради удобства миграции нельзя.
- Временные workaround paths допустимы только для внутренней manual verification и только если они используют уже существующий пользовательский control или остаются полностью внутренними для миграции.
- Промежуточные stepы не деплоятся в production по отдельности.
- В этом плане `legacy-compatible` означает сохранение унаследованного внешнего контракта текущей системы для frontend и existing flows. Это migration tool, а не долгосрочная архитектурная цель.
- Cleanup и modernization внешних API/WS contracts сознательно не смешиваются с текущим rewrite. Их можно планировать только отдельной post-cutover phase после полной функциональной готовности и периода стабилизации.
- Когда добавляются или меняются config/env keys, их нужно синхронно обновлять в `.env.example`, `.env.dev.example`, `.env.test.example` и в актуальном рабочем `.env` этого backend workspace, чтобы локальный run оставался сразу рабочим без ручного догоняния.
- Финальный deploy делается один раз, когда весь backend на Go проходит интеграционную и ручную проверку.

---

## 3. Правила разбиения на stepы

Порядок stepов строим по зависимостям:
- сначала platform и общие контуры
- потом auth и settings
- потом самые простые CRUD/read-модули
- потом stateful и transactional части
- потом realtime, jobs и AI
- потом финальная parity-проверка и cutover

Критерии хорошего stepа:
- у него понятная граница
- у него есть измеримый результат
- у него есть локальные automated tests
- у него есть короткий список ручных UI-проверок только для того, что можно прокликать мышкой
- у manual checklist есть явные ожидания по DevTools Network: какие запросы должны пройти и что не должно быть `401`, `404`, `500` или reconnect loops без причины
- его manual verification path не требует изменения default user-facing behavior
- его можно завершить без частичного production deploy
- если завершённые stepы вскрыли cross-cutting architectural drift, до следующего большого домена допустим отдельный hardening step, который чинит общие границы и guardrails без добавления новой крупной user-visible функциональности

---

## 4. Заранее принятые ограничения

- Стек: Go monolith, без тяжёлого framework.
- Хранилище: SQLite сохраняется.
- Контракты API и WebSocket сохраняются максимально близко к текущим.
- Тесты обязательны, но простые и стандартные: unit + integration для критичных сценариев.
- Архитектура должна остаться готовой к будущей Prometheus instrumentation, но сами метрики пока не реализуются как отдельная фича.
- Внутренний app-level error model допустим и желателен даже там, где внешний response body должен остаться legacy-compatible.
- Transport DTO должны оставаться на HTTP/WS boundary; service/application layer не должны зависеть от request structs и raw transport maps, кроме явно зафиксированных compatibility seams.
- Time-dependent logic для stats, sync timestamps и будущих jobs до начала money и job-heavy stepов переводится на injected clock abstraction.

---

## 5. Основная последовательность stepов

## Step 01. Migration Workspace And Freeze

### Goal
Подготовить безопасную рабочую площадку для Go-реализации и зафиксировать reference boundaries.

### Depends On
- none

### Includes
- финальная фиксация структуры репозитория для Go backend
- подтверждение роли папки со старым JS как reference source
- фиксация naming для планов, design docs, implementation plans и `step-closure-docs`
- фиксация принципа single final deploy
- фиксация списка критичных HTTP/WS contracts, которые нельзя сломать

### Go Test Focus
- tests not applicable as product logic

### Manual Check
- руками ничего в приложении не проверяется
- проверить только что reference JS-код лежит в ожидаемом месте и не мешает новой структуре

### Result
- Status: Done
- Test status: Not applicable for product logic in this step.
- Findings: Reference JS source is isolated in `megaapp-back/old-js`. Go workspace root is now reserved for the rewrite. Critical HTTP/WS contracts, repository shape, final deploy model and current SQLite migration stance are frozen in `megaapp-back/plans/step-closure-docs/03-GO-BACKEND-REWRITE.pi.workspace-freeze.md`.
- Issues and resolutions: The rewrite still needs Go-side migration infrastructure later, but the current plan does not require a mandatory production schema/data migration for cutover as long as Go stays compatible with the current SQLite schema.

---

## Step 02. Platform Foundation

### Goal
Собрать минимальный Go runtime, на который дальше будут навешиваться все домены.

### Depends On
- Step 01

### Includes
- project bootstrap
- config loading
- structured logging
- graceful shutdown
- base router and middleware chain
- SQLite connection lifecycle
- migration runner foundation
- health, readiness, build info endpoints
- metrics-friendly instrumentation seams without Prometheus feature itself
- base test harness for unit and integration tests

### Go Test Focus
- config parsing
- startup validation
- middleware basics
- DB bootstrap and migration smoke tests
- app startup/shutdown integration test

### Manual Check
- запустить Go backend обычной командой без ручной передачи env-переменных
- открыть в браузере `/health`, `/readiness`, `/build-info`
- убедиться, что страницы открываются без ошибок
- остановить сервер и убедиться, что он завершается нормально

### Result
- Status: Done
- Test status: `go test ./...` in `megaapp-back` passed.
- Manual check status: User verified `/health`, `/readiness`, `/build-info`, startup from `.env`, and normal shutdown.
- Findings: Go module, startup entry point, dotenv-based config loading, DB naming convention, structured logging, chi router, ops endpoints, SQLite wrapper, migration runner foundation, graceful shutdown and base HTTP/DB tests are in place. Step Closure Doc: `megaapp-back/plans/step-closure-docs/04-GO-BACKEND-REWRITE.pi.platform-foundation.md`.
- Issues and resolutions: Static serving parity with old backend was intentionally left out of this step because no current domain flow depends on it yet. Migration foundation was added without introducing a mandatory production schema rewrite. SQLite clean shutdown now performs WAL checkpoint/truncate so the main `.db` remains the primary file for copying and backups.

---

## Step 03. Auth Core

### Goal
Перенести authentication boundary так, чтобы весь остальной backend мог строиться уже на Go auth middleware.

### Depends On
- Step 02

### Includes
- register
- login
- refresh
- JWT issue/verify flow
- password hashing
- HTTP auth middleware
- shared token verification for future WebSocket layer

### Go Test Focus
- token issuance and refresh
- invalid token paths
- password hashing and comparison
- protected route integration tests

### Manual Check
- открыть экран `Settings`
- войти под существующим пользователем через форму логина
- обновить страницу после входа и убедиться, что сессия не пропала сразу
- на экране `Settings` нажать кнопку `Выйти`
- снова войти через ту же форму

### Result
- Status: Done
- Test status: `go test ./...` in `megaapp-back` passed after auth integration.
- Manual check status: User verified login on `Settings`, page refresh with preserved session, logout, and repeated login through the UI.
- Findings: Go auth routes, bcrypt password hashing, JWT issue/verify, refresh flow and bearer auth middleware are implemented. Step Closure Doc: `megaapp-back/plans/step-closure-docs/05-GO-BACKEND-REWRITE.pi.auth-core.md`.
- Issues and resolutions: WebSocket auth wiring is intentionally deferred to the dedicated WebSocket step. Current auth step only establishes the shared verification foundation needed by later protected HTTP and WS flows.

---

## Step 04. Settings

### Goal
Закрыть самый маленький пользовательский домен и получить первый полноценный auth-protected CRUD flow на Go.

### Depends On
- Step 03

### Includes
- `GET /api/settings/`
- `PUT /api/settings/`
- compatibility for deprecated write path if needed
- allowed-field validation
- settings row upsert/read/update behavior

### Go Test Focus
- read existing settings
- create defaults when settings absent
- update single setting
- invalid field rejection

### Manual Check
- открыть экран `Settings` под залогиненным пользователем
- включить или выключить `Тёмная тема`
- переключить `Дневник питания` или `Дневник финансов`
- изменить поле `Рост`
- перезагрузить страницу и убедиться, что значения сохранились

### Result
- Status: Done
- Test status: `go test ./...` in `megaapp-back` passed after settings integration.
- Manual check status: User verified settings screen in the UI, including theme toggle, chapter toggles, height save, page refresh with persisted values, and auth flow still working after the settings changes.
- Findings: Go settings routes, settings upsert/read/update behavior, auth-protected settings handlers, default settings bootstrap, and compatibility `POST /api/settings/` path are implemented.
- Issues and resolutions: Initial concern about height rendering was not reproducible after repeated verification. Current behavior matches the expected UI flow on the working database.

---

## Step 05. WebSocket Foundation

### Goal
Поднять Go WebSocket hub отдельно от food/money logic, чтобы realtime-функции дальше подключались поверх стабильного транспорта.

### Depends On
- Step 03

### Includes
- connection auth
- clientId support
- heartbeat
- user socket registry
- sync-status on connect
- broadcast to user
- broadcast to all
- typed message dispatch foundation

### Go Test Focus
- connect/auth success and failure
- heartbeat lifecycle
- add/remove socket behavior
- sender exclusion on broadcast

### Manual Check
- открыть `Settings` в двух вкладках под одним и тем же пользователем
- открыть DevTools -> Network в обеих вкладках
- убедиться, что WebSocket `GET /api/ws?...` открывается со статусом `101 Switching Protocols`; в локальном dev run при frontend на `:4200` или `:4201` он должен идти прямо на backend `:3000`
- убедиться, что `GET /api/settings/` проходит без ошибок
- обновить одну из вкладок и убедиться, что сессия не теряется
- после обновления убедиться, что WebSocket поднимается заново и снова остаётся в `101`
- оставить обе вкладки открытыми примерно на 30 секунд
- убедиться, что нет серий `401`, `500`, failed WebSocket reconnect loops или самопроизвольного logout

### Result
- Status: Done
- Test status: `go test ./...` in `megaapp-back` passed after WebSocket foundation integration. `npx tsc --project tsconfig.app.json --noEmit` in `megaapp-front` passed after frontend WebSocket fix.
- Manual check status: User verified in DevTools Network that the frontend now keeps one stable WebSocket channel, `PING` and `PONG` traffic is visible, repeated short-lived reconnect spam is gone, session survives refresh, and the application remains usable across tabs.
- Findings: Go WebSocket route, auth-gated connect, per-user socket registry, heartbeat, sync-status on connect, sender exclusion foundation, and the frontend single-socket connection model are working together.
- Issues and resolutions: The first transport issue came from missing `Hijacker` support in the Go HTTP logging middleware. The second issue came from the frontend `WebSocketSubject` reconnect model, which was replaced with a single native `WebSocket` connection and explicit reconnect control.

---

## Step 06. Food Read Model Foundation

### Goal
Перенести простые read-side части food, от которых зависят остальные food flows.

### Depends On
- Step 03
- Step 04
- Step 05 partially

### Includes
- food catalogue read path
- single catalogue entry read path
- coefficients read path
- stats cache/read foundation
- food diary full-update read path contract preservation

### Go Test Focus
- catalogue responses
- diary full-update shape compatibility
- coefficients retrieval
- stats read behavior

### Manual Check
- открыть `Food` под залогиненным пользователем
- открыть DevTools -> Network
- убедиться, что проходят `GET /api/food/diary-full-update`, `GET /api/food/catalogue`, `GET /api/food/coefficients`, `GET /api/food/stats`
- убедиться, что `Food` экран открывается без пустого белого состояния и без auth redirect
- проверить, что на экране видны diary данные, catalogue-backed элементы и stats screen открывается без write operations
- убедиться, что нет `401`, `404`, `500` и нет frontend ошибок из-за shape mismatch в этих read endpoints

### Result
- Status: Done
- Test status: `go test ./...` in `megaapp-back` passed after food read integration.
- Manual check status: User verified the `Food` screen in the UI, confirmed successful food read requests in DevTools Network, and reported no functional errors. The only observed non-200 request was `commit-info`, which is outside the current food read scope.
- Findings: Go food read routes for diary full-update, catalogue, coefficients, stats, and single catalogue entry are implemented and frontend-compatible for the current UI flow.
- Issues and resolutions: No food read contract issue was found during manual verification. The unrelated `commit-info` failure remains outside this step scope.

---

## Step 07. Food Write Core

### Goal
Перенести базовые mutating сценарии food без AI-части.

### Depends On
- Step 06

### Includes
- create/edit/delete diary entry
- delete day
- restore day
- body weight upsert
- stats invalidation and recalculation scheduling
- food WebSocket sync events for diary and weight

### Go Test Focus
- diary create/edit/delete flows
- delete-day and restore-day flows
- body weight write flow
- recalculation scheduling behavior
- websocket event emission integration tests

### Manual Check
- открыть `Food` под залогиненным пользователем
- открыть add-food modal
- переключить search mode кнопкой swap в legacy search
- ввести обычное название продукта и убедиться, что список результатов появляется в UI
- открыть DevTools -> Network и DevTools -> Console
- добавить продукт в дневник и убедиться, что проходит `POST /api/food/diary/`
- изменить вес порции и убедиться, что проходит `PUT /api/food/diary`
- удалить запись и убедиться, что проходит `DELETE /api/food/diary/:diaryId`
- удалить день целиком и убедиться, что проходит `DELETE /api/food/diary/day/:dateISO`
- восстановить день и убедиться, что проходит `POST /api/food/diary/day/:dateISO/restore`
- обновить вес тела и убедиться, что проходит `POST /api/food/body-weight`
- открыть вторую вкладку тем же пользователем и убедиться, что diary и body weight sync приходят через WebSocket без ручного refresh
- убедиться, что нет `401`, `404`, `500`, нет frontend shape errors, нет duplicate echo effects в той же вкладке после optimistic updates и нет пустого search state при валидном текстовом вводе

### Result
- Status: Done
- Test status: `go test ./...` in `megaapp-back` passed after food write integration. `npx tsc --project tsconfig.app.json --noEmit` in `megaapp-front` passed.
- Manual check status: User verified Step 07 through the current reachable UI flow, including diary create/edit/delete, delete day, restore day, body weight save, and cross-tab WebSocket sync for diary and body weight.
- Findings: The Go write routes and diary/body-weight WebSocket sync are implemented. Manual verification exposed two compatibility issues during the step: the default add-to-diary path depends on semantic search that is migrated later, and the frontend sends `bodyWeight` as a JSON string. The Go runtime now preserves the existing body-weight payload contract and Step 07 verification uses the existing legacy-search UI toggle without changing default user-facing behavior.
- Issues and resolutions: Go runtime in the current completed steps does not yet implement the `SEARCH_QUERY` -> `SEARCH_RESULTS` WebSocket contract, so Step 07 manual verification uses the existing search-mode toggle as a temporary path. The initial `400` on `POST /api/food/body-weight` came from Go expecting only numeric JSON input, while the old JS backend accepted string payloads through `parseFloat`; the Go handler was corrected to accept both numeric and string `bodyWeight` values.

---

## Step 08. Food Stats And Coefficients

### Goal
Перенести чувствительную food-математику и убедиться, что Go-версия считает те же значения.

### Depends On
- Step 07

### Includes
- stats calculation engine
- coefficients storage and validation
- coefficients recalculation flow
- cache invalidation rules
- parity checks against current behavior on representative data

### Go Test Focus
- deterministic calculation tests on fixed fixtures
- coefficient validation tests
- cache behavior tests
- regression tests for representative historical cases

### Manual Check
- открыть `Food` под залогиненным пользователем
- открыть `DevTools -> Network`
- открыть `Stats` section
- убедиться, что проходит `GET /api/food/stats` без `401`, `404`, `500`
- запомнить текущие значения `kcals`, `target kcals` и графики веса/калорий на видимом диапазоне
- вернуться в diary
- открыть add-food modal
- переключить search mode кнопкой swap в legacy search
- добавить продукт в текущий день
- вернуться в `Stats` section и убедиться, что после reload экрана или refresh проходят `GET /api/food/stats` и `GET /api/food/coefficients`, а kcal values и график калорий изменились согласованно с добавленной записью
- изменить вес тела в текущем дне
- вернуться в `Stats` section и убедиться, что после reload экрана или refresh проходит `GET /api/food/stats`, а weight series и summary изменились без shape errors
- убедиться, что target kcal values присутствуют на исторических данных, virtual/factual kcal series не разваливают график и range slider остаётся рабочим
- убедиться, что нет пустого stats state, нет console errors и нет расхождения между diary totals и stats after refresh

### Result
- Status: Done
- Test status: `go test ./...` in `megaapp-back` passed after stats-cache, coefficient-normalization, and debug commit-info compatibility changes.
- Manual check status: User verified stats rendering, stats refresh after diary and body-weight changes, target kcal visibility, working slider range, and absence of food-related console or network errors. The previously observed `404` on `API Debug Commit Info` is now resolved.
- Findings: The Go stats engine now caches computed stats per user, invalidates them after diary and body-weight writes, preserves the existing `GET /api/food/coefficients-gen` path, repairs malformed coefficient payloads back to valid defaults, and exposes `GET /api/debug/commit-info` for frontend build-info compatibility.
- Issues and resolutions: The current coefficient-generation compatibility path does not port the old background worker algorithm yet; it preserves route reachability and normalization behavior needed by the current frontend-visible flows while the deeper search/AI/advanced food migrations continue in later steps.

---

## Step 09. Food Search And AI Text Flows

### Goal
Перенести food semantic search и текстовые AI-сценарии без image generation queue.

### Depends On
- Step 06
- Step 07
- Step 05

### Includes
- websocket realtime search
- embedding cache flow
- preview generation
- save product
- voice transcript analysis path
- catalogue saved broadcast

### Go Test Focus
- search contract tests
- cache hit/miss behavior
- AI response validation wrappers
- catalogue save/update behavior
- websocket search response tests

### Manual Check
- убедиться, что `OPENROUTER_API_KEY` и `OPENAI_API_KEY` заданы для текущего Go backend run
- открыть `Food` под залогиненным пользователем
- открыть `DevTools -> Network` и `DevTools -> Console`
- открыть add-food modal
- ввести обычное название продукта без переключения в legacy search
- убедиться, что основной search flow снова работает через WebSocket и результаты появляются в UI
- убедиться, что открыт один стабильный `GET /api/ws?...` со статусом `101`, нет reconnect loop и нет `SEARCH_QUERY` без последующего `SEARCH_RESULTS`
- выбрать продукт из результатов и убедиться, что обычный add-to-diary flow не сломан
- в поиске ввести продукт, которого нет в каталоге, перейти в create-product flow и убедиться, что проходит `POST /api/food/generate-product-preview`
- проверить, что create form заполнилась новым AI-generated candidate, а не случайным existing catalogue product
- сохранить новый продукт и убедиться, что проходит `POST /api/food/save-product`
- открыть вторую вкладку тем же пользователем и убедиться, что сохранённый продукт появляется там без ручного refresh через `CATALOGUE_ENTRY_SAVED`
- не добавляя новый продукт в diary, открыть его из `ADD_DIARY_ENTRY` в режим редактирования продукта и убедиться, что проходит `GET /api/food/catalogue/:catalogueId`
- изменить поля и убедиться, что повторный `POST /api/food/save-product` проходит успешно
- удалить именно этот новый ещё не использованный в diary продукт и убедиться, что проходит `DELETE /api/food/catalogue/:catalogueId`
- вручную вызвать `POST /api/food/analyze-voice` с простым transcript и убедиться, что endpoint отвечает без `500`
- убедиться, что нет `401`, `404`, `500`, нет пустого default search state и нет console errors в search/create/edit catalogue flow

### Result
- Status: Done
- Test status: `go test ./...` in `megaapp-back` passed after OpenRouter-backed preview flow, OpenAI embedding generation, cached-embedding search restore, and catalogue save compatibility changes. Manual verification also passed for create, search, add-to-diary, delete-from-diary, edit, and delete-product flows.
- Findings: Step 09 grew beyond the initial minimal search-port expectation and now covers the full user-visible text flow needed for practical parity: default WebSocket search restoration, `SEARCH_QUERY` and `SEARCH_RESULTS` transport, hybrid semantic-plus-lexical search, OpenAI generation and persistence of missing query embeddings, OpenAI generation of fresh catalogue embeddings on save-product, OpenRouter-backed create-product preview generation, OpenRouter-backed voice analysis, catalogue read-edit-delete compatibility, and `CATALOGUE_ENTRY_SAVED` cross-tab sync. OpenRouter and OpenAI runtime keys are now surfaced in `megaapp-back/.env` and the env example files, so the operator has one obvious place to configure them.
- Issues and resolutions: The step boundary moved during implementation because plain cached-vector reuse was not enough for real user parity. The missing provider-backed embedding generation and AI-backed create-product semantics were pulled into Step 09 and completed there instead of being deferred. Image-heavy AI flows remain intentionally outside Step 09 and stay deferred to later steps. Step 09 itself is now closed.

---

## Step 10. Architecture Hardening And Runtime Guardrails

### Goal
Подтянуть общие архитектурные границы и runtime guardrails после уже завершённых food stepов и до входа в money, images и jobs.

### Depends On
- Step 09

### Includes
- удаление remaining transport leakage из service/application layer
- замена HTTP-bound request structs и raw transport maps внутри сервисов на typed app/domain inputs там, где это не ломает внешний контракт
- общий internal error taxonomy и централизованный HTTP mapping при сохранении текущих legacy response bodies и status semantics
- минимальный event publication seam между domain/application services и WebSocket transport
- injected clock abstraction для stats, sync timestamps и будущих job flows
- явная фиксация текущей stats runtime model как `cache + invalidate + recompute-on-read`, если profiling позже не докажет реальную необходимость отдельного debounce scheduler
- разбиение composition root на более мелкие domain assembly units до того, как `app.go` разрастётся из-за money и jobs
- runtime hardening: HTTP timeouts, request/body limits, WebSocket guardrails, feature-scoped config validation и явная policy для insecure defaults только в dev-compatible режимах

### Go Test Focus
- service tests больше не зависят от transport request types
- app-error to legacy HTTP-response mapping tests
- event publication tests with sender exclusion preserved
- deterministic time-dependent tests through injected clock
- startup validation tests for feature-scoped config and insecure-default policy
- HTTP and WebSocket guardrail smoke tests for size and timeout handling

### Manual Check
- запустить Go backend через обычный `.env` и убедиться, что startup rules не сломали нормальный dev run
- пройти smoke path: login, settings save, food search, add/edit/delete diary entry, body weight save, stats refresh, second-tab sync
- подержать WebSocket в двух вкладках и убедиться, что `101` остаётся стабильным, нет reconnect loop и нет спонтанных auth failures
- отправить один намеренно невалидный или oversized request в любой уже мигрированный endpoint и убедиться, что backend отвечает контролируемым `4xx`, а процесс не падает
- убедиться в DevTools Network, что response contracts уже мигрированных основных flow не изменились по форме

### Result
- Status: Done
- Test status: `go test ./...` in `megaapp-back` passed after Step 10 architecture hardening.
- Manual check status: User reran the Step 10 manual smoke checklist and confirmed that startup, settings, food search, diary writes, body-weight saves, stats refresh, stable WebSocket `101`, cross-tab sync, and the already migrated frontend-visible flows still work correctly after the hardening changes.
- Findings: Shared internal error taxonomy and centralized legacy-compatible HTTP error writing are now in place. Settings single-field updates and food restore-day flows no longer leak raw transport shapes into the service layer. Food realtime publication now goes through a module-scoped publisher instead of raw handler-to-hub calls. Food stats, sync timestamps, and search timestamps now use injected clock seams. `internal/httpx/app.go` is split through smaller assembly helpers, HTTP and WebSocket guardrails are configured, and stricter config validation now blocks insecure JWT defaults outside dev-like environments. Step Closure Doc: `megaapp-back/plans/step-closure-docs/11-GO-BACKEND-REWRITE.pi.architecture-hardening-and-runtime-guardrails.md`.
- Issues and resolutions: The old stats-step wording implied a future debounce scheduler, but the current implemented and now explicitly accepted runtime model is `cache + invalidate + recompute-on-read` until profiling proves a stronger need. Manual smoke verification is now complete for this step.

---

## Step 11. Food Images, Lab, Debug

### Goal
Перенести периферийные food-подсистемы после закрытия core food flows.

### Depends On
- Step 09
- Step 10

### Includes
- image analysis endpoint parity
- image generation queue
- image rebuild flows
- safer file handling and controlled image/static serving
- multipart and image payload limits
- lab endpoints
- debug endpoints related to catalogue and AI

### Go Test Focus
- queue lifecycle
- file generation/storage tests
- file path safety and serving tests
- multipart limit tests
- endpoint smoke tests
- external provider error handling tests

### Manual Check
- в UI: image-related food flow, если используется
- вручную вызвать lab/debug сценарии, которые реально нужны
- убедиться, что корректная генерация изображения не ломает остальное приложение
- убедиться, что явно плохой или слишком большой image payload отклоняется контролируемо и не приводит к падению процесса

### Result
- Status: Done
- Test status: `go test ./...` in `megaapp-back` passed after the Step 11 implementation and image-parity correction pass.
- Manual check status: User reran the full Step 11 browser and direct-endpoint smoke checklist and confirmed that the image/static-serving paths, image rebuild behavior, and the intended frontend-visible food flows work correctly after the current changes.
- Findings: Added authenticated `POST /api/food/analyze-image`, controlled `/api/images/food/{filename}` serving, an in-process image pipeline with queued generation and rebuild support, lab routes for product generation, embeddings, image generation, and variant rebuild, plus debug routes for ping, catalogue listing, rate-limit inspection, and catalogue export/import. Catalogue read models now surface `imageVersion` from filesystem-backed image state, multipart requests use a dedicated larger body limit than JSON, and the food module now wires image/media capabilities through the Step 10 service-boundary seams instead of raw handler glue.
- Issues and resolutions: The squircle and corner image variants required a second pass to match the original JS visual geometry. After that correction, Step 11 reached both automated and manual signoff.

---

## Step 12. Money Setup Foundation

### Goal
Перенести money read/write foundation для справочных сущностей в порядке их зависимостей.

### Depends On
- Step 03
- Step 04
- Step 10

### Includes
- organizations CRUD
- currencies CRUD
- categories CRUD
- accounts CRUD
- validations and delete guards

### Dependency Reasoning
- organizations and currencies нужны для accounts
- categories нужны до transactions
- accounts нужны до assets and transactions

### Go Test Focus
- CRUD integration tests for each entity
- delete guard tests
- validation tests for enums and parent-child constraints

### Manual Check
- в UI, вкладка Setup: organizations
- currencies
- categories
- accounts
- create/edit/delete where allowed
- blocked delete where dependency exists

### Result
- Status: Done
- Test status: `go test ./...` in `megaapp-back` passed after the Step 12 implementation pass.
- Manual check status: User manually verified the Setup-tab CRUD flows and delete-guard behavior and confirmed that the migrated money reference-data paths work correctly in the current frontend.
- Findings: Added a dedicated Go `money` module for organizations, currencies, categories, and accounts; restored the corresponding authenticated `/api/money/*` CRUD routes; introduced delete guards and typed validation for reference-data constraints; added a compatibility `GET /api/money/snapshot` read path so the existing money frontend can bootstrap before later transaction and projection steps are migrated; and added a SQL migration that creates the full money schema on fresh databases while remaining compatible with the inherited SQLite layout.
- Issues and resolutions: Step 12 manual reachability depended on the money frontend boot path, which currently starts from `/api/money/snapshot` rather than per-entity list endpoints. A compatibility snapshot route was therefore added in this step instead of waiting for the later snapshot-focused step.

---

## Step 13. Money Assets

### Goal
Перенести assets как отдельный step до транзакций, потому что invest flows зависят от готового asset registry.

### Depends On
- Step 12

### Includes
- assets CRUD
- accountIds binding behavior
- delete guards by linked transactions
- normalized asset read model

### Go Test Focus
- CRUD integration tests
- accountIds normalization tests
- delete guard tests

### Manual Check
- в UI: вкладка Assets
- создать актив
- привязать к счетам
- отредактировать актив
- проверить запрет удаления после появления связанных операций, когда этот сценарий станет доступен

### Result
- Status: Done
- Test status: `go test ./...` in `megaapp-back` passed after the Step 13 implementation pass.
- Manual check status: User manually verified the Assets-tab CRUD flows and asset guard behavior and confirmed that the migrated asset paths work correctly in the current frontend.
- Findings: Restored authenticated `/api/money/assets` CRUD in the Go money module, added normalized asset read/write handling for sorted unique `accountIds`, enforced brokerage-or-crypto account binding rules, preserved inherited suspension-date validation semantics, and blocked both asset deletion and linked-account removal when existing invest transactions already reference the asset.
- Issues and resolutions: The current money frontend boot path still comes from `/api/money/snapshot`, so asset visibility remains coupled to the Step 12 compatibility snapshot. Step 13 therefore extends the existing snapshot-backed state instead of introducing a separate preload flow.

---

## Step 14. Money Transactions Core

### Goal
Перенести non-invest transaction engine и парные transfer flows.

### Depends On
- Step 12

### Includes
- income
- expense
- transfer pair creation
- transfer update/delete semantics
- transaction validation rules
- notes and detailsJSON compatibility where relevant
- explicit DB transaction boundaries for multi-step mutations

### Go Test Focus
- create/update/delete for income and expense
- transfer pair invariants
- invalid category/account scenarios
- rollback behavior on mid-transaction failures
- transaction persistence integration tests

### Manual Check
- в UI: вкладка Transactions
- создать доход
- создать расход
- создать перевод между счетами
- изменить перевод
- удалить обычную транзакцию и перевод
- проверить, что balances/списки не ломаются

### Result
- Status: Done
- Test status: `go test ./...` in `megaapp-back` passed after the Step 14 implementation pass.
- Manual check status: User manually verified the Transactions-tab income, expense, transfer, update, and delete flows and confirmed that the migrated transaction paths work correctly in the current frontend.
- Findings: Restored authenticated `/api/money/transactions` read/write routes in the Go money module, implemented income and expense persistence with category compatibility checks, implemented transfer pair creation and update semantics with explicit SQL transaction boundaries, preserved legacy transfer pair shape with `twinId` and `detailsJSON.direction`, and relied on inherited SQLite cascade deletion so removing one transfer side removes the paired row as well.
- Issues and resolutions: The existing frontend boot path still loads transactions from the compatibility snapshot added earlier, while create/update/delete operations hit `/api/money/transactions` directly. Step 14 therefore had to restore route-level write compatibility without changing the snapshot-first frontend startup model.

---

## Step 15. Money Invest Transactions

### Goal
Перенести invest-specific rules после того, как assets и basic transactions уже готовы.

### Depends On
- Step 13
- Step 14

### Includes
- invest_buy
- invest_sell
- invest_dividend
- invest details validation
- asset/account binding checks
- opened positions input data for frontend

### Go Test Focus
- invest payload validation
- buy/sell/dividend persistence tests
- asset immutability checks on update
- linked account/asset guard tests

### Manual Check
- в UI: создать invest buy
- создать invest sell
- создать dividend/coupon flow
- проверить opened positions behavior
- проверить, что неправильные комбинации счет/актив блокируются

### Result
- Status: Done
- Test status: `go test ./...` in `megaapp-back` passed after the Step 15 implementation pass.
- Manual check status: User manually verified invest buy, sell, dividend/coupon, edit, opened positions, and invalid account/asset combination behavior and confirmed that the migrated invest transaction paths work correctly in the current frontend.
- Findings: Extended the Go money transaction routes to accept `invest_buy`, `invest_sell`, and `invest_dividend`; added invest-specific payload validation and canonical `detailsJSON` normalization; enforced brokerage-or-crypto account requirements and asset-to-account binding checks; preserved asset immutability on invest transaction updates; and kept opened-position frontend inputs compatible by continuing to emit `investAssetTrades` from the snapshot using the stored invest transactions.
- Issues and resolutions: Invest transaction writes reuse the same `/api/money/transactions` contract as non-invest flows, but their stored amount must remain server-derived from asset details rather than blindly trusting the client payload. Step 15 therefore normalizes and recomputes invest amounts on the Go side before persistence.

---

## Step 16. Money Snapshot And Rate History

### Goal
Перенести главный money projection contract, от которого зависит весь frontend money analytics.

### Depends On
- Step 12
- Step 13
- Step 14
- Step 15

### Includes
- `GET /api/money/transactions`
- `GET /api/money/trades`
- `GET /api/money/rate-history`
- `GET /api/money/snapshot`
- asset normalization
- filtered rate-history projection behavior
- representative JS-vs-Go parity fixtures for snapshot and rate-history contracts

### Go Test Focus
- snapshot shape compatibility tests
- rate-history projection tests
- trades response tests
- fixture-based parity tests against current backend outputs on representative copied data
- golden-fixture comparisons captured from the old JS backend for money snapshot and rate-history

### Manual Check
- в UI: открыть money screen
- проверить, что все списки и графики загружаются
- проверить смену display currency
- проверить диапазоны charts
- проверить, что frontend analytics не разваливается на snapshot from Go

### Result
- Status: Done
- Test status: `go test ./...` in `megaapp-back` passed after the Step 16 implementation pass.
- Manual check status: User manually verified the money screen, list and chart loading, display-currency switching, chart-range behavior, and analytics rendering against the Go snapshot and confirmed that the migrated projection paths work correctly in the current frontend.
- Findings: Added legacy-compatible `GET /api/money/trades` and `GET /api/money/rate-history` routes; moved money snapshot assembly onto a dedicated projection path that now filters `rateHistory` like the old JS backend by keeping currency tickers on all dates and held-asset tickers only on end-of-month records; and restored snapshot `ratesJson` object shaping for frontend analytics while keeping the standalone rate-history endpoint raw.
- Issues and resolutions: The previous Go snapshot returned raw `ratesJson` strings for every rate-history row, which was reachable by the frontend but not actually legacy-parity behavior. Step 16 now separates raw rate-history reads from the filtered snapshot projection so direct API compatibility and analytics-input compatibility both remain correct.

---

## Step 17. Quotes Job

### Goal
Перенести quotes ingestion после готовности money rate-history domain.

### Depends On
- Step 16

### Includes
- provider fallback logic
- normalization to internal representation
- required ticker discovery
- integration with shared in-process job runtime and injected clock
- config-gated enable/disable behavior
- scheduled and manual trigger support

### Go Test Focus
- normalization tests
- provider fallback tests with mocks
- upsert behavior tests
- job runtime registration and config gating tests
- scheduled job smoke test

### Manual Check
- вручную триггернуть quotes job
- проверить, что rate history обновляется
- проверить, что money graphs используют новые данные без регрессий

### Result
- Status: Done
- Test status: `go test ./...` in `megaapp-back` passed after the Step 17 implementation pass.
- Manual check status: User manually verified the quotes job trigger, rate-history updates, and money-chart behavior after the Go quotes run and confirmed that the migrated quotes flow works correctly without visible regressions.
- Findings: Added a shared in-process job runtime, implemented the Go quotes job with ticker discovery from currencies and open positions, restored provider fallback and retry behavior for currency, crypto, stock, and bond sources, added raw rate-history upserts into `moneyRateHistory`, and exposed a manual compatibility trigger at `/api/debug/run-quotes-job` while keeping scheduled execution behind config gating.
- Issues and resolutions: Stock and bond normalization depend on RUB-to-USD rates being present for the same dates, just like the inherited JS flow. Step 17 therefore merges existing and freshly fetched currency rates first, then runs stock and bond fetchers against that merged rate map instead of treating all provider groups as independent.

---

## Step 18. Backup Job

### Goal
Перенести production-critical backup flow отдельно от business domains.

### Depends On
- Step 02
- Step 10

### Includes
- SQLite snapshot creation
- archive creation
- upload to S3-compatible storage
- cleanup logic
- integration with shared in-process job runtime and injected clock
- config-gated enable/disable behavior
- scheduled and manual trigger support if needed

### Go Test Focus
- archive creation tests
- storage client tests with mocks
- cleanup tests
- job runtime registration and config gating tests
- backup workflow integration smoke test

### Manual Check
- вручную запустить backup flow
- проверить локальное создание snapshot/archive
- проверить upload в target storage
- проверить cleanup временных файлов

### Result
- Status: Done
- Test status: `go test ./...` in `megaapp-back` passed after the Step 18 implementation pass.
- Manual check status: User manually verified backup triggering, local snapshot and archive creation, successful upload, and temp-file cleanup and confirmed that the migrated backup flow works correctly.
- Findings: Added a dedicated Go backup module with SQLite snapshot creation through `VACUUM INTO`, ZIP archive creation, S3-compatible upload through the AWS SDK, guaranteed local temp-file cleanup, config-gated scheduled execution on the shared job runtime, and a manual compatibility trigger at `/api/debug/run-backup-job`. Backup temp files now consistently use the shared `./backups` directory instead of a separate test-only folder.
- Issues and resolutions: Backup execution needs to reuse the already-running SQLite database safely without copying WAL side files by hand. Step 18 therefore uses SQLite-native snapshot creation first, then archives that snapshot, uploads the archive, and cleans temporary files afterward instead of trying to zip the live DB files directly. Environment separation remains in DB names, env values, and remote object keys rather than in different local backup directory names.

---

## Step 19. Final Parity Pass

### Goal
Свести все куски в единый backend и закрыть cross-domain регрессии перед cutover.

### Depends On
- Steps 02 through 18

### Includes
- full automated test run
- full manual regression checklist
- strict config/profile validation pass
- production startup rehearsal
- migration rehearsal on copied data
- rerun of representative fixture parity checks for food stats and money snapshot/rate-history
- load sanity for low-concurrency real usage

### Go Test Focus
- full suite
- end-to-end critical path tests
- representative fixture parity tests for food and money
- startup matrix checks for prod-like config profiles

### Manual Check
- пройти весь auth flow
- пройти food diary, stats, search, restore flows
- пройти money setup, assets, transactions, charts flows
- проверить WebSocket sync в нескольких вкладках
- проверить jobs, если они запускаются вручную в test env

### Result
- Status: Pending

---

## Step 20. Cutover And One-Shot Deploy

### Goal
Переключить приложение на Go backend одним deploy после завершения всех предыдущих stepов.

### Depends On
- Step 19

### Includes
- final build and packaging
- deploy through target GitHub Actions path
- smoke verification in target environment
- controlled rollback plan
- post-cutover observation window

### Go Test Focus
- release artifact smoke
- deploy pipeline smoke

### Manual Check
- production-like smoke after deploy
- login
- food main flows
- money main flows
- websocket sync sanity
- health/build/readiness sanity

### Result
- Status: Pending

---

## 6. Почему порядок именно такой

- Auth нужен почти всему.
- Settings — самый маленький безопасный домен, хороший первый functional slice.
- WebSocket foundation нужно сделать до food realtime sync и search, иначе потом придётся переделывать transport layer.
- Food лучше начинать с read/write core, а AI и images оставить позже, потому что они менее фундаментальны и сильнее завязаны на внешние provider integrations.
- После завершения core food flows добавлен отдельный hardening step, потому что completed stepы уже вскрыли реальные cross-cutting проблемы границ: transport leakage, event ownership, time-dependence и runtime guardrails. Дешевле исправить это один раз до money и jobs, чем размножить в новых доменах.
- Money сначала идёт через reference data, потом assets, потом transactions, потом investments, потом snapshot. Это соответствует реальной зависимости вкладок и данных во frontend.
- Quotes и backup лучше переносить после доменной базы, но уже поверх общего job/runtime foundation и clock discipline, чтобы не собирать второй раз infrastructure patterns в каждом job-oriented модуле.
- Final parity и deploy — только в самом конце, потому что стратегия миграции сознательно не предполагает piece-by-piece production release.

---

## 7. Что будем уточнять позже отдельными документами

Отдельные детальные implementation plans почти наверняка понадобятся для:
- architecture hardening pass
- food stats parity
- food search and AI integration
- money invest transactions
- money snapshot parity
- quotes ingestion
- backup flow
- final cutover checklist

---

## 8. Первый ожидаемый детальный follow-up

Первым детальным implementation plan логично делать Step 02.

Причина:
- он открывает всю остальную работу
- он минимально зависит от продуктовой специфики food/money
- он задаёт testing scaffold, config model, startup model и observability seams для всех следующих stepов
