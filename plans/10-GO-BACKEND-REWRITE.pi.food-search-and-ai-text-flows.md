# Go Backend Rewrite — Food Search And AI Text Flows

> Step 09 artifact. Фиксирует восстановление default search reachability и catalogue text-flow compatibility in Go runtime.

---

## 1. Scope of the step

Step 09 implements:
- WebSocket `SEARCH_QUERY` handling
- WebSocket `SEARCH_RESULTS` responses
- `GET /api/food/search`
- `POST /api/food/generate-product-preview`
- `POST /api/food/save-product`
- `DELETE /api/food/catalogue/:catalogueId`
- `POST /api/food/analyze-voice`
- `CATALOGUE_ENTRY_SAVED` cross-tab broadcast
- default search-flow reachability without forcing legacy mode

Step 09 does not yet implement full provider parity for:
- image generation queue
- multimodal image analysis flows

---

## 2. Implemented structure

Added files:
- `megaapp-back/internal/food/search_cache.go`
- `megaapp-back/internal/food/catalogue_repo.go`
- `megaapp-back/internal/food/catalogue_service.go`
- `megaapp-back/internal/food/catalogue_http.go`
- `megaapp-back/internal/food/search_ws.go`

Updated:
- `megaapp-back/go.mod`
- `megaapp-back/.env`
- `megaapp-back/.env.example`
- `megaapp-back/.env.dev.example`
- `megaapp-back/.env.test.example`
- `megaapp-back/internal/config/config.go`
- `megaapp-back/internal/config/config_test.go`
- `megaapp-back/internal/food/ai_openrouter.go`
- `megaapp-back/internal/food/ai_openrouter_test.go`
- `megaapp-back/internal/food/ai_embeddings.go`
- `megaapp-back/internal/food/search_repo.go`
- `megaapp-back/internal/food/service.go`
- `megaapp-back/internal/food/http_test.go`
- `megaapp-back/internal/food/service_test.go`
- `megaapp-back/internal/httpx/app.go`
- `megaapp-back/internal/ws/hub.go`
- `megaapp-back/plans/02-GO-BACKEND-REWRITE.pi.implementation-plan.md`

---

## 3. Runtime decisions fixed by this step

## 3.1 Default search path restoration

The default frontend search mode now reaches a working Go backend path again through WebSocket search messages.

## 3.2 Search strategy used in this step

Current Go search is hybrid:
- first it uses the existing cached query embeddings and stored catalogue vectors from SQLite when they are available
- if the query embedding is missing, it generates a new embedding through OpenAI and persists it in SQLite
- saved catalogue entries now receive fresh name and description embeddings through OpenAI during save-product flows
- if semantic data is still unavailable, it falls back to deterministic lexical ranking over catalogue name, legacy name, description, and keyboard-layout transliteration

## 3.3 AI-backed text preview flow

`generate-product-preview` now uses OpenRouter-backed text generation so the create-product form is populated from the user query rather than from an unrelated existing catalogue match.

## 3.4 AI-backed voice-text flow

`analyze-voice` now uses the same OpenRouter-backed text generation path and then resolves search suggestions from the generated generalized product.

## 3.5 Cross-tab catalogue sync

Saving a catalogue entry emits `CATALOGUE_ENTRY_SAVED` to other tabs while excluding the initiating client.

---

## 4. Remaining boundary kept explicit

This step restores user-facing search and catalogue-flow reachability first. Query embeddings and catalogue embeddings are now generated through OpenAI, while preview and voice-text flows rely on OpenRouter-backed text generation. Full parity is still not complete only because image-heavy AI flows remain outside this step.

Catalogue deletion verification also has a strict product-state requirement: it must be tested on a newly created product before that product is added to any diary entry. Existing products with diary references are intentionally non-deletable and correctly hide the delete action.

Manual verification exposed one blocking limitation in the initial fallback design: `generate-product-preview` could prefill the create-product form from an unrelated existing catalogue match instead of generating a new product candidate from the user query. Step 09 now replaces that fallback with OpenRouter-backed text generation for preview and voice-text flows.

The runtime configuration path is also fixed explicitly: OpenRouter and OpenAI settings are surfaced in `megaapp-back/.env` and the env example files so the operator has one obvious place to provide the keys and models.

Decision fixed by this finding:
- do not skip Step 09
- do not split out a separate 09.1 step
- complete the missing AI-backed create-product text flow inside Step 09 because preview generation and voice-text analysis already belong to its original scope
- keep image generation and media-heavy AI parts in later steps

---

## 5. Automated coverage introduced in this step

Covered:
- WebSocket search response path
- cached semantic search path
- generated query embedding persistence path
- generated catalogue embedding path on save-product
- OpenRouter preview parsing and validation
- search route reachability
- preview route reachability
- voice-text route reachability
- save-product route reachability
- delete-product route reachability
- catalogue saved broadcast reachability
- service-level preview, search, save, and delete behavior

## 6. Manual verification outcome

Manual verification confirmed the intended Step 09 user path end to end:
- unknown query reaches create-product flow
- `generate-product-preview` returns an AI-generated candidate
- the new product can be saved
- the saved product becomes searchable again through the default flow
- the product can be added to the diary
- the diary entry can be deleted
- the unused product can then be edited and deleted successfully

Step 09 is therefore closed.
