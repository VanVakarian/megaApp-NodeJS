# Flatline Migration — Implementation Plan (Backend)

Общая архитектура и контракты — [`FLATLINE-ARCHITECTURE.design-doc.md`](/Users/user/code/flatline/FLATLINE-ARCHITECTURE.design-doc.md) (разделы 3.1–3.9, план катовера — раздел 5). Здесь — конкретно по коду `megaapp-back`: что меняется, что удаляется, что остаётся как есть.

Flatline (Этап 1, core) уже развёрнут и работает — см. [`flatline-server-deploy-guide.md`](/Users/user/code/SERVERS/flatline-server-deploy-guide.md). Этот план — Этап 2 со стороны `megaapp-back`: метрики самого приложения уходят в Flatline тем же контрактом, что уже использует `spread-capture-bot-v3`, а локальное хранение/раздача метрик в `megaapp-back` выпиливается.

Дополнение к плану: `megaback` и `megatest` должны писаться в **один и тот же Flatline**, но как **два разных producer-а** по полю `service`. Это убирает смешивание тестовых и продовых точек, не требует второго Flatline/второй БД и позволяет одновременно смотреть оба потока в одном UI.

## Что не входит в этот план

- Архитектура `spread-capture-bot-v3` не меняется — меняется адрес пуша и имя env-ключа producer-а в конфиге (`METRICS_SERVICE_KEY`), без смены протокола/логики.
- Сам Flatline не трогается — у него уже есть всё нужное (`POST /api/metrics/snapshots`, `GET /api/metrics/since`, `POST /api/debug/import-metrics-ndjson`).
- Разовый перенос истории и порядок переключения в проде — раздел 5 архитектурного документа, не повторяется здесь. Этот план описывает код, который должен быть готов и задеплоен **до** шага 3 того раздела.
- Реализация на фронте (`megaapp-front`) — только контракт описан (раздел «Контракт с фронтом» ниже), Angular-детали — отдельная задача на стороне фронта.

## Новое требование после первой реализации

Изначально предполагалось, что у `megaapp-back` один producer key: `megaapp`. После сборки Stage 2 выяснился практический риск: если `megatest` поднять против того же Flatline, он начнёт писать под тем же `service`, что и прод, и тестовые точки смешаются с боевыми.

Минимальное правильное решение:

- **Не** разводить prod/test по разным Flatline.
- **Не** заводить второй consumer-путь.
- Развести их только по уже существующему полю `service`, которое и так является частью ключа хранения в Flatline.

Выбранная схема:

- prod `megaapp-back` сохраняет текущий `service = "megaapp"` — это не режет уже накопленную историю и не требует миграции/переименования старых точек.
- test `megaapp-back` получает отдельный `service = "megaapp-test"`.
- `spread-capture-bot-v3` остаётся своим отдельным producer-ом как и раньше.
- `megaapp-front` показывает и `megaapp`, и `megaapp-test` как два отдельных сервиса, но по одной и той же схеме метрик, лейблов, графиков и severity-логики.

Это самое дешёвое изменение по архитектуре: Flatline уже умеет хранить и отдавать данные по разным `service`, poller уже агрегирует по `service`, остаётся только убрать жёсткий хардкод имени producer-а в `megaapp-back` и зарегистрировать второй ключ на фронте.

## Как сейчас (реальный код)

