# Metrics — Implementation Plan (Backend)

Backend-часть единого плана [`METRICS._implementation-plan.md`](../../METRICS._implementation-plan.md) в корне проекта — туда читать общую архитектуру и контракты. Здесь — конкретно по коду `megaapp-back`.

> Раздел «План расширения: `spread-capture-bot/v3`» (Этапы 4A/4B) ниже — историческое описание уже сделанного (приём пушей напрямую в `megaapp`). Эта схема заменяется отдельным сервисом Flatline — см. [`03-flatline-migration.implementation-plan.md`](./03-flatline-migration.implementation-plan.md).

## Как сейчас

- Модуля метрик нет вообще.
- `internal/ws/hub.go`: `Hub.clientsByUserID map[int64]map[*Client]struct{}`, `BroadcastToUser(userID, payload, excludeClientID)`, `BroadcastToAll(...)`, `RegisterHandler(messageType, handler)`. Никакой фильтрации по ролям/топикам внутри `Hub` нет — broadcast either "этому юзеру" либо "вообще всем подключённым".
- Уже есть рабочий пример push-паттерна: `internal/food/realtime.go` (`WSRealtimePublisher`) — оборачивает `*ws.Hub`, шлёт `{"type": ..., "payload": ...}` через `BroadcastToUser`/`BroadcastToAll`. Метрики должны повторить этот же паттерн, не трогая сам `Hub`.
- `internal/auth`: `TokenClaims{UserID, Username}`, `auth.User{ID, Username, HashedPassword}`. Таблица `users` (`migrations/000001_auth_and_settings.sql`) уже содержит колонку `isAdmin BOOLEAN`, но она **нигде не используется в Go-коде** — ни в `Repository.GetUserByUsername` (не селектится), ни в `User`, ни в `TokenClaims`, ни в `Service.Verify`. Концепция админа существует только в схеме БД.
- Миграции: `internal/platform/sqlite/migrations.go` — пронумерованные `.sql`-файлы + таблица `schema_migrations`, которая помнит применённые версии и пропускает их повторное исполнение. Стандартная Go-схема (как `golang-migrate`/`goose`) — миграции неизменяемы после **релиза**. Пока версия не зарелизена — миграции этой же фичи (`000003_metrics.sql`) свободно редактируются на месте, без новой миграции под каждую правку (см. политику в корневом плане, секция "Политика на время активной разработки"; общее правило с этим исключением — `~/.claude/rules/database.md`).
- Модули собираются в `internal/httpx/modules.go` (repo → service → handler на каждый домен), маршруты регистрируются в `internal/httpx/app.go` через `<module>.RegisterRoutes(router, ...)`.

## Как должно быть

- Новый изолированный пакет `internal/metrics`, без обратных зависимостей на другие домены.
- Модель: Counter/Gauge — статическое свойство имени метрики на уровне кода. In-memory accumulator под `sync.Mutex`, фоновый тикер раз в минуту коммитит в SQLite и сбрасывает accumulator.
- Единый write-path: всегда upsert по `(metric_name, minute_bucket)`, bucket = floor-to-minute начала интервала. Внешние пуши (Этап 4A/4B) этот accumulator не используют — сразу upsert при получении.
- Таблица метрик — миграция `000003_metrics.sql`, создана один раз. Дальше, пока версия не зарелизена, любые изменения схемы метрик — правка этой же миграции на месте, а не новый файл (см. политику в корневом плане).
- Публичный интерфейс пакета — пара функций уровня пакета (инкремент/установка по имени метрики), вызываемых прямым импортом из `food`/`money`-хендлеров в местах нужных действий.
- Решён открытый вопрос **админ-доступа**, без единой правки в `internal/ws`:
  - Прокинуть `isAdmin` через всю цепочку: `Repository.GetUserByUsername` селектит колонку → `auth.User.IsAdmin` → `TokenClaims.IsAdmin` → `Service.Verify` отдаёт его наружу.
  - `internal/metrics` при старте подгружает (и кэширует в памяти) список `userID` админов через `auth.Repository`, без изменений в `ws.Hub`/`ws.Client`.
  - Это закрывает доступ к данным метрик. Отдельно (см. ниже) нужно отдать `isAdmin` и наружу, в HTTP JSON-ответ — это для UI-флага на фронте (показать/скрыть кнопку), не для защиты данных, защита данных уже обеспечена пунктом выше независимо от этого.
