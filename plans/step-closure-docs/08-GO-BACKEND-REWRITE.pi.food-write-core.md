# Go Backend Rewrite — Food Write Core

> Step 07 Step Closure Doc. Фиксирует перенос базовых food write flows в Go runtime.

---

## 1. Scope of the step

Step 07 закрывает:
- `POST /api/food/diary/`
- `PUT /api/food/diary`
- `DELETE /api/food/diary/:diaryId`
- `DELETE /api/food/diary/day/:dateISO`
- `POST /api/food/diary/day/:dateISO/restore`
- `POST /api/food/body-weight`
- user sync timestamp updates
- food WebSocket event emission for diary and body weight
- temporary manual verification path for add-to-diary flow while semantic search is still unmigrated

Step не закрывает:
- semantic search
- AI product flows
- image and voice analysis
- background stats jobs
- advanced cache invalidation workflow

---

## 2. Implemented structure

Добавлены файлы:
- `megaapp-back/internal/food/write_repo.go`
- `megaapp-back/internal/food/write_http.go`

Обновлены:
- `megaapp-back/internal/food/service.go`
- `megaapp-back/internal/food/service_test.go`
- `megaapp-back/internal/food/http_test.go`
- `megaapp-back/internal/httpx/app.go`
- `megaapp-back/internal/ws/hub.go`

---

## 3. Runtime decisions fixed by this step

## 3.1 Write contract preservation

Сохранены базовые write routes и их response semantics:
- create diary entry -> `201`
- edit diary entry -> `200`
- delete diary entry -> `200` or `404`
- delete day -> `200` or `404`
- restore day -> `201`
- save body weight -> `201`

## 3.2 Diary history model

Diary edit appends a new history item to the stored history, matching the old backend behavior.

## 3.3 Realtime sync model

After successful writes Go runtime emits:
- `DIARY_ENTRY_CREATED`
- `DIARY_ENTRY_UPDATED`
- `DIARY_ENTRY_DELETED`
- `DIARY_DAY_DELETED`
- `BODY_WEIGHT_UPDATED`

Sender exclusion uses `X-Client-ID`, so optimistic updates in the initiating tab do not get duplicated by echoed WebSocket events.

## 3.4 Sync status model

Each successful write updates the per-user sync timestamp kept by the WebSocket foundation.

## 3.5 UI reachability issue found during verification

Manual verification exposed a step-boundary problem rather than a write-route bug.

Observed chain:
- user must search a product before creating a diary entry from the normal UI flow
- frontend defaulted to WebSocket semantic search
- current Go runtime in completed steps does not yet implement `SEARCH_QUERY` and `SEARCH_RESULTS`
- therefore the write flow existed in backend code but was not reachable from the default UI path

Applied temporary resolution:
- Step 07 manual verification must use the existing UI search-mode toggle to switch into local legacy search
- this keeps Step 07 manually testable without pulling Step 09 semantic search into the current scope
- default user-facing search behavior must stay unchanged

Design consequence fixed by this finding:
- a step is not considered practically ready when its primary UI path still depends on an unmigrated transport contract from a later step
- in such cases the current step must either provide a fallback path or explicitly defer manual verification
- if a fallback path is used, it must preserve default user-facing behavior and must not silently flip the default mode for real users

---

## 4. Manual verification model

Для этого stepа ручная проверка должна смотреть на UI, DevTools Network и cross-tab WebSocket behavior.

Ожидания:
- product search produces selectable results before write verification starts
- current temporary verification path uses manual switch to local legacy search rather than WebSocket semantic search
- create/edit/delete/restore/body-weight requests проходят успешно
- нет `401`, `404`, `500` на valid flows
- initiating tab не получает duplicate echo after optimistic update
- second tab получает изменения через WebSocket without manual refresh
- diary and body weight remain visually consistent after each write

---

## 5. Test coverage introduced in this step

Покрыто:
- diary create
- diary edit with appended history
- diary delete
- day delete
- day restore
- body weight save
- WebSocket broadcast on write with sender exclusion

---

## 6. Non-goals intentionally left for later

В этом stepе намеренно не делались:
- semantic search write-side flows
- stats recalculation background scheduling
- AI-assisted catalogue mutation flows
- catalogue write routes

Но after verification one important dependency was made explicit: semantic search is a usability dependency for the main add-to-diary UI path even though it is not part of the Step 07 backend write contract.

The temporary verification workaround must not silently change the default user-facing search mode because that would violate the parity constraint of the rewrite.

---

## 7. Final status after verification

Step 07 закрыт, потому что:
- базовые food write endpoints живут в Go runtime
- sender-excluded WebSocket sync для diary and body weight работает
- tests по write foundation проходят
- user manually verified diary create/edit/delete, delete day, restore day, body weight save, and cross-tab WebSocket sync

Additional compatibility issue found and fixed during manual verification:
- frontend sends `bodyWeight` as a JSON string
- old JS backend accepted that payload and normalized it through `parseFloat`
- initial Go handler expected only a numeric JSON value and returned `400`
- Go handler was corrected to accept both numeric and string `bodyWeight` payloads to preserve the existing frontend contract

---

## 8. What opens next

Этот step открывает следующие шаги:
- Step 08: Food Stats And Coefficients
- later semantic search and AI flows on top of the same food core
