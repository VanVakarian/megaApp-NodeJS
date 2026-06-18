# Go Backend Rewrite — Food Images, Lab, Debug

> Step 11 Step Closure Doc. Фиксирует перенос image/media-потоков food, runtime-safe static serving, и инженерных lab/debug pathов, нужных для сохранения текущего food contract во время rewrite.

---

## 1. Scope of the step

Step 11 closes:
- authenticated image analysis entrypoint for food
- controlled `/api/images/food/{filename}` serving
- filesystem-backed image versioning and variant storage
- in-process image generation and rebuild pipeline
- lab routes for product generation, embeddings, image generation, and variant rebuild
- debug routes for catalogue inspection, rate-limit inspection, export/import, and ping
- multipart-specific request-size guardrails for image uploads
- frontend-visible imageVersion propagation through catalogue read models

Step 11 does not close:
- removal of now-unused lab/debug/photo paths after migration priorities change
- money-domain migration
- quote and backup job migration
- final post-cutover cleanup of temporary engineering endpoints

---

## 2. Implemented structure

Added files:
- `megaapp-back/internal/food/ai_openrouter_media.go`
- `megaapp-back/internal/food/image_pipeline.go`
- `megaapp-back/internal/food/image_store.go`
- `megaapp-back/internal/food/lab_debug_http.go`
- `megaapp-back/internal/food/lab_debug_service.go`
- `megaapp-back/internal/food/lab_repo.go`
- `megaapp-back/internal/food/media_http.go`
- `megaapp-back/internal/food/media_service.go`
- `megaapp-back/internal/httpx/middleware_test.go`
- `megaapp-back/plans/step-closure-docs/12-GO-BACKEND-REWRITE.pi.food-images-lab-debug.md`

Updated:
- `megaapp-back/.env`
- `megaapp-back/.env.example`
- `megaapp-back/.env.dev.example`
- `megaapp-back/.env.test.example`
- `megaapp-back/.gitignore`
- `megaapp-back/go.mod`
- `megaapp-back/go.sum`
- `megaapp-back/internal/config/config.go`
- `megaapp-back/internal/config/config_test.go`
- `megaapp-back/internal/food/catalogue_http.go`
- `megaapp-back/internal/food/catalogue_service.go`
- `megaapp-back/internal/food/http_test.go`
- `megaapp-back/internal/food/realtime.go`
- `megaapp-back/internal/food/service.go`
- `megaapp-back/internal/httpx/app.go`
- `megaapp-back/internal/httpx/modules.go`
- `megaapp-back/internal/httpx/router_test.go`
- `megaapp-back/plans/02-GO-BACKEND-REWRITE.pi.implementation-plan.md`

---

## 3. Runtime decisions fixed by this step

## 3.1 Media flow placement

Image analysis, image generation, and filesystem variant management now live inside the food module boundaries created in Step 10 rather than as ad-hoc handler logic.

## 3.2 Static serving boundary

Food images are now served only through controlled filename resolution rooted under the dedicated public image directory. The route does not expose arbitrary filesystem traversal.

## 3.3 Multipart boundary

Image uploads use a dedicated multipart body limit instead of reusing the smaller JSON request limit.

## 3.4 Image version contract

Catalogue entries now surface `imageVersion` from the Go-side filesystem state so the existing frontend cache-busting behavior keeps working.

## 3.5 Lab and debug compatibility

The inherited engineering routes needed for image/media iteration are now reachable from Go runtime, so image generation, embeddings generation, targeted rebuilds, export/import, and provider diagnostics no longer depend on the old JS process.

## 3.6 Visual parity correction

The first Go image-variant pass was geometrically too approximate for the inherited UI contract. The final Step 11 state replaces that approximation with path-rasterized masking and corrected `corner` and `squircle` geometry closer to the original JS `sharp` pipeline.

---

## 4. Automated coverage introduced in this step

Covered:
- authenticated multipart image-analysis route reachability
- controlled static image serving
- request-body and multipart-limit behavior
- image pipeline and image-store integration behavior
- app/router reachability for the new media, lab, and debug routes
- provider wiring and config defaults for new media-related settings

`go test ./...` in `megaapp-back` passed after the final Step 11 implementation pass.

---

## 5. Manual verification status

User reran the full Step 11 browser and direct-endpoint smoke checklist after implementation.

Confirmed manually:
- image-related food flow behaves correctly on the intended frontend path
- image/static-serving paths work correctly
- targeted image rebuild behavior works correctly
- the final corrected variants match the expected UI much more closely
- the intended Step 11 browser-visible behavior is stable after the geometry fix

Step 11 is therefore closed.

---

## 6. What this opens next

This step opens the next migration work on money foundations:
- Step 12: Money Setup Foundation
- Step 13: Money Assets
- Step 14: Money Transactions Core
