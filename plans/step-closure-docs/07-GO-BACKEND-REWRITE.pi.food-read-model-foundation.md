# Go Backend Rewrite — Food Read Model Foundation

> Step 06 Step Closure Doc. Фиксирует перенос базовых food read endpoints в Go runtime.

---

## 1. Scope of the step

Step 06 закрывает:
- `GET /api/food/diary-full-update`
- `GET /api/food/catalogue`
- `GET /api/food/catalogue/:catalogueId`
- `GET /api/food/coefficients`
- `GET /api/food/stats`
- default coefficient bootstrap and normalization
- diary read shaping for frontend
- stats read calculation in Go

Step не закрывает:
- food write routes
- realtime food events
- semantic search
- AI product flows
- image and voice analysis

---

## 2. Implemented structure

Добавлены файлы:
- `megaapp-back/internal/food/repo.go`
- `megaapp-back/internal/food/service.go`
- `megaapp-back/internal/food/http.go`
- `megaapp-back/internal/food/service_test.go`
- `megaapp-back/internal/food/http_test.go`

Также food read routes зарегистрированы в общем app runtime.

---

## 3. Runtime decisions fixed by this step

## 3.1 Read contract preservation

Сохранены маршруты и их базовые response shapes:
- `GET /api/food/diary-full-update`
- `GET /api/food/catalogue`
- `GET /api/food/catalogue/:catalogueId`
- `GET /api/food/coefficients`
- `GET /api/food/stats`

## 3.2 Diary full-update model

Go runtime собирает diary read model из:
- `foodDiary`
- `foodBodyWeight`
- `foodCatalogue`
- `foodSettings.coefficients`
- calculated stats
- user goal from `settings`

## 3.3 Coefficients model

Если coefficients у пользователя отсутствуют или невалидны:
- создаётся normalized map
- для всех текущих catalogue ids ставится `1.0`

## 3.4 Stats model

Stats calculation перенесён в Go как read-time calculation over current SQLite data.

На текущем шаге это read foundation, а не background recalculation workflow.

---

## 4. Manual verification model

Для этого stepа ручная проверка должна смотреть на UI и на DevTools Network.

Ожидания:
- `GET /api/food/diary-full-update` проходит успешно
- `GET /api/food/catalogue` проходит успешно
- `GET /api/food/coefficients` проходит успешно
- `GET /api/food/stats` проходит успешно
- `Food` screen не уходит в auth redirect
- нет `401`, `404`, `500`
- нет frontend ошибок из-за response shape mismatch

---

## 5. Test coverage introduced in this step

Покрыто:
- catalogue read
- single catalogue entry read
- coefficients bootstrap/read
- stats read
- diary full-update shape smoke
- HTTP integration for food read routes

---

## 6. Non-goals intentionally left for later

В этом stepе намеренно не делались:
- diary write routes
- body weight write route
- stats invalidation workflow
- websocket food event emission
- search and AI handlers

---

## 7. Exit condition reached

Step 06 можно считать реализованным на read-foundation level, потому что:
- core food read endpoints живут в Go runtime
- frontend-critical read shapes собраны в Go
- tests по food read foundation проходят

---

## 8. What opens next

Этот step открывает следующие шаги:
- Step 07: Food Write Core
- Step 08: Food Stats And Coefficients hardening
- later realtime wiring on top of the same read model