- **Отдать `isAdmin` фронту как обычное поле ответа**, чтобы SPA знал, кто админ, заранее, до открытия страницы метрик:
  - `Handler.Verify` (`internal/auth/http.go:99`) — добавить `"isAdmin": claims.IsAdmin` в существующий JSON-ответ (`userId`/`username` там уже есть, добавляется одно поле).
  - `Handler.Login`/`Handler.Refresh` — `Service.Login`/`Service.Refresh` уже возвращают `TokenPair` через `legacy.WriteJSON`; добавить `IsAdmin bool` в JSON тела ответа этих ручек тоже (не только внутрь самого JWT) — фронт читает поле из тела HTTP-ответа, а не декодирует токен на своей стороне.
- **Два канала доставки, не один.** На каждый минутный flush:
  1. **Health** — лёгкий payload (агрегированная серьёзность по статичным порогам), шлётся `hub.BroadcastToUser(adminID, ...)` по всем известным админам всегда, без подписки. По образцу `food.WSRealtimePublisher`, `Hub.BroadcastToAll` не используется.
  2. **Detail** — полные данные метрик, шлются только тем admin-соединениям, которые явно подписались. Подписка — свой маленький реестр внутри `internal/metrics` (`map[*ws.Client]struct{}` + мьютекс), не трогает `Hub`/`Client`. Заполняется/чистится хендлерами `METRICS_SUBSCRIBE`/`METRICS_UNSUBSCRIBE`, зарегистрированными через `hub.RegisterHandler` (по образцу `hub.RegisterHandler("SEARCH_QUERY", ...)` в food). Рассылка по реестру — `client.SendJSON(...)` (уже публичный метод `ws.Client`); при ошибке записи — просто удалить клиента из своего реестра (тот же self-healing паттерн, что уже есть в `Hub.BroadcastToUser`/`BroadcastToAll`).
  - `METRICS_SUBSCRIBE` принимается только если userID отправителя в кэше админов — иначе no-op. Никакого отдельного heartbeat "подтверди подписку" не нужно: `Hub` уже убирает мёртвые соединения через ping/pong (30с) и через `RemoveClient` при обрыве в `readLoop()` — реестр подписчиков чистится сам собой через тот же self-healing на ошибке записи.
- HTTP-ручка внешнего приёма (Этап 4A/4B) — отдельный файл в том же пакете `internal/metrics`, отдельная авторизация по ключу источника (не общий JWT). Пуши уходят сразу в detail-канал текущим подписчикам.

## Метрики первой итерации (зафиксировано)

- `food_diary_entry_created` — Counter, создание записи дневника.
- `food_diary_entry_updated` — Counter, изменение веса записи (любое +/- или новое значение).
- `food_diary_entry_deleted` — Counter, удаление одной записи.
- `food_diary_day_deleted` — Counter, удаление всех записей за день (отдельно от удаления одной записи).
- `food_diary_day_restored` — Counter, восстановление записей за день (`RestoreDiaryEntriesForDay`) — один инкремент за вызов, не за каждую восстановленную запись. Изначально не заводилась ("технический откат, не пользовательское действие") — пересмотрено: это всё равно реальный запрос к серверу, выполняющий работу, метрика нагрузки должна его учитывать.
- `food_body_weight_updated` — Counter, изменение веса тела (первый ввод и последующие — не различаются).
- `food_catalogue_entry_created` — Counter, создание продукта в каталоге (`SaveProduct`, `request.ID == nil`).
- `food_catalogue_entry_updated` — Counter, редактирование продукта в каталоге (`SaveProduct`, `request.ID != nil`).
- `food_catalogue_entry_deleted` — Counter, удаление продукта из каталога.
- `food_coefficients_job_ran` — Counter, один инкремент за прогон cron-джобы `coefficients` (не за каждого пользователя внутри батча).
- `backup_job_ran` — Counter, один инкремент за успешный прогон cron-джобы `backup`.

