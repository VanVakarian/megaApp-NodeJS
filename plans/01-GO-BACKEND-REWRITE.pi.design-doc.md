# Go Backend Rewrite — Architecture Design Doc

> Цель: полностью переписать `megaapp-back` с JavaScript/Fastify на Go так, чтобы фронтенд `megaapp-front` не потребовал заметных изменений и пользователь не увидел функциональной разницы.

---

## 1. Краткий вывод

Решение: не брать «тяжёлый Go-фреймворк». Базой сделать `net/http`, поверх него взять тонкий роутер и middleware-слой уровня `chi`. Это даст идиоматичный Go-подход без лишней магии, но при этом сохранит удобные route groups, middleware, static serving и понятную структуру.

Итоговая ставка:
- HTTP: `net/http` + `chi`
- WebSocket: `nhooyr.io/websocket` или `gorilla/websocket`
- SQLite: `database/sql` + современный SQLite-драйвер
- Миграции: отдельный Go migration runner
- Cron/jobs: внутри процесса, без внешнего оркестратора
- Tests: обычные стандартные Go tests через `testing`, без экзотической тестовой архитектуры
- Deploy: один бинарник + systemd + GitHub Actions

Это лучший баланс для текущего масштаба проекта: мало пользователей, мало одновременных соединений, высокая важность простоты анализа, надёжности и расширяемости.

---

## 2. Что есть сейчас

## 2.1 Backend surface

Текущий backend — один Fastify-процесс с такими зонами:
- `api/auth`
- `api/food`
- `api/money`
- `api/settings`
- `api/ws`
- `api/lab`
- `api/debug`
- `quotes`
- `coefficients`
- `backup`
- `ai`
- `public` static files

Есть cron-задачи:
- пересчёт food coefficients
- ежедневный backup SQLite в S3-compatible storage
- ежедневная загрузка котировок

Есть WebSocket-канал:
- heartbeat
- sync-status
- food realtime search
- food diary sync events
- catalogue update/image events
- voice-streaming сообщения сейчас в основном логируются, а не образуют полноценный серверный voice-pipeline

## 2.2 Две главные продуктовые зоны

### Food
- дневник еды
- каталог продуктов
- КБЖУ
- вес тела
- статистика по дням
- target kcal и nutrient calculations
- user-specific coefficients
- semantic search по embeddings
- AI preview/save flow
- AI voice analysis
- image generation pipeline для карточек каталога

### Money
- currencies
- categories с parent-child
- organizations
- accounts
- assets
- transactions
- transfer pairs
- invest buy/sell/dividend
- global rate history
- analytics на фронте на основе snapshot

## 2.3 Что принципиально важно сохранить

Нельзя ломать:
- все HTTP paths
- форматы request/response
- auth flow `login/refresh/register`
- порядок и смысл полей в snapshot для money
- WebSocket message types и payload contracts
- SQLite как основное хранилище
- текущую продуктовую модель food и money
- optimistic/local-first поведение фронта
- image/static URL structure
- user-visible default flows, default modes, and primary interaction paths unless exact parity is technically impossible

Если сохранение пользовательского поведения технически возможно, его нужно сохранять полностью и без уведомления пользователя о backend migration. Любой временный workaround для manual verification обязан либо использовать уже существующий пользовательский control, либо оставаться strictly internal to the migration process. Менять user-facing default behavior ради удобства step verification нельзя.

---

## 3. Ключевые наблюдения по текущей архитектуре

## 3.1 Сильные стороны текущего решения

- Домен money уже довольно чётко отделён от food.
- Фронтенд хорошо опирается на стабильные API-контракты.
- SQLite для этого масштаба подходит очень хорошо.
- Money snapshot уже фактически является правильной coarse-grained boundary.
- Food stats и money analytics уже частично вынесены в отдельные вычислительные контуры.

## 3.2 Слабые стороны текущего решения

