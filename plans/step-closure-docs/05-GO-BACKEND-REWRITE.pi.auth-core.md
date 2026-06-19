# Go Backend Rewrite — Auth Core

> Step 03 Step Closure Doc. Фиксирует перенос auth boundary на Go.

---

## 1. Scope of the step

Step 03 закрывает:
- register
- login
- refresh
- JWT issue/verify
- password hashing
- HTTP auth middleware
- user claims extraction from request context

Step не закрывает:
- settings domain
- websocket auth integration
- role/permission model beyond current behavior

---

## 2. Implemented structure

Добавлены файлы:
- `megaapp-back/internal/auth/repo.go`
- `megaapp-back/internal/auth/service.go`
- `megaapp-back/internal/auth/token.go`
- `megaapp-back/internal/auth/http.go`
- `megaapp-back/internal/auth/service_test.go`
- `megaapp-back/internal/auth/http_test.go`

Также auth routes зарегистрированы в общем app runtime.

---

## 3. Runtime decisions fixed by this step

## 3.1 Contract preservation

Сохранены маршруты:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`

Сохранён основной response contract токенов:
- `accessToken`
- `refreshToken`

Сохранена базовая semantics ошибок:
- invalid creds -> `401`
- invalid refresh token -> `401`
- duplicate username -> `400`

## 3.2 Password model

Пароли хэшируются через bcrypt.

## 3.3 Token model

JWT issue/verify реализованы в отдельном `TokenManager`.

Claims содержат:
- `id`
- `username`
- registered claims with expiration

TTL зафиксированы по текущей semantics:
- access token: 1 day
- refresh token: 31 days

## 3.4 HTTP middleware model

Введён auth middleware для bearer token:
- читает `Authorization: Bearer <token>`
- валидирует token
- кладёт typed claims в request context

Это и есть foundation для следующих stepов, где понадобятся protected routes.

---

## 4. Test coverage introduced in this step

Покрыто:
- register
- duplicate register rejection
- login success
- login failure on wrong password
- token verify
- refresh token flow
- HTTP auth endpoints
- middleware success path
- middleware unauthorized path

---

## 5. Non-goals intentionally left for later

В этом stepе намеренно не делались:
- user admin/domain-specific auth extensions
- websocket auth wiring
- auth-related structured logging enrichment with user fields
- auth rate limits or brute-force protection

---

## 6. Exit condition reached

Step 03 можно считать закрытым, потому что:
- auth routes живут в Go runtime
- bcrypt and JWT flow работают
- auth middleware готов для protected routes
- unit and integration tests по auth проходят

---

## 7. What opens next

Этот step открывает следующие шаги:
- Step 04: Settings
- Step 05: WebSocket Foundation
- любые следующие protected HTTP domains