- `internal/metrics/service.go`: `Service{repo, clock, adminLister, mu, counts}`. `Increment(name)` — инкремент в `map[string]int64` под мьютексом. `Flush(ctx)` — берёт накопленное, для каждого имени метрики вызывает `s.repo.AddToCounter(ctx, MainServiceName, name, bucket, delta)` (upsert в SQLite), возвращает `[]MetricPoint`. `IngestSnapshots` — валидация + `s.repo.ReplaceSnapshots` (overwrite-запись для внешних пушей, сейчас только от бота). `ImportNDJSON` — разовый ручной импорт. `CurrentHealth`/`botHealthSeverity` — хардкод severity по `MainServiceName`/`SpreadCaptureBotServiceName`, остальные сервисы дефолтят в `"ok"`. `IsAdmin`/`AdminUserIDs` — поверх `AdminLister` (= `auth.Service`).
- `internal/metrics/repo.go`: `Repository` поверх `*sql.DB`. `AddToCounter` (upsert с суммированием), `ReplaceSnapshots` (транзакционный overwrite), `ListSince` (курсор), `ListLatestPointsByService` (для health).
- `internal/metrics/http.go`: `Handler.IngestSnapshots` — `POST /api/metrics/snapshots`, принимает batch от бота, после записи сразу `realtime.BroadcastDetail` + пересчёт `CurrentHealth` + `realtime.BroadcastHealth`. `DebugHandler.ImportNDJSON` — `POST /api/debug/import-metrics-ndjson`.
- `internal/metrics/realtime.go`: `Realtime{hub, subscribers}`. `BroadcastHealth(adminUserIDs, status)` — шлёт `{type:"METRICS_HEALTH", payload: HealthStatus{Services []ServiceHealth{Service,Severity}}}` всем известным админам без подписки. `BroadcastDetail(update)` — `{type:"METRICS_UPDATE", payload: DetailUpdate{Points}}` только подписчикам.
- `internal/metrics/ws_handlers.go`: `METRICS_SUBSCRIBE` (проверка `service.IsAdmin`, регистрация в `realtime.subscribers`, catch-up через `service.ListSince(ctx, cursor)`), `METRICS_UNSUBSCRIBE`.
- `migrations/000003_metrics.sql`: таблица `metrics(service, metricName, minuteBucket, value)`, `UNIQUE(service, metricName, minuteBucket)`. **Уже в проде с реальными данными** (бот пишет туда сейчас) — это значимо для шага удаления ниже.
- `internal/httpx/modules.go`, `buildMetricsModule`: собирает `repo → service → realtime → handler`, регистрирует `METRICS_SUBSCRIBE`/`METRICS_UNSUBSCRIBE`, регистрирует cron-джобу `"metrics"` на `"* * * * *"` — она зовёт `service.Flush(ctx)`, рассылает `BroadcastDetail`, затем безусловно пересчитывает `CurrentHealth` и шлёт `BroadcastHealth`.
- `internal/httpx/app.go`: регистрирует `metrics.RegisterRoutes`/`metrics.RegisterDebugRoutes`.
- `internal/jobs/runtime.go`: `Runtime` на `robfig/cron`, парсер сконфигурирован **только на минутную гранулярность** (`cron.Minute|cron.Hour|cron.Dom|cron.Month|cron.Dow`) — секундные интервалы через него не настроить.

## Как должно быть

### Коллектор не меняется, меняется судьба его данных

`Service.Increment`/`Flush` — это уже ровно тот in-memory minute-accumulator, который нужен (тот же паттерн, что в `spread-capture-bot-v3`). Его **не переписываем**. Меняется только то, что происходит с результатом `Flush()`: вместо прямой записи в локальный `Repository` — он уходит в новый Exporter, который пушит в Flatline.

### Producer key для `megaback` и `megatest`

Текущий хардкод `MainServiceName = "megaapp"` должен стать runtime-конфигом producer-а, а не compile-time константой.

Минимальная схема:

- новый config key в `megaapp-back`: `METRICS_SERVICE_KEY`
- default: `megaapp`
- prod `.env.prod`: `METRICS_SERVICE_KEY=megaapp`
- test `.env.test`: `METRICS_SERVICE_KEY=megaapp-test`

Почему именно так:

- prod остаётся на `megaapp` — история и текущие фронтовые definitions не ломаются
- test уходит в отдельный поток без второго Flatline
- consumer-логика не ветвится: poller и фронт просто видят ещё один `service`
- это согласовано с уже существующим подходом в `spread-capture-bot-v3`, где producer key тоже конфигурируется через `.env`

Ненужные альтернативы:

- переименовать прод в `megaapp-prod` тоже можно, но это уже режет исторический поток на два имени и усложняет cutover без выгоды
- второй Flatline для test решает проблему, но это лишняя инфраструктура и лишний state
- режим "test только читает, но не пишет" сложнее и менее честен, чем просто признать `megatest` отдельным producer-ом