- Вся конфигурация и секреты зашиты в коде.
- DB-layer — набор ручных функций без общей транзакционной модели приложения.
- WebSocket lifecycle держится на глобальных `Map` в памяти процесса.
- Есть смешение доменной логики, инфраструктуры и transport-level кода.
- Есть legacy/manual behavior, который трудно безопасно расширять.
- Часть тяжёлых вычислений делается не там, где это естественно для Go.
- Есть технические зоны, которые уже выглядят как прототипы, а не как стабильные подсистемы.

## 3.3 Важный продуктовый факт

Приложение маленькое. Значит, не нужно строить распределённую архитектуру, event bus, отдельные worker services, брокеры сообщений, CQRS и прочую тяжёлую схему. Нужен качественный монолит.

---

## 4. Архитектурное решение для Go

## 4.1 Общий стиль

Будущий backend — модульный монолит.

Не layered CRUD-приложение в стиле “handlers call db directly”, а простой Go-монолит с явными уровнями:
- transport
- application
- domain
- repository
- infrastructure

Но без искусственного усложнения. То есть не «чистая архитектура ради чистой архитектуры», а практичный Go-вариант.

## 4.2 Почему не тяжёлый framework

Причины не брать Echo/Fiber/Gin как основу:
- проект маленький
- RPS не критичен
- нужны предсказуемость и прозрачность
- `net/http` в Go уже достаточно силён
- лишняя framework-магия здесь не даёт реальной пользы

Причины не идти в чистый `net/http` совсем без роутера:
- слишком много маршрутов
- нужны route groups и middleware chains
- WebSocket/auth/static/docs удобнее держать на тонком маршрутизаторе

Поэтому выбор: лёгкий router, а не framework.

## 4.3 Целевая структура приложения

Предлагаемая верхнеуровневая структура:
- `cmd/server` — входная точка
- `internal/config` — env/config loading
- `internal/httpx` — общие HTTP helpers, middleware, error mapping
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

Внутри каждого домена одинаковый принцип:
- `handler`
- `service`
- `repo`
- `model`

---

## 5. Mapping: текущая архитектура → будущая

| Сейчас | Будущее в Go |
|---|---|
| `server.js` | `cmd/server` + composition root |
| Fastify plugins/hooks | `chi` middleware + explicit setup |
| `api/*-routes.js` | per-domain HTTP handlers |
| `api/*-controller.js` | transport layer handlers |
| `api/*-service.js` | application/domain services |
| `db/db-*.js` | repositories over `database/sql` |
| global maps in `server.js` | explicit in-memory services with mutex/ownership |
| cron in bootstrap | job scheduler module |
| ad-hoc backups | backup service |
| env constants in code | env-based config |
| sqlite wrapper cache | shared DB pool + repository tx helpers |
| manual JSON parsing everywhere | typed DTOs + explicit validation |

---

## 6. Domain boundaries

## 6.1 Auth

