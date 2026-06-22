# Go Backend Rewrite — Cutover And One-Shot Deploy Checklist

> Detailed Step 20 deployment checklist. Split into two large operational blocks: test first, then prod.

---

## 1. Confirmed decisions

Confirmed:
- Keep the live runtime folder names: `/root/megatest` and `/root/megaback`.
- Build the Go binary in GitHub Actions, not on the server.
- Keep the Go runtime database inside `./data`.
- Do not copy old local backup archives into the new runtime.
- Use explicit `.env.test` / `.env.prod` files on every runtime (server and local) — the loader still falls back to a generic `.env` if one exists, but the deploy convention never creates or ships one.
- Keep scheduled jobs disabled on the first Go start, and re-enable them once the observation window ends (see 1.1).
- Preserve rollback safety by renaming old server folders to `-old` and by preserving the old systemd unit content in `-old` files.
- Do not delete old assets immediately after cutover.
- Do not use git-based deploys inside the new Go runtime folder.

Not confirmed by this checklist:
- production deletion of old assets before the observation window ends
- final GitHub Actions implementation details

### 1.1 Common safety rules

Use these rules in both environments:
- Upload the release artifact before stopping the current service.
- Stop the old service before copying SQLite files.
- Copy `.db`, `.db-wal`, and `.db-shm` if they exist.
- Use the same relative paths in `.env.test`/`.env.prod` as in `.env.test.example`/`.env.prod.example` (`./data`, `./migrations`, `./public`, `./backups`) — systemd's `WorkingDirectory` anchors them, so the same file works unmodified on the server and locally. Do not set `DATABASE_PATH` — it defaults from `DATA_DIR` + `DB_NAME` + `DB_ENV` + `DB_VERSION`.
- Keep `QUOTES_JOB_ENABLED=false` and `BACKUP_JOB_ENABLED=false` on the first Go start.
- **Re-enable both flags once the observation window ends** (see 2.4 / 3.4) and confirm via `journalctl` that `job completed` actually appears for `backup` and `quotes`. A skipped job produces no log line in either direction — leaving the flags off silently stops backups and quotes with no error anywhere.
- Keep backup storage configured if manual backup smoke is required.
- Do not touch nginx unless the folder names or ports change.
- Do not delete `*-old` folders or `*-old.service` files until the observation window ends.

### 1.2 Deploy model used by this checklist

This checklist assumes the final Go deploy path is GitHub Actions based:
- GitHub Actions builds `megaapp-server`
- GitHub Actions uploads `megaapp-server`, `migrations/`, and `build-info.json`
- GitHub Actions places the runtime payload into `/root/megatest` or `/root/megaback`
- GitHub Actions restarts the target systemd service
- GitHub Actions never touches `.env.test` / `.env.prod` — those are maintained by hand on each runtime

This checklist intentionally does not use:
- manual `go build` on the server
- manual `scp` of release archives
- ad-hoc staging folders on the server
- git working trees inside the runtime folder

---

# 2. TEST BLOCK — `test.vslav.dev` / `/root/megatest`

## 2.1 Target test runtime model

```text
/root/megatest/
  megaapp-server
  build-info.json
  .env.test
  migrations/
  data/
    megaapp-test-005.db
    megaapp-test-005.db-wal
    megaapp-test-005.db-shm
  public/
    images/
  backups/
```

Persistent data that must survive the test cutover:
- SQLite database files
- `public/images`
- `.env.test`

Persistent data intentionally not copied:
- old local backup archives from `/root/megatest-old/backups`

## 2.2 Test cutover procedure

### 2.2.1 Pre-flight inspection on the server

```bash
systemctl status megatest --no-pager
systemctl cat megatest
ls -ld /root/megatest
ls -ld /etc/systemd/system/megatest.service
ls -lah /root/megatest | head -n 30
ls -lah /root/megatest/public | head -n 30
```

### 2.2.2 Stop the current Node.js test backend

```bash
systemctl stop megatest
systemctl status megatest --no-pager
```

### 2.2.3 Preserve the current test runtime folder

```bash
test ! -e /root/megatest-old
mv /root/megatest /root/megatest-old
ls -ld /root/megatest-old
```

### 2.2.4 Create the new Go test runtime folder and CI landing structure