### Новый Exporter — outbox + ack + retry, копия архитектуры `spread-capture-bot-v3/metrics`

Архитектура скопирована «как уже проверено в проде», не общий код между репозиториями (отдельные Go-модули) — см. design doc, раздел 3.3a.

Новые файлы в `internal/metrics`:

- `outbox.go` — чанкованный append-only NDJSON (лимит ~1MB на файл, ротация в пронумерованные файлы), порт `spread-capture-bot-v3/metrics/exporter.go` (`metricsOutbox`, `appendSnapshot`, `prepareMetricsOutbox`, `numberedOutboxPath`/`parseNumberedOutboxPath`).
- `exporter.go` — `Exporter{outbox, pending []MinuteSnapshot, lastAcked int64, client *http.Client, cfg ExporterConfig}`. Метод `FlushAndPush(ctx, bucket, points)`:
  1. собрать `MinuteSnapshot{Service: cfg.MetricsServiceKey, MinuteBucket: bucket, Metrics: map[string]float64}` из `points`;
  2. дописать в outbox (`fsync`);
  3. добавить в `pending`;
  4. одна попытка отправить весь `pending` (oldest-first) в `POST {FlatlineBaseURL}/api/metrics/snapshots`;
  5. при успехе — обновить ack-файл, очистить `pending`;
  6. при неудаче — `pending` остаётся, залогировать `slog.Warn`, следующая попытка — на следующем минутном тике.
  При старте (`NewExporter`) — читает ack-файл + сканирует outbox, поднимает в `pending` всё новее последнего подтверждённого бакета (переживает рестарт самого `megaapp-back`).
- `flatline_client.go` — `FlatlineClient{baseURL, httpClient}`. Методы `PushSnapshots(ctx, []MinuteSnapshot) error` и `Since(ctx, cursor int64) ([]MetricPoint, error)` — тонкие HTTP-обёртки над `POST /api/metrics/snapshots` и `GET /api/metrics/since?cursor=`.

`Service.Flush` теряет DB-запись и не может больше ошибаться по БД-причине — упростить сигнатуру до `func (s *Service) Flush() []MetricPoint` (без `ctx`, без `error`; чистая in-memory операция).

### Новый Poller — отдельный цикл, не минутный cron (design doc 3.3b/3.3c)

`poller.go` — `Poller{client *FlatlineClient, realtime *Realtime, interval time.Duration, cursor int64, latest map[string]map[string]float64}`.

- Не регистрируется в `jobs.Runtime` — парсер `robfig/cron` не умеет секунды (см. «Как сейчас»). Это обычный `time.Ticker` в своей goroutine, с `context.Context` на остановку, добавляется в `App.Backgrounds` для graceful shutdown.
- Интервал — 10 секунд (зафиксировано в разговоре, design doc 3.3b), конфигурируется (`FLATLINE_POLL_INTERVAL_SECONDS`, дефолт `10`), но менять без причины не нужно.
- При старте `cursor` инициализируется не нулём, а `floor-to-minute(now) - 2 минуты` — иначе после каждого рестарта `megaapp-back` первый опрос потащит **всю** историю с Flatline и разошлёт её текущим подписчикам. Полный catch-up на полную историю — отдельный путь, уже описанный в `ws_handlers.go` (`METRICS_SUBSCRIBE` с явным курсором клиента), Poller-у это не нужно.
- На каждый тик: `points, err := client.Since(ctx, cursor)`. Если `len(points) > 0`:
  - подвинуть `cursor` на максимальный увиденный `Bucket`;
  - `realtime.BroadcastDetail(DetailUpdate{Points: points})` — подписчикам страницы `/metrics`, без изменений в этой части;
  - обновить `latest[service][metricName] = value` (просто оверврайт, raw-точки уже идут с overwrite-семантикой) и `lastBucket[service]`;
  - `realtime.BroadcastLatest(adminUserIDs, latest)` — всем известным админам, лёгкий канал (см. ниже).