Сохранить текущий контракт:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`

Но внутри переписать аккуратно:
- access/refresh token service
- password hashing service
- auth middleware через typed claims
- единый token verifier для HTTP и WebSocket

Важный принцип: фронтендный auth flow остаётся тем же.

## 6.2 Settings

Оставить settings как отдельный маленький домен.

В Go это будет:
- typed settings model
- whitelist updatable fields
- repository for row upsert/read/update
- без SQL string interpolation для поля обновления

## 6.3 Food

Food нужно разделить на 5 подсистем:
- diary
- catalogue
- body-weight
- stats
- AI/search/media

### Food diary
Отдельный сервис для:
- create/edit/delete entry
- delete day
- restore day
- full-update range
- event emission for sync

Важное migration rule для food step sequencing:
- step нельзя считать реально проверяемым только потому, что HTTP write routes уже готовы
- если основной UI path сначала зависит от поиска, модалки, realtime contract или другого transport prerequisite, этот prerequisite должен быть либо уже мигрирован, либо временно заменён fallback path without changing default user-facing behavior
- fallback для manual verification должен использовать существующий UI control или быть полностью внутренним для миграции
- иначе step формально реализован, но practically unreachable for manual verification

### Food catalogue
Отдельный сервис для:
- get catalogue
- get entry
- create legacy entry
- save full product
- delete product
- search

### Food body weight
Отдельный сервис для:
- upsert weight
- range/history retrieval

### Food stats
Самый важный architectural shift: stats должны стать отдельной вычислительной подсистемой внутри food, а не просто набором helper functions.

Нужны:
- stats calculator
- stats cache store
- debounced recalculation scheduler per user
- explicit invalidation rules

### Food AI/search/media
Разделить ещё на 3 части:
- AI text/vision/embedding clients
- semantic search service
- image pipeline service

Текущий JS vector search делает full scan каталога с cosine distance в приложении. Для текущего масштаба это допустимо и в Go. Переписывать это сразу в отдельный vector database не нужно. Правильный Go-вариант здесь — сохранить простую модель: загружаем embeddings из SQLite, считаем similarity в памяти, возвращаем top-N.

Это останется простым, предсказуемым и достаточно быстрым.

## 6.4 Money

Money уже естественно делится на:
- reference data
- ledger
- investments
- rate history
- snapshot projection

### Reference data
Отдельные сервисы или submodules:
- currencies
- categories
- organizations
- accounts
- assets

### Ledger
Главный transactional контур:
- ordinary income/expense
- transfers as paired transactions
- invest operations
- delete/update guards

Здесь Go даст главный выигрыш: можно оформить все money mutations через явные DB transactions и domain validation pipeline.

### Investments
Нужен отдельный investment service для правил:
- какие account kinds допустимы
- как валидируется `detailsJSON`
- как связывается transaction ↔ asset
- как считать open positions input для quotes

### Rate history
Это инфраструктурно-общий, но доменно привязанный модуль:
- fetchers
- normalization
- upsert
- range/full read

### Snapshot projection
`GET /api/money/snapshot` должен стать первоклассным projection endpoint, а не просто «ещё один controller method».

В Go это лучше оформить как dedicated read-model service, который:
- собирает raw data параллельно
- нормализует assets
- фильтрует `rateHistory`
- возвращает snapshot exactly in current shape

Это критично, потому что весь фронт money опирается именно на snapshot.

## 6.5 WebSocket

WebSocket нельзя оставлять как набор глобальных функций. Нужен отдельный `ws hub`.

Он должен отвечать за:
- connection auth
- user rooms
- clientId tracking
- heartbeat
- broadcast to user
- broadcast to all
- typed message dispatch
- sync status on connect

Нужна модель: один hub на процесс, внутри thread-safe registry, но без лишней абстракции.

Food events должны идти в hub через domain event publisher, а не напрямую из handler-level кода.

## 6.6 Quotes

Quotes — отдельный job-oriented модуль:
- determine required tickers
- fetch from providers with fallback chain
- normalize to USD-based internal representation
- upsert by date

Никаких отдельных сервисов/очередей не нужно. Один job runner внутри монолита достаточно.

## 6.7 Backups

Backup — отдельный infrastructure service:
- SQLite snapshot creation
- archive creation
- upload to S3-compatible target
- local cleanup

В Go это будет проще и надёжнее, чем сейчас, потому что можно держать чёткий поток `snapshot → archive → upload → cleanup` без размытых JS side effects.

---

## 7. Persistence strategy

## 7.1 База

SQLite оставляем.

Причины:
- очень мало пользователей
- локальный single-node deployment
- текущая модель отлично ложится на SQLite
- миграция на Postgres не даёт продуктовой ценности

## 7.2 Что улучшить в SQLite usage

В Go-версии нужно с самого старта сделать правильно:
- `WAL` mode
- `busy_timeout`
- foreign keys enabled
- controlled connection settings
- единый init path
- явные транзакции для multi-step mutations

## 7.3 Репозитории

Каждый домен получает свои repository interfaces и SQLite implementations.

Важно:
- не делать «универсальный repository layer на всё»
- не оборачивать SQL в лишний ORM
- писать обычный SQL руками

Для этого проекта raw SQL в Go — лучший вариант.

Причины:
- схема небольшая
- SQL уже понятен
- нужен полный контроль над transaction boundaries
- читаемость будет лучше, чем через ORM

## 7.4 JSON-поля

Сохранить текущие JSON-поля, где это оправдано:
- `moneyAsset.accountIdsJSON`
- `moneyTransaction.detailsJSON`
- `moneyRateHistory.ratesJson`
- food coefficients/search embeddings cache

Но в Go над ними должен быть typed mapping слой:
- в storage лежит JSON
- в домене используются нормальные структуры

То есть не тащить сырой JSON по приложению.

## 7.5 Миграции

Нужен собственный migration runner в Go.

Требования:
- versioned migrations
- up-only как основная модель
- отдельная таблица schema version
- backup-before-migration для production

Старые JS-миграции не надо тащить как долгосрочную основу. Их нужно использовать как источник знаний о схеме, но новая система должна быть нативно Go.

---

## 8. API compatibility strategy

## 8.1 Главный принцип

Фронтенд менять минимально. Идеально — вообще не менять transport contract.

Это означает:
- те же URLs
- те же методы
- те же названия полей
- те же типы ответов
- те же status codes там, где фронт может от них зависеть

## 8.2 DTO boundary

Внутри Go будут свои доменные структуры, но на границе HTTP должны жить отдельные DTO, совместимые с фронтом.

Нельзя позволить внутренней refactor-архитектуре просочиться в API.

## 8.3 Money snapshot

Snapshot должен быть preserved as-is. Это один из самых ценных инвариантов миграции.

## 8.4 Food full update

`/api/food/diary-full-update` тоже должен остаться совместимым побайтно по смыслу структуры, потому что фронт на нём строит локальное состояние diary.

## 8.5 What Legacy Means In This Rewrite

Термин `legacy` в этом rewrite означает не «старое приложение» и не «древний код», а унаследованный внешний контракт текущей системы:
- response shapes
- error payload forms
- status semantics
- WebSocket payload contracts
- другие frontend-visible transport expectations

То есть внутри Go backend можно и нужно наводить более чистую архитектуру, но на внешней границе во время migration допустимы `legacy-compatible` adapters и mappings, если они сохраняют текущую совместимость с frontend.

Важно: cleanup этих контрактов не смешивается с текущим rewrite. После полного cutover и периода стабилизации можно делать отдельную modernization phase, где уже сознательно упрощаются и обновляются внешние API/WS contracts. Но это отдельная задача, а не часть текущей migration цели.

---

## 9. WebSocket compatibility strategy

Нужно сохранить текущий message protocol:
- `PING` / `PONG`
- `SYNC_STATUS`
- `DIARY_ENTRY_CREATED`
- `DIARY_ENTRY_UPDATED`
- `DIARY_ENTRY_DELETED`
- `DIARY_DAY_DELETED`
- `BODY_WEIGHT_UPDATED`
- `SEARCH_QUERY`
- `SEARCH_RESULTS`
- `CATALOGUE_ENTRY_SAVED`
- `CATALOGUE_IMAGE_GENERATED`

Также сохранить:
- token in query/header
- `clientId`
- exclude sender semantics for broadcasts

В Go лучше оформить registry обработчиков сообщений как typed dispatcher, а не как строковый switch по всему приложению.

---

## 10. Background jobs and async work

## 10.1 Что должно остаться внутри одного процесса

Внутри того же сервера можно безопасно оставить:
- quotes job
- backup job
- food coefficient calculation scheduler
- stats recalculation debounce
- image generation queue

Для масштаба проекта это нормально.

## 10.2 Как это должно быть организовано

Нужен единый job runtime:
- startup registration
- graceful shutdown
- panic isolation per job
- structured logging
- explicit config for enable/disable

## 10.3 Image generation

Текущая очередь image generation логически правильна, но её нужно сделать как отдельный Go service:
- bounded queue
- retry/backoff
- single responsibility
- event emission after successful generation
- filesystem abstraction

---

## 11. Configuration and secrets

Это зона, которую в Go-переписывании нужно исправить обязательно.

Новый принцип:
- никаких секретов в repo
- всё через `.env` / `.env.<env>` и env overrides
- startup validation: приложение не стартует при неполной конфигурации

Группы конфигурации:
- app
- auth
- db
- logging
- backup storage
- AI providers
- quotes providers
- cron schedules
- image generation

Для test/prod — явные config profiles без дублирования бизнес-логики.

Отдельно фиксируем:
- рабочие SQLite-файлы живут в `data/`, а не в корне проекта
- naming базы сохраняется в формате `{DB_NAME}-{DB_ENV}-{DB_VERSION}.db`
- при штатной остановке backend должен выполнять checkpoint/truncate WAL, чтобы основной `.db` оставался главным файлом для копирования и backup workflows

---

## 12. Logging, errors, observability

## 12.1 Logging

Сделать structured logging, а не строковый append-only custom logger как сейчас.

Нужны поля:
- request id
- user id
- route
- status code
- duration
- job name
- external provider
- error class

## 12.2 Error model

Нужна единая модель ошибок:
- validation error
- auth error
- not found
- conflict
- internal error
- external provider error

Handlers не должны вручную собирать разнородные ответы в каждом методе.

## 12.3 Health and ops endpoints

Нужны минимальные operational endpoints:
- health
- readiness
- build info

Текущие debug endpoints можно сохранить, но отделить от core runtime.

## 12.4 Prometheus readiness

Метрики Prometheus пока не нужно реализовывать, но архитектуру нужно сразу сделать metrics-friendly.

Это означает:
- единые точки instrumentable middleware для HTTP, jobs, DB и внешних provider calls
- отсутствие жёсткой привязки бизнес-логики к конкретной системе логирования или мониторинга
- возможность позже добавить `/metrics` и внутренний metrics domain без переписывания core-архитектуры
- явные service boundaries, чтобы latency, error rate и throughput можно было навесить поверх существующих модулей

---

## 13. Deployment architecture

## 13.1 Целевой deploy

Без Docker. Один Go-бинарник.

На сервере:
- бинарник
- `.env` или equivalent config file
- SQLite database file
- `public/` directory
- image directories
- systemd unit

## 13.2 GitHub Actions

Pipeline должен делать:
- build binary
- package artifact
- optional remote deploy step
- release metadata/build info

## 13.3 Runtime model

Один процесс обслуживает:
- HTTP
- WebSocket
- cron jobs
- background queues

Для текущего масштаба это правильный монолитный runtime.

---

## 14. Security baseline for the rewrite

Нужно улучшить:
- secrets out of code
- stricter config validation
- safer auth middleware
- request size limits
- multipart limits
- more explicit input validation
- safer file handling
- controlled static file serving
- cleaner separation of debug/lab endpoints

При этом внешний контракт не должен ломаться.

---

## 15. Особые продуктовые и технические риски

## 15.1 Food stats

Это одна из самых чувствительных зон. Логика там не просто CRUD, а доменная математика:
- интерполяция веса
- virtual kcals for missing days
- centered averages
- target kcal derivation
- nutrient targets by goal

Эту логику нельзя «оптимизировать по ощущениям». Её надо переносить максимально буквально по смыслу, а архитектурно улучшать вокруг неё, не ломая математику.

## 15.2 Money analytics split

Сейчас большая часть money analytics живёт на фронте. Это не баг. Для текущего приложения это даже удобно.

Поэтому в Go rewrite не нужно насильно переносить всю аналитику на сервер. Правильнее:
- сохранить current contract
- оставить money analytics на фронте
- сделать backend ответственным за корректные raw projections и invariants

## 15.3 AI integration

AI-поведение inherently probabilistic. Значит, цель не «сделать другой AI pipeline», а стабилизировать инфраструктурную обвязку:
- client abstraction
- timeouts
- fallback policy
- response validation
- logging

## 15.4 Feature debt, который уже существует

В текущем backend есть зоны, похожие на временные решения. При rewrite нужно явно решить, что из этого:
- является продуктовым поведением
- является accidental behavior
- является недоделанным экспериментом

Особенно это касается `lab`, `debug`, voice-streaming и image-analysis flows.

---

## 16. Рекомендуемая целевая архитектура по слоям

## 16.1 Transport

Отвечает только за:
- decode request
- validate DTO
- call service
- encode response
- map errors to HTTP status

Никакой бизнес-логики.

## 16.2 Application services

Отвечают за use cases:
- create transaction
- restore diary day
- build money snapshot
- generate product preview
- run quotes job

Именно здесь должны жить транзакционные сценарии.

## 16.3 Domain layer

Отвечает за:
- rules
- invariants
- typed payload semantics
- calculations that belong to business meaning

## 16.4 Repositories

Отвечают только за persistence.

## 16.5 Infrastructure

Отвечает за:
- SQLite
- S3
- AI clients
- filesystem
- scheduler
- logger
- WebSocket low-level runtime

---

## 17. План миграции широкими мазками

Это не implementation plan, а архитектурная последовательность.

### Stage 1. Freeze contracts
- зафиксировать все HTTP и WS контракты
- зафиксировать shapes для food diary, stats, catalogue, money snapshot
- зафиксировать error/status behavior, где от него зависит фронт

### Stage 2. Build Go skeleton
- server bootstrap
- config
- logging
- db connectivity
- migrations
- auth middleware
- shared error model

### Stage 3. Move simple domains first
- auth
- settings
- money reference entities

### Stage 4. Move transactional money core
- transactions
- transfers
- invest operations
- snapshot projection
- rate history read path

### Stage 5. Move food core
- diary
- body weight
- catalogue
- coefficients
- stats recalculation

### Stage 6. Move realtime and async subsystems
- websocket hub
- food sync events
- semantic search
- quotes jobs
- backups
- image generation

### Stage 7. Move peripheral modules
- debug
- lab
- remaining AI flows

### Stage 8. Cutover
- переключение фронта на Go backend
- наблюдение за parity
- удаление Node runtime dependency

---

## 18. Финальная рекомендация

Переписывать стоит как идиоматичный Go-монолит без тяжёлого framework.

Лучший вариант для этого проекта:
- `net/http` + тонкий router
- raw SQL + SQLite
- модульный монолит
- snapshot/projection-first подход для money
- domain-calculation-first подход для food stats
- встроенный job runtime
- явный WebSocket hub
- строгая config/secrets discipline

Главная идея не в том, чтобы «перевести Fastify на Go», а в том, чтобы:
- сохранить внешний контракт
- упростить внутреннюю архитектуру
- убрать случайную сложность JS-версии
- использовать сильные стороны Go: явность, надёжность, предсказуемость, простой deployment

---

## 19. Что я считаю обязательными архитектурными инвариантами будущей версии

- Один основной Go-бинарник.
- SQLite остаётся базой.
- API/WS contracts сохраняются.
- Без тяжёлого framework.
- Без ORM.
- Деньги остаются raw-data-first, аналитика в основном на фронте.
- Food stats остаются серверной доменной математикой.
- Все multi-step mutations идут через явные DB transactions.
- Бэкенд на Go обязательно покрывается обычными стандартными тестами на базе `testing`.
- Тесты остаются простыми: unit tests для доменной логики и сервисов, integration tests для критичных DB/API сценариев.
- Все секреты выносятся из кода.
- Все async/jobs оформляются как отдельные сервисы внутри монолита.
- Внутреннее устройство переписывается радикально, внешнее поведение — нет.