```bash
install -d -m 755 /root/megatest
install -d -m 755 /root/megatest/data
install -d -m 755 /root/megatest/public
install -d -m 755 /root/megatest/backups
install -d -m 755 /root/megatest/migrations
ls -ld /root/megatest /root/megatest/data /root/megatest/public /root/megatest/backups /root/megatest/migrations
```

### 2.2.5 Copy the test SQLite database files

```bash
for suffix in "" "-wal" "-shm"; do if [ -f "/root/megatest-old/megaapp-test-005.db${suffix}" ]; then cp -av "/root/megatest-old/megaapp-test-005.db${suffix}" /root/megatest/data/; fi; done
ls -lah /root/megatest/data
```

### 2.2.6 Copy the test public images

```bash
cp -a /root/megatest-old/public/images /root/megatest/public/
find /root/megatest/public -maxdepth 3 | head -n 50
```

### 2.2.7 Create the new test `.env.test`

Open the old secret source and the new target file:

```bash
vim /root/megatest-old/env.js
vim /root/megatest/.env.test
```

`.env.test` must mirror [`.env.test.example`](../.env.test.example) structurally — same keys, same order, same relative paths. Only secrets and storage identifiers differ from the example placeholders:

```env
APP_ENV=test
APP_HOST=127.0.0.1
APP_PORT=3001
LOG_LEVEL=debug
JWT_SECRET=REPLACE_ME

DATA_DIR=./data
DB_NAME=megaapp
DB_ENV=test
DB_VERSION=005
MIGRATIONS_DIR=./migrations
PUBLIC_DIR=./public
BACKUPS_DIR=./backups

HTTP_READ_TIMEOUT_SECONDS=15
HTTP_WRITE_TIMEOUT_SECONDS=30
HTTP_IDLE_TIMEOUT_SECONDS=60
SHUTDOWN_TIMEOUT_SECONDS=10
MAX_REQUEST_BODY_BYTES=1048576
MAX_MULTIPART_BODY_BYTES=8388608
WS_READ_LIMIT_BYTES=65536
WS_WRITE_TIMEOUT_SECONDS=5

COEFFICIENTS_JOB_ENABLED=false
COEFFICIENTS_JOB_SCHEDULE=0 1 * * *
COEFFICIENTS_START_WITH_ZEROS=false
COEFFICIENTS_DIFFERENT_TRIES_PER_ROUND=100
COEFFICIENTS_CHILDREN_AMT=10
COEFFICIENTS_BEST_AMT=10
COEFFICIENTS_DAYS_7=7
COEFFICIENTS_DAYS_60=60
COEFFICIENTS_MAX_TRIES_IF_UNCHANGED=20

BACKUP_JOB_ENABLED=false
BACKUP_JOB_SCHEDULE=0 2 * * *
BACKUP_OPERATION_TIMEOUT_SECONDS=300
BACKUP_STORAGE_ENABLED=true
BACKUP_STORAGE_REGION=REPLACE_ME
BACKUP_STORAGE_BUCKET=REPLACE_ME
BACKUP_STORAGE_ENDPOINT=REPLACE_ME
BACKUP_STORAGE_FORCE_PATH_STYLE=false
BACKUP_STORAGE_STORAGE_CLASS=
BACKUP_STORAGE_ACCESS_KEY_ID=REPLACE_ME
BACKUP_STORAGE_SECRET_ACCESS_KEY=REPLACE_ME

QUOTES_JOB_ENABLED=false
QUOTES_JOB_SCHEDULE=0 3 * * *
QUOTES_FETCH_DAYS=7
QUOTES_RETRY_ATTEMPTS=3
QUOTES_RETRY_DELAY_SECONDS=30
QUOTES_REQUEST_TIMEOUT_SECONDS=20

OPENROUTER_API_KEY=REPLACE_ME
OPENROUTER_MODEL=google/gemini-2.5-pro
OPENROUTER_VISION_MODEL=google/gemini-2.5-flash
OPENROUTER_IMAGE_MODEL=google/gemini-2.5-flash-image
OPENROUTER_TIMEOUT_SECONDS=60
OPENAI_API_KEY=REPLACE_ME
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_EMBEDDING_DIMENSIONS=768
OPENAI_TIMEOUT_SECONDS=60
```

