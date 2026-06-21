# Metrics — Implementation Plan (Backend)

Backend-часть единого плана [`METRICS._implementation-plan.md`](../../METRICS._implementation-plan.md) в корне проекта — туда читать общую архитектуру и контракты. Здесь — конкретно по коду `megaapp-back`.

## Как сейчас

- Модуля метрик нет вообще.
- `internal/ws/hub.go`: `Hub.clientsByUserID map[int64]map[*Client]struct{}`, `BroadcastToUser(userID, payload, excludeClientID)`, `BroadcastToAll(...)`, `RegisterHandler(messageType, handler)`. Никакой фильтрации по ролям/топикам внутри `Hub` нет — broadcast either "этому юзеру" либо "вообще всем подключённым".
- Уже есть рабочий пример push-паттерна: `internal/food/realtime.go` (`WSRealtimePublisher`) — оборачивает `*ws.Hub`, шлёт `{"type": ..., "payload": ...}` через `BroadcastToUser`/`BroadcastToAll`. Метрики должны повторить этот же паттерн, не трогая сам `Hub`.
- `internal/auth`: `TokenClaims{UserID, Username}`, `auth.User{ID, Username, HashedPassword}`. Таблица `users` (`migrations/000001_auth_and_settings.sql`) уже содержит колонку `isAdmin BOOLEAN`, но она **нигде не используется в Go-коде** — ни в `Repository.GetUserByUsername` (не селектится), ни в `User`, ни в `TokenClaims`, ни в `Service.Verify`. Концепция админа существует только в схеме БД.
- Миграции: `internal/platform/sqlite/migrations.go` — пронумерованные `.sql`-файлы + таблица `schema_migrations`, которая помнит применённые версии и пропускает их повторное исполнение. Стандартная Go-схема (как `golang-migrate`/`goose`) — миграции неизменяемы после создания, новая правка всегда новый файл. (Зафиксировано как общее правило в `~/.claude/rules/database.md`.)
- Модули собираются в `internal/httpx/modules.go` (repo → service → handler на каждый домен), маршруты регистрируются в `internal/httpx/app.go` через `<module>.RegisterRoutes(router, ...)`.

## Как должно быть

- Новый изолированный пакет `internal/metrics`, без обратных зависимостей на другие домены.
- Модель: Counter/Gauge — статическое свойство имени метрики на уровне кода. In-memory accumulator под `sync.Mutex`, фоновый тикер раз в минуту коммитит в SQLite и сбрасывает accumulator.
- Единый write-path: всегда upsert по `(metric_name, minute_bucket)`, bucket = floor-to-minute начала интервала. Внешние пуши (Этап 3) этот accumulator не используют — сразу upsert при получении.
- Таблица метрик — **новая миграция** `000003_metrics.sql` (не правка существующих файлов — см. обновлённое правило про Go-style versioned migrations).
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
- HTTP-ручка внешнего приёма (Этап 3) — отдельный файл в том же пакете `internal/metrics`, отдельная авторизация по ключу источника (не общий JWT). Пуши уходят сразу в detail-канал текущим подписчикам.

## Метрики первой итерации (зафиксировано)

- `food_diary_entry_created` — Counter, создание записи дневника.
- `food_diary_entry_updated` — Counter, изменение веса записи (любое +/- или новое значение).
- `food_diary_entry_deleted` — Counter, удаление одной записи.
- `food_diary_day_deleted` — Counter, удаление всех записей за день (отдельно от удаления одной записи).
- `food_body_weight_updated` — Counter, изменение веса тела (первый ввод и последующие — не различаются).

Restore-day (`RestoreDiaryEntriesForDay`, отмена удаления) метрику создания не инкрементирует — это технический откат, а не пользовательское действие создания.

## Открытые вопросы (не закрыты этим планом)

- ⭕ Способ авторизации внешних источников для Этапа 3 (отдельный API-ключ на источник) — решается при подходе к Этапу 3.

## Реализовано (Этап 1 + Этап 2)

Отклонения от первоначального плана, найденные в процессе реализации:

- **Список админов не кэшируется при старте** — запрашивается заново при каждом flush и при каждом `METRICS_SUBSCRIBE` (`SELECT id FROM users WHERE isAdmin = 1`, единицы строк). Проще, чем кэш + инвалидация, и новый админ подхватывается без перезапуска приложения.
- **Health-severity — честная заглушка.** Все 5 метрик первой итерации — счётчики обычных действий, а не сигналы отказа, поэтому считать из них "ok/warn/error" по порогам пока не из чего. `BroadcastHealth` шлёт фиксированный `{"severity": "ok"}" на каждый flush — транспорт полностью готов, реальную формулу считать стоит только когда появится метрика, реально отражающая отказ/деградацию.
- **Один маленький geттер добавлен в `internal/ws`**: `func (c *Client) UserID() int64`. Без него `METRICS_SUBSCRIBE`-хендлер не может проверить, админ ли отправитель. Это не нарушает принцип "не трогаем `Hub`/`Client`" по сути — геттер не меняет поведение broadcast/Hub, просто открывает уже существующее поле на чтение. Никакая admin-логика в `ws` не появилась.
- **`isAdmin` в `CreateUser`/`GetUserByUsername`**: новые пользователи получают `isAdmin = 0` явно; существующие строки (созданные до этой правки) могли иметь `NULL` — обработано через `sql.NullBool`, трактуется как `false`. **Чтобы реально включить админский доступ себе, нужно руками выполнить `UPDATE users SET isAdmin = 1 WHERE username = '<ваш юзернейм>';` на реальной БД** — UI/API для назначения админа не строился, это не было частью задачи.
- Cron-расписание flush — `"* * * * *"` (точная минута по wall-clock), а не `@every 1m` — `@every` считает интервал от момента регистрации джобы, а не от начала календарной минуты, и сломал бы контракт floor-to-minute. Не вынесено в конфиг — это архитектурная константа, привязанная к контракту минутного бакета, не настройка.

### Этап 1: Сборщик + хранение — ✅ готово
- ✅ `internal/metrics`: accumulator (mutex + map), `Service.Flush` (вызывается cron-джобой `"metrics"`), `Repository.AddToCounter` (upsert), `Repository.ListSince`.
- ✅ Миграция `migrations/000003_metrics.sql`.
- ✅ Модуль в `internal/httpx/modules.go` (`buildMetricsModule`) и `app.go`.
- ✅ Список метрик зафиксирован (см. выше) и вызовы расставлены в `internal/food/write_http.go` (5 хендлеров).

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

### Этап 3: Внешний приём (задел на будущее) — не начато
- ⭕ HTTP-ручка приёма `(name, window-start timestamp, value)` в `internal/metrics`, авторизация по ключу источника.
- ⭕ Подключение конкретных внешних скриптов — отдельные задачи позже.