- Никакого нового запроса к Flatline для «последних значений» не нужно — `latest` строится инкрементально из тех же ответов `Since`, которые Poller и так получает каждые 10 секунд.

### Лёгкий канал — сырые значения вместо severity (design doc 3.9)

`realtime.go`: `HealthStatus`/`ServiceHealth`/`BroadcastHealth` удаляются. Вместо них:

```go
type ServiceLatest struct {
    Service    string             `json:"service"`
    LastBucket int64              `json:"lastBucket"`
    Metrics    map[string]float64 `json:"metrics"`
}

type LatestSnapshot struct {
    Services []ServiceLatest `json:"services"`
}
```

`BroadcastLatest(adminUserIDs []int64, snapshot LatestSnapshot)` — `{type:"METRICS_LATEST", payload: snapshot}`, тот же паттерн рассылки, что был у `BroadcastHealth` (`hub.BroadcastToUser` по каждому админу). `megaapp-back` больше не решает, что считать `ok`/`warn`/`error` — это переезжает на фронт (см. «Контракт с фронтом»).

### Что удаляется

- `internal/metrics/repo.go` — файл целиком (нет больше локальной таблицы).
- `internal/metrics/http.go` — файл целиком (`Handler.IngestSnapshots`, `DebugHandler.ImportNDJSON`, оба `RegisterRoutes`/`RegisterDebugRoutes`). Приём пушей и ручной NDJSON-импорт — теперь только в Flatline.
- `Service.CurrentHealth`, `botHealthSeverity`, `SpreadCaptureBotServiceName` — хардкод severity не переезжает никуда, удаляется целиком (см. design doc 3.9).
- `Service.IngestSnapshots`, `Service.ImportNDJSON`, `SnapshotInput`, `IngestRequest`, `ErrInvalidIngestPayload` — `megaapp-back` больше не принимает входящие пуши.
- `MetricPoint`/`DetailUpdate` остаются (те же поля, `realtime.go`/`ws_handlers.go` их продолжают использовать).
- `internal/httpx/app.go`: вызовы `metrics.RegisterRoutes`/`metrics.RegisterDebugRoutes` убираются.

### Что остаётся без изменений

- `Service.Increment` и все его вызовы (`internal/food/*`, `internal/httpx/app.go` — джоба `coefficients`, `internal/httpx/modules.go` — джоба `backup`) — ни одна точка вызова не трогается.
- `Service.IsAdmin`/`AdminUserIDs` поверх `AdminLister` — нужны для `METRICS_SUBSCRIBE`/рассылки лёгкого канала, остаются как есть.
- `internal/metrics/ws_handlers.go` — структура та же, меняется одна строка: catch-up внутри `METRICS_SUBSCRIBE` зовёт `flatlineClient.Since(ctx, cursor)` вместо `service.ListSince(ctx, cursor)`.
- `internal/ws` целиком (hub, heartbeat, авторизация подключения) — не трогается.
- `migrations/000003_metrics.sql` как файл — не редактируется и не удаляется (история миграций неприкасаема, она уже в проде).

Но имя сервиса в самих точках больше не должно быть compile-time константой. Источник значения — config (`METRICS_SERVICE_KEY`), одинаково используемый и `Service.Flush()`, и `Exporter`.

### Удаление самой таблицы — новая миграция, не правка существующей

`000003_metrics.sql` уже применена в проде с реальными данными бота — значит действует обычное правило проекта «новая миграция на изменение схемы», а не исключение для неопубликованных фич текущей ветки (см. design doc 3.7, `~/.claude/rules/database.md`).

Новый файл `migrations/000004_remove_metrics_table.sql`:

```sql
DROP TABLE IF EXISTS metrics;
```

Накатывается **только** на шаге 8 раздела 5 архитектурного документа — после того, как данные перенесены в Flatline и сверка пройдена. До этого момента таблица просто лежит в БД мёртвым грузом (код её больше не трогает с момента деплоя из шага 3 этого плана) — спешить со снэпшотом/переносом не нужно, гонки по времени нет.

## Конфиг (`internal/config/config.go`)

Новые поля:

- `FlatlineBaseURL string` — обязательный (`Validate()` требует непустой, как только этот план задеплоен — без Flatline `megaapp-back` не сможет ни отправить свои метрики, ни получить чужие для дашборда).
- `FlatlinePushTimeout time.Duration` — таймаут HTTP-пуша, дефолт 5s.
- `FlatlinePollInterval time.Duration` — интервал Poller-а, дефолт 10s (`FLATLINE_POLL_INTERVAL_SECONDS`).
- `FlatlinePollInitialLookback time.Duration` — окно при старте Poller-а, дефолт 2 минуты.
- `MetricsServiceKey string` — producer key для собственных точек `megaapp-back`; default `megaapp`, test runtime ставит `megaapp-test`.
- Пути outbox/ack-файлов — не отдельные переменные окружения, выводятся из уже существующего `DataDir` (например `<DataDir>/metrics-outbox.ndjson`, `<DataDir>/metrics-outbox.ack.json`), по аналогии с тем, как `DatabasePath` сейчас выводится из `DataDir`.

## `internal/httpx/modules.go` — пересборка `buildMetricsModule`

- `repo.NewRepository(db)` — убрать, БД больше не нужна этому модулю.
- Собрать `flatlineClient := metrics.NewFlatlineClient(cfg.FlatlineBaseURL, cfg.FlatlinePushTimeout)`.
- Собрать `service := metrics.NewService(cfg.MetricsServiceKey, clk, authService)`.
- Собрать `exporter := metrics.NewExporter(...)` с `Service: cfg.MetricsServiceKey`, `poller := metrics.NewPoller(flatlineClient, realtime, cfg.FlatlinePollInterval, cfg.FlatlinePollInitialLookback, clk)`.
- Cron-джоба `"metrics"` (`"* * * * *"`, без изменений по расписанию) теперь: `points := service.Flush(); exporter.FlushAndPush(ctx, bucket, points)` — без отдельного `BroadcastDetail`/`BroadcastHealth` для своих же точек, это теперь придёт обратно через Poller на следующем тике, как и для любого другого источника (никакой особой логики для «своих» метрик не остаётся — `megaapp` для системы метрик теперь точно такой же producer, как бот).
- `poller.Start(ctx)` — отдельная goroutine, добавляется в `App.Backgrounds` (рядом с `jobRuntime`) для `Close()` при шатдауне.
- `METRICS_SUBSCRIBE`/`METRICS_UNSUBSCRIBE` — регистрация остаётся, хендлер берёт `flatlineClient` вместо `service`/`repo` для catch-up.

## Тесты

- `internal/metrics/service_test.go` — убрать всё про `repo`/`CurrentHealth`/`IngestSnapshots`/`ImportNDJSON`, оставить/упростить тесты на `Increment`/`Flush` (без `ctx`/`error` в сигнатуре).
- `internal/metrics/repo.go` и его тесты — удалить целиком.
- `internal/metrics/http.go` и `http_test.go` — удалить целиком.
- Новые тесты:
  - `outbox_test.go`/`exporter_test.go` — по образцу `spread-capture-bot-v3/metrics/exporter_test.go` и `collector_test.go` (ротация чанков, restart-replay из ack+outbox, one-flush-per-minute retry).
  - `poller_test.go` — продвижение курсора, инициализация с lookback-окном, broadcast только при непустом `points`, корректная агрегация `latest` по нескольким сервисам.
  - `flatline_client_test.go` — `httptest.Server`, проверка форм запросов/обработки ошибок.
- `internal/metrics/realtime_test.go` — переписать тест на `BroadcastHealth` в тест на `BroadcastLatest`/`LatestSnapshot`.
- `internal/metrics/ws_handlers.go` — тест catch-up через fake `FlatlineClient` вместо fake `Repository`.

## Контракт с фронтом (`megaapp-front`)

Меняется только формат WS-сообщения лёгкого канала: `METRICS_HEALTH` (`{services:[{service,severity}]}`) → `METRICS_LATEST` (`{services:[{service,lastBucket,metrics}]}`). Detail-канал (`METRICS_UPDATE`) не меняется по форме.