`APP_BUILD_VERSION` / `APP_BUILD_COMMIT` / `APP_BUILD_TIME` are not env vars — build/commit info comes from `build-info.json`, generated and uploaded by CI alongside the binary.

### 2.2.8 Preserve the old test systemd unit and create the new Go unit

```bash
test ! -e /etc/systemd/system/megatest-old.service
cp /etc/systemd/system/megatest.service /etc/systemd/system/megatest-old.service
vim /etc/systemd/system/megatest.service
```

Suggested `megatest.service` content:

```ini
[Unit]
Description=MegaApp Go Test Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/megatest
ExecStart=/root/megatest/megaapp-server
Restart=always
RestartSec=3
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
```

### 2.2.9 Reload systemd without starting the service yet

```bash
systemctl daemon-reload
systemctl status megatest --no-pager
```

### 2.2.10 Trigger the updated GitHub Actions test deploy

Run the updated backend deploy workflow for test after all server-side preparation above is complete.

### 2.2.11 Inspect the Go test service after the workflow restart

```bash
systemctl status megatest --no-pager
journalctl -u megatest -n 100 --no-pager
ls -lah /root/megatest
ls -lah /root/megatest/migrations
ls -lah /root/megatest/megaapp-server
```

### 2.2.12 Test backend smoke commands from the server

```bash
curl -fsS http://127.0.0.1:3001/health
curl -fsS http://127.0.0.1:3001/readiness
curl -fsS http://127.0.0.1:3001/build-info
curl -fsS http://127.0.0.1:3001/api/debug/commit-info
```

### 2.2.13 Manual browser smoke after the test cutover

Use these URLs manually:
- `https://test.vslav.dev/settings`
- `https://test.vslav.dev/food/diary`
- `https://test.vslav.dev/food/stats`
- `https://test.vslav.dev/money`
- `https://test.vslav.dev/api/debug/run-quotes-job`
- `https://test.vslav.dev/api/debug/run-backup-job`

Run the standard smoke set:
- login
- settings save and reload
- food diary add, edit, delete, delete-day, restore, body-weight save
- food stats load
- money setup, assets, transactions, invest flows, charts
- cross-tab WebSocket sync
- manual quotes trigger
- manual backup trigger

## 2.3 Test rollback procedure

Use this only if the Go test cutover must be reverted.

### 2.3.1 Stop the Go test backend

```bash
systemctl stop megatest
systemctl status megatest --no-pager
```

### 2.3.2 Preserve the failed Go test runtime folder

```bash
test ! -e /root/megatest-go-old
mv /root/megatest /root/megatest-go-old
ls -ld /root/megatest-go-old
```

### 2.3.3 Restore the old Node.js test runtime folder

```bash
mv /root/megatest-old /root/megatest
ls -ld /root/megatest
```

### 2.3.4 Preserve the failed Go test unit and restore the old Node.js unit content

```bash
test ! -e /etc/systemd/system/megatest-go-old.service
cp /etc/systemd/system/megatest.service /etc/systemd/system/megatest-go-old.service
cp /etc/systemd/system/megatest-old.service /etc/systemd/system/megatest.service
systemctl daemon-reload
systemctl start megatest
systemctl status megatest --no-pager
journalctl -u megatest -n 100 --no-pager
```

### 2.3.5 Test rollback smoke

```bash
curl -fsS http://127.0.0.1:3001/health
curl -fsS http://127.0.0.1:3001/api/debug/commit-info
```

Then rerun the main browser smoke on `https://test.vslav.dev`.

## 2.4 Test post-stabilization steps

Run these only after the Go test backend has been stable long enough and rollback is no longer needed.

### 2.4.1 Re-enable scheduled jobs

```bash
vim /root/megatest/.env.test
```

Set `BACKUP_JOB_ENABLED=true` and `QUOTES_JOB_ENABLED=true`, then:

```bash
systemctl restart megatest
journalctl -u megatest -f
```

Trigger both jobs manually (`/api/debug/run-backup-job`, `/api/debug/run-quotes-job`) or wait for the next scheduled window, and confirm a `job completed` line appears for each — not just `app_starting`/`http_request`. A silently skipped job produces no log at all, so absence of `job failed` is not enough on its own.

