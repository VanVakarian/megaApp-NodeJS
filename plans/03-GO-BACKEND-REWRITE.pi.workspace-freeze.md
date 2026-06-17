# Go Backend Rewrite — Workspace Freeze

> Block 01 artifact. Фиксирует рабочую площадку, reference boundaries и инварианты, которые считаются замороженными перед началом Go-реализации.

---

## 1. Workspace status

Текущая роль директорий:
- `megaapp-back/old-js` — reference implementation на JavaScript. Source of truth по текущему runtime behavior.
- `megaapp-back/plans` — активные design docs и implementation plans для Go rewrite.
- `megaapp-back/plans/backup` — append-only planning artifacts и block-level документы.
- `megaapp-front` — reference consumer backend contracts. Source of truth по фактическим ожиданиям frontend.

Go-реализация дальше строится в корне `megaapp-back` и не должна смешиваться с `old-js`.

---

## 2. Reference sources by concern

## 2.1 Backend runtime behavior

Основной reference backend source:
- `megaapp-back/old-js/server.js`
- `megaapp-back/old-js/api/**`
- `megaapp-back/old-js/db/**`
- `megaapp-back/old-js/quotes/**`
- `megaapp-back/old-js/backup-storage.js`
- `megaapp-back/old-js/s3-backup-service.js`

## 2.2 Frontend contract expectations

Основной reference frontend source:
- `megaapp-front/src/app/shared/types.ts`
- `megaapp-front/src/app/services/auth.service.ts`
- `megaapp-front/src/app/services/settings.service.ts`
- `megaapp-front/src/app/services/network.service.ts`
- `megaapp-front/src/app/services/food/*.ts`
- `megaapp-front/src/app/services/money.service.ts`
- `megaapp-front/src/app/services/money-compute.service.ts`
- `megaapp-front/src/app/components/food/**`
- `megaapp-front/src/app/components/money/**`

Если backend и старый JS расходятся, финальным reference для внешнего контракта считается реальное поведение frontend + старого backend вместе.

---

## 3. Frozen delivery model

Зафиксировано:
- реализация идёт по блокам
- тестирование идёт по блокам
- production deploy по частям не делаем
- cutover делаем один раз, когда весь Go backend готов
- до cutover старый JS backend остаётся reference implementation

---

## 4. Frozen repository shape for Go backend

Целевая верхнеуровневая структура в `megaapp-back`:
- `cmd/server`
- `internal/config`
- `internal/httpx`
- `internal/auth`
- `internal/settings`
- `internal/food`
- `internal/money`
- `internal/ws`
- `internal/quotes`
- `internal/backup`
- `internal/ai`
- `internal/images`
- `internal/debug`
- `internal/lab`
- `internal/platform/sqlite`
- `internal/platform/log`
- `internal/platform/clock`
- `internal/platform/files`
- `internal/platform/s3`
- `migrations`
- `public`
- `plans`

Это freeze-level target shape. Она может уточняться внутри модулей, но не должна переизобретаться на каждом следующем блоке.

---

## 5. Frozen database stance

## 5.1 Main decision

Целевой план на rewrite:
- production schema data migration сейчас не планируется как обязательная часть cutover
- Go backend должен уметь работать с текущей схемой SQLite, используемой старым backend
- текущая основная runtime schema рассматривается как reference schema

## 5.2 What this means operationally

Если в ходе реализации не всплывёт новая архитектурно обязательная причина менять схему, то финальный cutover должен выглядеть так:
- останавливаем старый backend
- поднимаем Go backend поверх той же SQLite database
- не делаем отдельную data migration для production

## 5.3 Why migration runner still exists in plans

Go migration runner всё равно нужен:
- для clean bootstrap нового окружения
- для локальных и test setup
- для безопасной фиксации schema version
- для будущих изменений, если они всё же понадобятся позже

То есть migration infrastructure нужна, но текущий план не требует mandatory production schema rewrite.

---

## 6. Frozen external contracts

## 6.1 Auth HTTP

