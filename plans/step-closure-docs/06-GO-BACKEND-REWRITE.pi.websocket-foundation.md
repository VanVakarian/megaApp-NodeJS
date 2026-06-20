# Go Backend Rewrite — WebSocket Foundation

> Step 05 Step Closure Doc. Фиксирует базовый WebSocket transport в Go runtime.

---

## 1. Scope of the step

Step 05 закрывает:
- connection auth
- token via query or bearer header
- clientId support
- per-user socket registry
- JSON heartbeat with `PING` and `PONG`
- sync-status push on connect
- broadcast to user
- broadcast to all
- sender exclusion by `clientId`
- typed message handler registry foundation

Step не закрывает:
- food realtime events
- money realtime events
- voice-stream processing
- domain-specific outbound event publishing

---

## 2. Implemented structure

Добавлены файлы:
- `megaapp-back/internal/ws/http.go`
- `megaapp-back/internal/ws/hub.go`
- `megaapp-back/internal/ws/sync.go`
- `megaapp-back/internal/ws/http_test.go`

Также WebSocket route зарегистрирован в общем app runtime:
- `GET /api/ws`

---

## 3. Runtime decisions fixed by this step

## 3.1 Transport model

Используется отдельный `Hub`.

Он отвечает за:
- хранение socket registry по `userID`
- lifecycle подключений
- heartbeat
- broadcast operations
- sender exclusion logic

## 3.2 Auth model

Подключение принимает token через:
- query param `token`
- `Authorization: Bearer <token>`

Невалидный или отсутствующий token отклоняется до upgrade.

## 3.3 Connect semantics

На успешном connect:
- socket добавляется в registry пользователя
- сохраняется `clientId`
- клиент сразу получает `SYNC_STATUS`

Payload:
- `userDataLastModifiedTs`

## 3.4 Heartbeat model

Heartbeat реализован JSON-сообщениями:
- server -> `PING`
- client -> `PONG`

Если клиент не отвечает на предыдущий heartbeat, соединение закрывается и удаляется из registry.

## 3.5 Message dispatch foundation

Введён registry обработчиков по `type`.

На текущем шаге это только transport seam для следующих realtime stepов.

---

## 4. Manual verification model

Для этого stepа ручная проверка должна смотреть не только на UI, но и на DevTools Network.

Ожидания:
- WebSocket connect идёт в `GET /api/ws`
- в локальном run frontend на `:4200` или `:4201` должен открывать WebSocket напрямую в backend на `:3000`
- успешный upgrade виден как `101 Switching Protocols`
- параллельный `GET /api/settings/` не даёт `401`, `404` или `500`
- после refresh WebSocket поднимается заново без бесконечного reconnect loop
- при простом idle heartbeat не должен приводить к logout или видимому disconnect storm

---

## 5. Test coverage introduced in this step

Покрыто:
- successful WebSocket connect
- `SYNC_STATUS` on connect
- invalid token rejection
- heartbeat success path with `PONG`
- sender exclusion on broadcast

---

## 6. Non-goals intentionally left for later

В этом stepе намеренно не делались:
- food event broadcasting
- sync-status mutation on domain writes
- voice chunk handling
- reconnect-specific server state recovery beyond transport basics

---

## 7. Exit condition reached

Step 05 можно считать реализованным на transport level, потому что:
- `/api/ws` живёт в Go runtime
- auth-gated connect работает
- user socket registry работает
- heartbeat работает
- broadcast foundation готова
- tests по WebSocket foundation проходят

---

## 8. What opens next

Этот step открывает следующие шаги:
- realtime wiring for food writes
- later WebSocket event emission from domain modules
- shared sync-status updates from future write paths