### 2.4.2 Inspect old test assets before deletion

```bash
ls -ld /root/megatest-old
ls -ld /etc/systemd/system/megatest-old.service
du -sh /root/megatest-old
find /root/megatest-old -maxdepth 2 | head -n 50
```

### 2.4.3 Delete old test assets

```bash
rm -f /etc/systemd/system/megatest-old.service
rm -rf /root/megatest-old
systemctl daemon-reload
```

If rollback generated a failed Go snapshot folder and it is no longer needed:

```bash
ls -ld /root/megatest-go-old
find /root/megatest-go-old -maxdepth 2 | head -n 50
rm -rf /root/megatest-go-old
```

### 2.4.4 Minimum files that need manual editing during test cutover

```bash
vim /root/megatest/.env.test
vim /etc/systemd/system/megatest.service
vim /root/megatest-old/env.js
```

---

# 3. PROD BLOCK — `app.vslav.dev` / `/root/megaback`

Run prod only after the test cutover is stable.

## 3.1 Target prod runtime model

```text
/root/megaback/
  megaapp-server
  build-info.json
  .env.prod
  migrations/
  data/
    megaapp-prod-005.db
    megaapp-prod-005.db-wal
    megaapp-prod-005.db-shm
  public/
    images/
  backups/
```

Persistent data that must survive the prod cutover:
- SQLite database files
- `public/images`
- `.env.prod`

Persistent data intentionally not copied:
- old local backup archives from `/root/megaback-old/backups`

## 3.2 Prod cutover procedure

### 3.2.1 Pre-flight inspection on the server

```bash
systemctl status megaback --no-pager
systemctl cat megaback
ls -ld /root/megaback
ls -ld /etc/systemd/system/megaback.service
ls -lah /root/megaback | head -n 30
ls -lah /root/megaback/public | head -n 30
```

### 3.2.2 Stop the current Node.js prod backend

```bash
systemctl stop megaback
systemctl status megaback --no-pager
```

### 3.2.3 Preserve the current prod runtime folder

```bash
test ! -e /root/megaback-old
mv /root/megaback /root/megaback-old
ls -ld /root/megaback-old
```

### 3.2.4 Create the new Go prod runtime folder and CI landing structure

```bash
install -d -m 755 /root/megaback
install -d -m 755 /root/megaback/data
install -d -m 755 /root/megaback/public
install -d -m 755 /root/megaback/backups
install -d -m 755 /root/megaback/migrations
ls -ld /root/megaback /root/megaback/data /root/megaback/public /root/megaback/backups /root/megaback/migrations
```

### 3.2.5 Copy the prod SQLite database files

```bash
for suffix in "" "-wal" "-shm"; do if [ -f "/root/megaback-old/megaapp-prod-005.db${suffix}" ]; then cp -av "/root/megaback-old/megaapp-prod-005.db${suffix}" /root/megaback/data/; fi; done
ls -lah /root/megaback/data
```

### 3.2.6 Copy the prod public images

```bash
cp -a /root/megaback-old/public/images /root/megaback/public/
find /root/megaback/public -maxdepth 3 | head -n 50
```

### 3.2.7 Create the new prod `.env.prod`

Open the old secret source and the new target file:

```bash
vim /root/megaback-old/env.js
vim /root/megaback/.env.prod
```

`.env.prod` must mirror [`.env.prod.example`](../.env.prod.example) structurally — same keys, same order, same relative paths. Only secrets and storage identifiers differ from the example placeholders:

```env
APP_ENV=prod
APP_HOST=127.0.0.1
APP_PORT=3000
LOG_LEVEL=info
JWT_SECRET=REPLACE_ME

DATA_DIR=./data
DB_NAME=megaapp
DB_ENV=prod
DB_VERSION=005
MIGRATIONS_DIR=./migrations
PUBLIC_DIR=./public
BACKUPS_DIR=./backups

HTTP_READ_TIMEOUT_SECONDS=15
HTTP_WRITE_TIMEOUT_SECONDS=30
HTTP_IDLE_TIMEOUT_SECONDS=60
SHUTDOWN_TIMEOUT_SECONDS=10
MAX_REQUEST_BODY_BYTES=1048576
MAX_MULTIPART_BODY_BYTES=8388608
WS_READ_LIMIT_BYTES=65536
WS_WRITE_TIMEOUT_SECONDS=5

COEFFICIENTS_JOB_ENABLED=false
COEFFICIENTS_JOB_SCHEDULE=0 1 * * *
COEFFICIENTS_START_WITH_ZEROS=false
COEFFICIENTS_DIFFERENT_TRIES_PER_ROUND=100
COEFFICIENTS_CHILDREN_AMT=10
COEFFICIENTS_BEST_AMT=10
COEFFICIENTS_DAYS_7=7
COEFFICIENTS_DAYS_60=60
COEFFICIENTS_MAX_TRIES_IF_UNCHANGED=20

BACKUP_JOB_ENABLED=false
BACKUP_JOB_SCHEDULE=0 2 * * *
BACKUP_OPERATION_TIMEOUT_SECONDS=300
BACKUP_STORAGE_ENABLED=true
BACKUP_STORAGE_REGION=REPLACE_ME
BACKUP_STORAGE_BUCKET=REPLACE_ME
BACKUP_STORAGE_ENDPOINT=REPLACE_ME
BACKUP_STORAGE_FORCE_PATH_STYLE=false
BACKUP_STORAGE_STORAGE_CLASS=
BACKUP_STORAGE_ACCESS_KEY_ID=REPLACE_ME
BACKUP_STORAGE_SECRET_ACCESS_KEY=REPLACE_ME

QUOTES_JOB_ENABLED=false
QUOTES_JOB_SCHEDULE=0 3 * * *
QUOTES_FETCH_DAYS=7
QUOTES_RETRY_ATTEMPTS=3
QUOTES_RETRY_DELAY_SECONDS=30
QUOTES_REQUEST_TIMEOUT_SECONDS=20

OPENROUTER_API_KEY=REPLACE_ME
OPENROUTER_MODEL=google/gemini-2.5-pro
OPENROUTER_VISION_MODEL=google/gemini-2.5-flash
OPENROUTER_IMAGE_MODEL=google/gemini-2.5-flash-image
OPENROUTER_TIMEOUT_SECONDS=60
OPENAI_API_KEY=REPLACE_ME
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_EMBEDDING_DIMENSIONS=768
OPENAI_TIMEOUT_SECONDS=60
```

`APP_BUILD_VERSION` / `APP_BUILD_COMMIT` / `APP_BUILD_TIME` are not env vars — build/commit info comes from `build-info.json`, generated and uploaded by CI alongside the binary.

### 3.2.8 Preserve the old prod systemd unit and create the new Go unit

```bash
test ! -e /etc/systemd/system/megaback-old.service
cp /etc/systemd/system/megaback.service /etc/systemd/system/megaback-old.service
vim /etc/systemd/system/megaback.service
```

Suggested `megaback.service` content:

```ini
[Unit]
Description=MegaApp Go Prod Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/megaback
ExecStart=/root/megaback/megaapp-server
Restart=always
RestartSec=3
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
```

### 3.2.9 Reload systemd without starting the service yet

```bash
systemctl daemon-reload
systemctl status megaback --no-pager
```

### 3.2.10 Trigger the updated GitHub Actions prod deploy

Run the updated backend deploy workflow for prod after all server-side preparation above is complete.

### 3.2.11 Inspect the Go prod service after the workflow restart

```bash
systemctl status megaback --no-pager
journalctl -u megaback -n 100 --no-pager
ls -lah /root/megaback
ls -lah /root/megaback/migrations
ls -lah /root/megaback/megaapp-server
```

### 3.2.12 Prod backend smoke commands from the server

```bash
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:3000/readiness
curl -fsS http://127.0.0.1:3000/build-info
curl -fsS http://127.0.0.1:3000/api/debug/commit-info
```

### 3.2.13 Manual browser smoke after the prod cutover

Use these URLs manually:
- `https://app.vslav.dev/settings`
- `https://app.vslav.dev/food/diary`
- `https://app.vslav.dev/food/stats`
- `https://app.vslav.dev/money`
- `https://app.vslav.dev/api/debug/run-quotes-job`
- `https://app.vslav.dev/api/debug/run-backup-job`

