# Go Backend Rewrite — Platform Foundation

> Step 02 Step Closure Doc. Фиксирует, что именно было заложено в базовый Go runtime до начала продуктовых доменов.

---

## 1. Scope of the step

Step 02 закрывает только общую платформу:
- bootstrap
- config
- dotenv-based config profiles
- logging
- graceful shutdown
- base router
- SQLite lifecycle
- migration runner foundation
- ops endpoints
- testing scaffold
- instrumentation seams

Step сознательно не включает:
- auth logic
- settings domain logic
- food domain logic
- money domain logic
- production deploy changes

---

## 2. Implemented structure

Добавлены базовые директории и файлы:
- `megaapp-back/go.mod`
- `megaapp-back/.gitignore`
- `megaapp-back/.env.example`
- `megaapp-back/.env.test.example`
- `megaapp-back/cmd/server/main.go`
- `megaapp-back/internal/config/config.go`
- `megaapp-back/internal/config/dotenv.go`
- `megaapp-back/internal/httpx/app.go`
- `megaapp-back/internal/httpx/middleware.go`
- `megaapp-back/internal/httpx/observer.go`
- `megaapp-back/internal/httpx/ops.go`
- `megaapp-back/internal/platform/log/logger.go`
- `megaapp-back/internal/platform/sqlite/db.go`
- `megaapp-back/internal/platform/sqlite/migrations.go`
- `megaapp-back/migrations/README.md`

Тесты:
- `internal/config/config_test.go`
- `internal/platform/sqlite/sqlite_test.go`
- `internal/httpx/router_test.go`
- `internal/httpx/app_test.go`

---

## 3. Runtime decisions fixed by this step

## 3.1 Entry point

Точка входа:
- `cmd/server/main.go`

Она отвечает за:
- загрузку config
- создание logger
- создание app
- запуск HTTP server
- graceful shutdown по `SIGINT` и `SIGTERM`

## 3.2 Config model

Config сейчас читается из `.env` / `.env.<APP_ENV>` и env, затем валидируется на старте.

Operational rule for this workspace:
- when config keys are added or changed, update `.env.example`, `.env.test.example`, and the active local `.env` together so the working backend run stays immediately usable without manual catch-up

Заложены поля:
- `APP_ENV`
- `APP_HOST`
- `APP_PORT`
- `LOG_LEVEL`
- `DATA_DIR`
- `DB_NAME`
- `DB_ENV`
- `DB_VERSION`
- `DATABASE_PATH`
- `MIGRATIONS_DIR`
- `PUBLIC_DIR`
- `JWT_SECRET`
- `SHUTDOWN_TIMEOUT_SECONDS`
- `APP_BUILD_VERSION`
- `APP_BUILD_COMMIT`
- `APP_BUILD_TIME`

Базовый path для SQLite теперь строится по naming convention `{DB_NAME}-{DB_ENV}-{DB_VERSION}.db` внутри `DATA_DIR`. `DATABASE_PATH` остаётся override-механизмом, но обычный запуск должен работать без ручной передачи path в терминале.

Если config невалиден, приложение не стартует.

## 3.3 Logging model

Используется structured JSON logging через `slog`.

Уже логируются:
- request id
- method
- path
- status code
- duration

Это база, поверх которой позже можно добавлять user id, domain fields, provider fields и job fields.

## 3.4 HTTP foundation

Базовый router построен на `chi`.

Подключены foundation middleware:
- request id
- real ip
- recoverer
- structured logging middleware

Пока зарегистрированы только ops routes:
- `GET /health`
- `GET /readiness`
- `GET /build-info`

## 3.5 Instrumentation seam

Введён `Observer` interface и `NoopObserver`.

Сейчас middleware уже вызывает observer на каждом HTTP request, но конкретная metrics system не подключена.

Это и есть metrics-friendly seam для будущего Prometheus.

## 3.6 SQLite lifecycle

Введён отдельный SQLite wrapper.

На старте выполняются базовые PRAGMA:
- `foreign_keys = ON`
- `journal_mode = WAL`
- `synchronous = NORMAL`
- `busy_timeout = 5000`

Также фиксированы connection settings под single-node SQLite runtime.

На clean shutdown выполняются:
- `PRAGMA wal_checkpoint(TRUNCATE)`
- `PRAGMA optimize`

Цель: после штатной остановки WAL/SHM не должны хранить уникально важные данные, а основной `.db` остаётся главным файлом для копирования и бэкапа.

## 3.7 Migration foundation

Введён migration runner foundation:
- создаётся `schema_migrations`
- читаются `.sql` файлы из `MIGRATIONS_DIR`
- миграции применяются по имени файла в лексикографическом порядке
- каждая миграция записывается в `schema_migrations`
- повторно применённые миграции пропускаются

На текущем шаге migration runner используется как infrastructure foundation. Production schema rewrite этим stepом не запускается.

## 3.8 Graceful shutdown

Добавлен controlled shutdown flow:
- перехват `SIGINT` и `SIGTERM`
- timeout-controlled `http.Server.Shutdown`
- закрытие SQLite после остановки HTTP server

---

## 4. Test coverage introduced in this step

## 4.1 Config tests

Покрыто:
- defaults
- invalid env values
- validation of log level and numeric settings
- derived database path and DB naming convention

## 4.2 SQLite tests

Покрыто:
- DB open and ping
- WAL cleanup on clean shutdown
- migration table creation
- execution of SQL migration files

## 4.3 HTTP tests

Покрыто:
- `/health`
- `/readiness`
- `/build-info`
- app serve/shutdown integration path

---

## 5. Non-goals intentionally left for later

В этом stepе намеренно не делались:
- static file serving parity with old backend
- auth middleware
- domain route groups
- job scheduler runtime
- user-aware request logging
- DB query instrumentation beyond future-ready seam
- production deploy workflow adaptation

---

## 6. Exit condition reached

Step 02 можно считать закрытым, потому что:
- Go module и dependency base созданы
- приложение стартует как отдельный Go server
- config validated on startup
- logger unified
- router and ops endpoints alive
- SQLite lifecycle established
- migration foundation exists
- graceful shutdown works
- base tests run green

---

## 7. What opens next

Этот step открывает следующие шаги без архитектурной переделки foundation:
- Step 03: Auth Core
- Step 04: Settings
- later domain route registration under the same app/runtime