Severity (`ok`/`warn`/`error`) теперь считает фронт из `metrics`/`lastBucket`, не бэк — см. design doc 3.9 (дефолтное простое правило по свежести сейчас, форма настройки правил — отдельная фича, не в этом плане). Реализация на стороне Angular — отдельная задача `megaapp-front`, не описывается здесь.

Дополнение для разделения prod/test producer-ов:

- `megaapp-front` должен знать **два** service key для одного семейства метрик: `megaapp` и `megaapp-test`.
- Их definitions/groups/colors/descriptions должны быть одинаковыми по метрикам, разными только по human label (`MegaApp` / `MegaApp Test`).
- Никакой отдельной consumer-логики для test не нужно: тот же dashboard, те же графики, те же карточки, тот же severity-код.
- Если это не сделать, второй `service` будет виден только как сырой текстовый ключ без нормальных групп/лейблов, а dashboard для него останется пустым.

## Связь с планом катовера

Код этого плана должен быть полностью готов, протестирован и задеплоен **до** шага 3 раздела 5 `FLATLINE-ARCHITECTURE.design-doc.md` («Обновить и перезапустить `megaapp-back`»). Шаги 4–8 того же раздела (снэпшот, выгрузка в NDJSON, импорт в Flatline, сверка, миграция `000004`) выполняются после деплоя этого плана и подтверждённой стабильности.

Отдельно для тестового smoke-run:

- `megatest` можно безопасно направлять в тот же Flatline **только после** разведения `service` на `megaapp` и `megaapp-test`.
- После этого один Flatline законно хранит и prod, и test одновременно.
- Это не блокирует будущий prod cutover: test поток просто остаётся отдельным `service`, а не загрязняет боевой.

## Реализовано

Отклонения от первоначального плана, найденные в процессе реализации:

- **Replay outbox-файла при старте не реализован** — `NewExporter` восстанавливает только `lastAcked` из ack-файла, не поднимает заново в `pending` строки NDJSON новее последнего подтверждённого бакета. Это не недосмотр — ровно та же экономия, что и в реальном коде `spread-capture-bot-v3/metrics/exporter.go` (`loadPendingSnapshots` там тоже только читает ack, `ndjsonPath` явно помечен неиспользуемым). Данные всё равно не теряются — они лежат в outbox-файле, просто не переотправляются автоматически после рестарта `megaapp-back`, если что-то осталось неподтверждённым на момент краша.
- **`MetricPoint` переехал в `service.go`** (был в `repo.go`, который теперь удалён) — без изменений по полям/тегам.
- **NDJSON-строки outbox несут `service`** (`outboxLine{Service, MinuteBucket, Metrics}`), хотя в памяти (`MinuteSnapshot`) поля `Service` нет — оно не нужно внутри одного пуша (передаётся один раз на уровне запроса), но нужно в самом файле, чтобы его можно было при необходимости докинуть в Flatline тем же `/api/debug/import-metrics-ndjson`.
- **После первой реализации обнаружен новый scope gap:** `megaback` и `megatest` всё ещё разделены только портами/директориями, но не producer key в метриках. Этот план теперь расширен требованием ввести отдельный `service` для test-потока (`megaapp-test`), не меняя Flatline topology.

## Checklist

### Конфиг
- ✅ `FlatlineBaseURL`/`FlatlinePushTimeout`/`FlatlinePollInterval`/`FlatlinePollInitialLookback` в `internal/config/config.go`, `Validate()` требует `FlatlineBaseURL` непустым. Добавлены в `.env.test`/`.env.prod`/`.env.test.example`/`.env.prod.example`.
- ✅ `MetricsServiceKey` / `METRICS_SERVICE_KEY` в `internal/config/config.go`, `.env.test`, `.env.prod`, `.env.test.example`, `.env.prod.example`.

### Exporter (outbox + ack + retry)
- ✅ `internal/metrics/outbox.go` — чанкованный NDJSON, порт архитектуры из `spread-capture-bot-v3/metrics/exporter.go`.
- ✅ `internal/metrics/flatline_client.go` — `PushSnapshots`, `Since`.
- ✅ `internal/metrics/exporter.go` — `FlushAndPush`, ack-файл (без replay, см. «Реализовано» выше).
- ✅ `Service.Flush()` — убрана `ctx`/`error`, убрана запись в `repo`.
- ✅ `Service.Flush()` и `Exporter` берут producer key из runtime config, а не из compile-time `MainServiceName`.