Run the standard smoke set:
- login
- settings save and reload
- food diary add, edit, delete, delete-day, restore, body-weight save
- food stats load
- money setup, assets, transactions, invest flows, charts
- cross-tab WebSocket sync
- manual quotes trigger
- manual backup trigger

## 3.3 Prod rollback procedure

Use this only if the Go prod cutover must be reverted.

### 3.3.1 Stop the Go prod backend

```bash
systemctl stop megaback
systemctl status megaback --no-pager
```

### 3.3.2 Preserve the failed Go prod runtime folder

```bash
test ! -e /root/megaback-go-old
mv /root/megaback /root/megaback-go-old
ls -ld /root/megaback-go-old
```

### 3.3.3 Restore the old Node.js prod runtime folder

```bash
mv /root/megaback-old /root/megaback
ls -ld /root/megaback
```

### 3.3.4 Preserve the failed Go prod unit and restore the old Node.js unit content

```bash
test ! -e /etc/systemd/system/megaback-go-old.service
cp /etc/systemd/system/megaback.service /etc/systemd/system/megaback-go-old.service
cp /etc/systemd/system/megaback-old.service /etc/systemd/system/megaback.service
systemctl daemon-reload
systemctl start megaback
systemctl status megaback --no-pager
journalctl -u megaback -n 100 --no-pager
```

### 3.3.5 Prod rollback smoke

```bash
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:3000/api/debug/commit-info
```

Then rerun the main browser smoke on `https://app.vslav.dev`.

## 3.4 Prod post-stabilization steps

Run these only after the Go prod backend has been stable long enough and rollback is no longer needed.

### 3.4.1 Re-enable scheduled jobs

```bash
vim /root/megaback/.env.prod
```

Set `BACKUP_JOB_ENABLED=true` and `QUOTES_JOB_ENABLED=true`, then:

```bash
systemctl restart megaback
journalctl -u megaback -f
```

Trigger both jobs manually (`/api/debug/run-backup-job`, `/api/debug/run-quotes-job`) or wait for the next scheduled window, and confirm a `job completed` line appears for each, plus a fresh archive in the Backblaze B2 bucket. A silently skipped job produces no log at all, so absence of `job failed` is not enough on its own.

### 3.4.2 Inspect old prod assets before deletion

```bash
ls -ld /root/megaback-old
ls -ld /etc/systemd/system/megaback-old.service
du -sh /root/megaback-old
find /root/megaback-old -maxdepth 2 | head -n 50
```

### 3.4.3 Delete old prod assets

```bash
rm -f /etc/systemd/system/megaback-old.service
rm -rf /root/megaback-old
systemctl daemon-reload
```

If rollback generated a failed Go snapshot folder and it is no longer needed:

```bash
ls -ld /root/megaback-go-old
find /root/megaback-go-old -maxdepth 2 | head -n 50
rm -rf /root/megaback-go-old
```

### 3.4.4 Minimum files that need manual editing during prod cutover

```bash
vim /root/megaback/.env.prod
vim /etc/systemd/system/megaback.service
vim /root/megaback-old/env.js
```

---

## 4. Steady-state deploy model after the primary cutover

After the first manual cutover succeeds, the intended steady-state deploy model is:
- CI builds `megaapp-server`
- CI packages `megaapp-server`, `migrations/`, and `build-info.json`
- CI uploads the artifact to the server
- CI replaces only runtime release files in `/root/megatest` or `/root/megaback`
- CI does not run `git fetch`, `git reset`, `npm ci`, or `nvm use` inside the runtime folder
- CI never touches `.env.test` / `.env.prod` — those stay hand-maintained
- CI restarts the target systemd service

The runtime folder stays a plain runtime directory and not a git checkout.

---

## 5. Final execution order

Recommended order:
1. Prepare the release artifact.
2. Execute the full test block.
3. Complete test smoke and observation.
4. Execute the full prod block only after test is stable.
5. Keep `*-old` assets during the observation window.
6. Once the observation window ends: re-enable `BACKUP_JOB_ENABLED`/`QUOTES_JOB_ENABLED` and verify a `job completed` log line for each, **before** removing `*-old` assets.
7. Remove `*-old` assets only after rollback is no longer needed.