Must preserve:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`

## 6.2 Settings HTTP

Must preserve:
- `GET /api/settings/`
- `PUT /api/settings/`
- compatibility path for deprecated settings write if frontend/runtime still relies on it

## 6.3 Food HTTP

Critical food routes to preserve:
- `GET /api/food/diary-full-update`
- `POST /api/food/diary/`
- `PUT /api/food/diary`
- `DELETE /api/food/diary/:diaryId`
- `DELETE /api/food/diary/day/:dateISO`
- `POST /api/food/diary/day/:dateISO/restore`
- `GET /api/food/catalogue`
- `GET /api/food/catalogue/:catalogueId`
- `POST /api/food/catalogue/`
- `PUT /api/food/catalogue/`
- `DELETE /api/food/catalogue/:catalogueId`
- `GET /api/food/search`
- `POST /api/food/generate-product-preview`
- `POST /api/food/save-product`
- `POST /api/food/analyze-image`
- `POST /api/food/analyze-voice`
- `GET /api/food/coefficients`
- `GET /api/food/coefficients-gen`
- `POST /api/food/body-weight`
- `GET /api/food/stats`

## 6.4 Money HTTP

Critical money routes to preserve:
- `GET /api/money/organizations`
- `POST /api/money/organizations`
- `PUT /api/money/organizations/:id`
- `DELETE /api/money/organizations/:id`
- `GET /api/money/currencies`
- `POST /api/money/currencies`
- `PUT /api/money/currencies/:id`
- `DELETE /api/money/currencies/:id`
- `GET /api/money/categories`
- `POST /api/money/categories`
- `PUT /api/money/categories/:id`
- `DELETE /api/money/categories/:id`
- `GET /api/money/accounts`
- `POST /api/money/accounts`
- `PUT /api/money/accounts/:id`
- `DELETE /api/money/accounts/:id`
- `GET /api/money/assets`
- `POST /api/money/assets`
- `PUT /api/money/assets/:id`
- `DELETE /api/money/assets/:id`
- `GET /api/money/transactions`
- `GET /api/money/trades`
- `GET /api/money/rate-history`
- `GET /api/money/snapshot`
- `POST /api/money/transactions`
- `PUT /api/money/transactions/:id`
- `DELETE /api/money/transactions/:id`

## 6.5 WebSocket

Critical WS route and connect semantics to preserve:
- `GET /api/ws`
- token via query or bearer header
- `clientId` support
- heartbeat model
- sender-exclusion broadcast behavior

Critical WS message types to preserve:
- `PING`
- `PONG`
- `SYNC_STATUS`
- `DIARY_ENTRY_CREATED`
- `DIARY_ENTRY_UPDATED`
- `DIARY_ENTRY_DELETED`
- `DIARY_DAY_DELETED`
- `BODY_WEIGHT_UPDATED`
- `START_VOICE_RECORDING`
- `STOP_VOICE_RECORDING`
- `AUDIO_CHUNK`
- `SEARCH_QUERY`
- `SEARCH_RESULTS`
- `CATALOGUE_ENTRY_SAVED`
- `CATALOGUE_IMAGE_GENERATED`

## 6.6 Debug and lab

Не считаются first-wave business-critical, но их existence and paths тоже сохраняем до отдельного решения:
- `api/debug/**`
- `api/lab/**`

---

## 7. Frozen parity priorities

Самые чувствительные зоны parity:
- food diary full-update response shape
- food stats calculations
- food realtime sync events
- money transaction invariants
- money snapshot response shape
- money rate-history semantics
- auth token lifecycle
- frontend-visible settings behavior

Именно они считаются top-priority regression targets в следующих блоках.

---

## 8. Frozen observability stance

Prometheus feature пока не реализуем, но freeze-level архитектурное требование уже принято:
- HTTP, DB, jobs и external calls должны иметь понятные instrumentation seams
- metrics domain можно будет добавить позже без распила core architecture
- `/metrics` не входит в ближайшие блоки, но возможность его безопасно добавить считается обязательным design constraint

---

## 9. Exit criteria for Block 01

Block 01 считается закрытым, если:
- reference JS source изолирован и подтверждён как `old-js`
- planning location зафиксирован
- target Go repo shape зафиксирован
- single final deploy strategy зафиксирована
- stance по SQLite schema migration зафиксирована
- critical external contracts перечислены и считаются frozen