### Poller
- ✅ `internal/metrics/poller.go` — `time.Ticker` на 10s (не `jobs.Runtime`), курсор с lookback-окном при старте, агрегация `latest` по сервисам.
- ✅ `Realtime.BroadcastLatest`/`LatestSnapshot`/`ServiceLatest` вместо `BroadcastHealth`/`HealthStatus`/`ServiceHealth`.
- ✅ `ws_handlers.go`: catch-up через `flatlineClient.Since`.

### Удаление
- ✅ Удалены `internal/metrics/repo.go`, `internal/metrics/http.go` (и `http_test.go`) целиком.
- ✅ Удалены `Service.CurrentHealth`/`botHealthSeverity`/`SpreadCaptureBotServiceName`/`IngestSnapshots`/`ImportNDJSON`/`SnapshotInput`/`IngestRequest`/`ErrInvalidIngestPayload`.
- ✅ Убраны `metrics.RegisterRoutes`/`metrics.RegisterDebugRoutes` из `internal/httpx/app.go`.
- ⭕ Новая миграция `migrations/000004_remove_metrics_table.sql` (`DROP TABLE IF EXISTS metrics;`) — **сознательно не создаётся в рамках этого прохода**, накатывается только на шаге 8 раздела 5 архитектурного документа, после переноса данных и сверки.

### Сборка модуля и тесты
- ✅ `buildMetricsModule` в `internal/httpx/modules.go` пересобран под `flatlineClient`/`exporter`/`poller`, без `repo`/`db`.
- ✅ `poller` добавлен в `App.Backgrounds` и во все cleanup-пути `newApp` при ошибке последующих модулей.
- ✅ Новые тесты: `outbox_test.go`, `exporter_test.go`, `flatline_client_test.go`, `poller_test.go`.
- ✅ `service_test.go`/`realtime_test.go` переписаны под новые сигнатуры; `http_test.go` удалён.
- ✅ `go build ./...`, `go vet ./...`, `go test ./... -count=1` — чисто по всем пакетам.

### Фронт (отдельная задача, координация по контракту)
- ✅ `megaapp-front`: переход с `METRICS_HEALTH` на `METRICS_LATEST`, расчёт severity на клиенте.
- ✅ `megaapp-front`: зарегистрирован `megaapp-test` как второй service key с теми же metric groups/labels/descriptions, что и у `megaapp`, но с отдельным display label.
- ✅ Добавлены проверки на producer split: `megaapp` по default, `megaapp-test` из `.env.test`, сохранение service key в `MetricPoint`; frontend type/build checks прошли для второго service key.

### Деплой и живая проверка
- ✅ `megaapp-back` и `megaapp-front` задеплоены на прод и test, живая проверка прошла на обоих.
- ✅ Шаг 4: снэпшот БД megaapp снят через `POST /api/debug/run-backup-job`.
- ✅ Шаг 5: снэпшот выгружен в NDJSON (`megaapp-prod-2026-06-25T15-54-15Z.metrics-export.ndjson`, разбит на 4 части по ~900КБ под лимит debug-ручки), сверка построчно/поэлементно совпала с исходной таблицей (126419 точек).
- ✅ Шаг 6: все 4 части импортированы в Flatline через `POST /api/debug/import-metrics-ndjson`.
- ✅ Шаг 7: сверка importedPoints по частям (32349+32511+32223+29336=126419) совпала с числом строк исходной таблицы.
- ✅ Шаг 8: миграция `migrations/000004_remove_metrics_table.sql` создана (`DROP TABLE IF EXISTS metrics;`). Накатится автоматически при следующем перезапуске `megaback`/`megatest`.

### Осталось
- ⭕ Задеплоить файл миграции на сервер и перезапустить `megaback`/`megatest`, чтобы она применилась.