Генерация превью/анализ изображения/голоса (`GenerateProductPreview`, `AnalyzeImage`, `AnalyzeVoice`) — не персистят ничего сами, отдельной метрики не получают, считаются только через итоговый `SaveProduct`.

**Принцип для всех метрик-счётчиков (зафиксировано явно):** это hit-counter "действие совершилось", не success/fail телеметрия. Инкремент стоит после успешного завершения операции — на ошибке обработчик делает `return` раньше, до строки инкремента, поэтому ошибки естественным образом не попадают в счётчик. Для джобов та же логика: считаем "джоба сработала" по разу за вызов, а не успех/неуспех каждого внутреннего шага — если нужно разобраться, что именно упало внутри джобы, для этого логи (`CoefficientsJobResult.FailedCount` и т.п.), не метрики.

## Открытые вопросы (не закрыты этим планом)

- ⭕ Способ авторизации внешних источников для Этапа 4B (отдельный API-ключ на источник) — решается при подходе к Этапу 4B.

## Реализовано (Этап 1 + Этап 2)

Отклонения от первоначального плана, найденные в процессе реализации:

- **Список админов не кэшируется при старте** — запрашивается заново при каждом flush и при каждом `METRICS_SUBSCRIBE` (`SELECT id FROM users WHERE isAdmin = 1`, единицы строк). Проще, чем кэш + инвалидация, и новый админ подхватывается без перезапуска приложения.
- **Health-severity — честная заглушка.** Все 5 метрик первой итерации — счётчики обычных действий, а не сигналы отказа, поэтому считать из них "ok/warn/error" по порогам пока не из чего. `BroadcastHealth` шлёт фиксированный `{"severity": "ok"}" на каждый flush — транспорт полностью готов, реальную формулу считать стоит только когда появится метрика, реально отражающая отказ/деградацию.
- **Один маленький geттер добавлен в `internal/ws`**: `func (c *Client) UserID() int64`. Без него `METRICS_SUBSCRIBE`-хендлер не может проверить, админ ли отправитель. Это не нарушает принцип "не трогаем `Hub`/`Client`" по сути — геттер не меняет поведение broadcast/Hub, просто открывает уже существующее поле на чтение. Никакая admin-логика в `ws` не появилась.
- **`isAdmin` в `CreateUser`/`GetUserByUsername`**: новые пользователи получают `isAdmin = 0` явно; существующие строки (созданные до этой правки) могли иметь `NULL` — обработано через `sql.NullBool`, трактуется как `false`. **Чтобы реально включить админский доступ себе, нужно руками выполнить `UPDATE users SET isAdmin = 1 WHERE username = '<ваш юзернейм>';` на реальной БД** — UI/API для назначения админа не строился, это не было частью задачи.
- Cron-расписание flush — `"* * * * *"` (точная минута по wall-clock), а не `@every 1m` — `@every` считает интервал от момента регистрации джобы, а не от начала календарной минуты, и сломал бы контракт floor-to-minute. Не вынесено в конфиг — это архитектурная константа, привязанная к контракту минутного бакета, не настройка.

### Найденный и исправленный баг: `isAdmin` "застревал" в старом токене

После того как `vld1211` был помечен админом в БД, фронт всё равно редиректил с `/metrics` на `/food` — `adminOnlyGuard` видел `isAdmin$$() === false`.

Причина: `TokenClaims.IsAdmin` зашивается в JWT в момент его выпуска (`Login`) и живёт там до следующего логина. `Service.Verify` (хот-путь, используется `Middleware` на **каждом** запросе) — чистый decode JWT без похода в БД, это намеренно (statelessness/производительность). А `Service.Refresh` тоже просто переподписывал старые claims из refresh-токена, не перепроверяя БД. Итог: если `isAdmin` в БД поменяли вручную (как в этом случае) уже после выдачи токена — пользователь видит обновление только после повторного логина, токен сам себя не "освежает".

Исправлено точечно, не трогая горячий путь (`Middleware`/`Verify` остались чистым JWT-decode без обращения к БД):
- `Repository.GetUserByID` — новый метод.
- `Service.Refresh` теперь подтягивает текущего пользователя из БД (`GetUserByID`) и берёт `IsAdmin` оттуда, а не из старых claims — следующий авто-рефреш токена (по 401 или по истечению access-токена) сам подхватит изменение в БД.
- `Handler.Verify` (HTTP-ручка `/api/auth/verify`, вызывается один раз при старте SPA, не хот-путь) — также подтягивает свежего пользователя через `Service.GetUserByID` и возвращает актуальный `isAdmin` в JSON, а не декодированное значение из токена.
- Итог: смена `isAdmin` в БД руками подхватывается без полного логаута — либо сразу при следующей загрузке SPA (через `/verify`), либо при следующем авто-рефреше токена. Полный логаут/логин для этого больше не обязателен.

### Этап 3 (UI на фронте) — изменение формата health-payload

Фронт попросил детализацию здоровья по сервисам (карточки "Services Health" на странице метрик, отдельно от общего индикатора в сайдбаре). Под это поменян формат:
- `internal/metrics/realtime.go`: `HealthStatus{Severity string}` → `HealthStatus{Services []ServiceHealth}`, `ServiceHealth{Service, Severity}`.
- Новая константа `metrics.MainServiceName = "megaapp"` — имя текущего (единственного на сейчас) сервиса, статически в коде, без таблицы регистрации сервисов (не нужна на одном сервисе).
- `buildMetricsModule` (`internal/httpx/modules.go`) теперь шлёт `HealthStatus{Services: []ServiceHealth{{Service: MainServiceName, Severity: "ok"}}}` — массив из одного элемента уже сейчас, без breaking change протокола, когда сервисов станет больше.

### Этап 1: Сборщик + хранение — ✅ готово
- ✅ `internal/metrics`: accumulator (mutex + map), `Service.Flush` (вызывается cron-джобой `"metrics"`), `Repository.AddToCounter` (upsert), `Repository.ListSince`.
- ✅ Миграция `migrations/000003_metrics.sql`.
- ✅ Модуль в `internal/httpx/modules.go` (`buildMetricsModule`) и `app.go`.
- ✅ Список метрик зафиксирован (см. выше) и вызовы расставлены в `internal/food/write_http.go`, `internal/food/catalogue_http.go`, плюс джобы `coefficients` (`internal/httpx/app.go`) и `backup` (`internal/httpx/modules.go`).

### Этап 2: Админ-доступ + доставка на фронт — ✅ готово
- ✅ `isAdmin` прокинут по цепочке `Repository → User → TokenClaims → Service.Verify`, плюс `Service.ListAdminUserIDs`.
- ✅ `isAdmin` в JSON-ответах `/api/auth/verify`, `/api/auth/login`, `/api/auth/refresh` (через `TokenPair.IsAdmin`).
- ✅ `internal/metrics.AdminLister` — запрашивается напрямую у `auth.Service` (без кэша, см. отклонения выше).
- ✅ `Realtime.BroadcastHealth` — health-payload всем известным админам на каждый flush.
- ✅ Реестр подписчиков detail-канала (`Realtime.subscribers`) внутри `internal/metrics`.
- ✅ `METRICS_SUBSCRIBE`/`METRICS_UNSUBSCRIBE` через `hub.RegisterHandler`, с проверкой по `service.IsAdmin`.
- ✅ На flush — `Realtime.BroadcastDetail` по реестру подписчиков, self-healing на ошибке записи.
- ✅ Курсор: `METRICS_SUBSCRIBE` несёт `cursor`, ответ — `service.ListSince(ctx, cursor)`; `cursor=0` = вся история.
- ✅ Тесты: `internal/metrics/service_test.go` (accumulator/flush/bucket/admin-check), `internal/metrics/realtime_test.go` (subscribe/unsubscribe/health поверх настоящего `ws.Hub`), правки тестов `internal/auth`, `internal/food`. `go build ./...`, `go vet ./...`, `go test ./...` — чисто.

### Этап 4+: Внешний приём (первичный задел) — не начато
- ⭕ HTTP-ручка batch-приёма `service + snapshots[]` в `internal/metrics`, авторизация по ключу источника.
- ⭕ Подключение конкретных внешних скриптов — отдельные задачи позже.

### Ревизия под политику "не бояться breaking changes" — правка 000003, колонка `service`

По итогам ревизии всех решений этой фичи под новой политикой (см. корневой план) — таблица `metrics` дополнена колонкой `service` (правкой той же `000003_metrics.sql`, не новой миграцией):

```
UNIQUE(service, metricName, minuteBucket)
```

Причина: `HealthStatus` уже получил `services[]` на Этапе 3 (детализация по сервисам для карточек на фронте) — но сама таблица метрик и `MetricPoint`/`DetailUpdate` оставались без понятия "сервис", хотя Этап 4A/4B (внешний приём) рано или поздно принесёт метрики от других источников. Поправили сейчас, пока это бесплатно (только своя миграция, ничего не зарелизено), а не когда придётся резать поверх уже выпущенной схемы.

- `Repository.AddToCounter(ctx, service, name, bucket, delta)` — `service` теперь явный параметр, не подразумевается.
- `MetricPoint` получил поле `Service string` — отдаётся и в detail-канал, и в HTTP (если такой появится).
- `Service.Flush` передаёt `MainServiceName` (= `"megaapp"`) — единственный источник метрик внутри текущего бинарника; внешние источники (Этап 4A/4B) будут передавать свой `service` явно.
- Заодно убрали nil-guard в `food.WriteHandler.recordMetric` (`MetricsRecorder` — обязательная зависимость, не опциональная) — тест (`http_test.go`) теперь передаёт настоящий fake-recorder вместо `nil`. Это тоже было излишней защитной осторожностью без реального кейса.

**Важно для реальной dev-БД**: таблица `metrics` была создана раньше со старой схемой (без `service`). `CREATE TABLE IF NOT EXISTS` в правленой миграции — no-op, если таблица уже существует. Чтобы подтянуть новую схему на уже существующей БД: удалить таблицу `metrics` и строку `000003_metrics` из `schema_migrations`, перезапустить сервер — миграция накатится заново с нуля. Сделано один раз в рамках этой правки; для последующих правок той же миграции до релиза — повторять то же самое.

### Расширение списка метрик: каталог, restore-day, джобы

По итогам ревизии всех действий пользователя в food-домене (см. список выше) добавлено:
- `food_diary_day_restored` в `RestoreDiaryEntriesForDay` (`internal/food/write_http.go`) — раньше сознательно не заводилась, пересмотрено по той же причине, что и общая политика "не бояться менять решения до релиза".
- `food.CatalogueHandler` получил поле `metrics MetricsRecorder` и параметр конструктора (`NewCatalogueHandler(service, realtime, metricsRecorder)`) — `food_catalogue_entry_created`/`_updated` в `SaveProduct`, `food_catalogue_entry_deleted` в `DeleteCatalogueEntry`.
- `food_coefficients_job_ran` — инкремент в `internal/httpx/app.go`, в замыкании cron-джобы `coefficients`, после успешного `RunCoefficientsJob` (внутренний `FailedCount` по отдельным пользователям не блокирует инкремент — это деталь логов, не метрики).
- `backup.MetricJobRan = "backup_job_ran"` — новая константа в `internal/backup/service.go`; инкремент в `internal/httpx/modules.go`, в замыкании cron-джобы `backup`, после успешного `service.Run`.

Архитектурное следствие: `buildBackupModule` теперь принимает `metricsRecorder *metrics.Service` — для этого порядок сборки модулей в `internal/httpx/app.go` поменян: `wsModule` + `metricsModule` собираются раньше `quotesModule`/`backupModule` (а не после), чтобы recorder был готов к моменту регистрации backup-джобы. `quotesModule` (домен `money`) метрику не получил — пользователь явно сузил задачу до food-домена, money — отдельная, не начатая тема.

Обновлены тесты: `internal/food/http_test.go` — все три вызова `NewCatalogueHandler` теперь передают `&fakeMetricsRecorder{}` вместо отсутствовавшего параметра. `go build ./...`, `go vet ./...`, `go test ./...` — чисто.

## План расширения: `spread-capture-bot/v3`

Новая задача не требует второго metrics-сервиса. Расширяется тот же `internal/metrics`.

### Этап 4A: локальный MVP

- Новый inbound HTTP handler сразу принимает batch:
  - `service`;
  - `snapshots[]`;
  - у каждого snapshot: `minuteBucket`, `metrics` map.
- Даже одна минута идёт через `snapshots[]` длиной 1.
- Этот путь не проходит через in-memory accumulator `Increment()`/`Flush()`.
- Для внешнего snapshot нужен отдельный repository write-path:
  - не `value + delta`;
  - а прямой overwrite конкретного окна по `(service, metricName, minuteBucket)`.
- Весь batch пишется в одной DB transaction:
  - если один snapshot невалиден или один write упал, commit не происходит;
  - бот не получает success ack и не чистит свою очередь.
- После успешной записи handler сразу:
  - публикует detail update текущим подписчикам;
  - обновляет health данного сервиса для всех админов.
- Для `spread-capture-bot/v3` MVP авторизация не усложняется:
  - сценарий только same-host / private-host;
  - endpoint считается внутренним эксплуатационным контрактом, не публичным пользовательским API.

### Этап 4B: remote-ready

- Тот же handler принимает batch массив minute snapshots.
- На входе появляется source config:
  - `service`;
  - allowlist IP / CIDR;
  - лимит размера batch;
  - stale/backfill лимиты.
- Ошибки должны быть разнесены по классам:
  - invalid payload;
  - forbidden source;
  - stale / oversized batch;
  - transient storage failure.

### Health для внешнего сервиса

Для `spread-capture-bot/v3` health нельзя оставлять вечным `ok`, как сейчас у `megaapp`.

Нужна простая server-side формула:

- `error`, если source stale дольше заданного окна или пришёл snapshot с явным критическим сигналом;
- `warn`, если freshness близка к порогу или часть quality-метрик вышла за пределы;
- `ok` иначе.

Базовый набор для первой версии:

- freshness last snapshot;
- `cycle_errors`;
- `books_missing`;
- `reconcile_cycle_duration_ms`.

Все пороги статичны в коде или конфиге источника. Фронт только показывает уже готовую severity.

### Почему snapshot map, а не одна метрика на запрос

- Один minute push от бота содержит десятки тесно связанных значений.
- Один запрос на всю минуту проще для бота и проще для валидации.
- Бэк всё равно хранит данные построчно, так что map раскладывается только внутри handler-а.

### Почему batch нужен уже в локальном MVP

- Даже на одном сервере `megaapp` может быть недоступен во время deploy/restart.
- Бот в это время продолжает жить.
- Значит первый же внешний ingest должен уметь принять накопившийся хвост минут, а не только одну текущую минуту.

### Checklist

- ✅ Добавить inbound snapshot handler в `internal/metrics`.
- ✅ Добавить repository write-path с overwrite-semantics для внешних окон.
- ✅ Добавить валидацию `service`, `minuteBucket`, metric map.
- ✅ Писать весь входящий batch в одной транзакции и отвечать success только после commit.
- ✅ После write сразу слать detail update подписчикам.
- ✅ Ввести health state для внешних сервисов, не только для `megaapp`.
- ✅ Для этапа 4A подключить `spread-capture-bot-v3` как первый внешний source.
- ⭕ Для этапа 4B добавить IP allowlist, batch mode и ingest limits.
