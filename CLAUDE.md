# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

mTodo is a TODO app: an Express + SQLite API (`server/`) and a React + Vite SPA (`client/`), each a separate npm package with its own `package.json`/lockfile. The root `package.json` only holds orchestration scripts (its own `dependencies` are not used by either app — install deps in `server/` or `client/`). The full product/API spec is `docs/specification.md` — keep it in sync when behavior changes.

## Commands

Requires Node.js 24+ (the server uses the built-in `node:sqlite` module). Copy `.env.example` to `.env` at the repo root first; the server loads `../../.env` relative to `server/src` and also a local `.env`.

```bash
npm run install:all     # npm install in server/ and client/
npm run dev:server      # API on :4000 (ts-node-dev --respawn --transpile-only)
npm run dev:client      # Vite on :5173 (VITE_API_URL defaults to http://localhost:4000/api)
npm run build           # server: tsc → server/dist; client: tsc -b && vite build
npm run docker:up       # full stack via docker/docker-compose.yml (server, client/nginx, backup sidecar, optional ngrok)
npm run db:backup | db:backups | db:restore   # backup sidecar scripts (docker/backup/)
```

There is no test suite and no linter configured. Type-check with `npm --prefix server run build` and `npm --prefix client run build` (dev server uses `--transpile-only`, so type errors won't surface there).

## Server architecture (`server/src`)

- `index.ts` — boot sequence: `initDb()`, production safety guards (exits if `NODE_ENV=production` with a weak `JWT_SECRET` or default `ADMIN_PASSWORD`), helmet, CORS (empty `ALLOWED_ORIGINS` = reflect any origin), global + stricter auth rate limiters, route mounting under `/api/*`, then `startTelegramBot()`. The error handler maps `ServiceError` (`errors.ts`) to its HTTP status.
- `services/` — **list, task, settings and API-token logic lives here, not in routes.** Functions take an `Actor` (`{ userId, source }`, built by `actorOf(req)` in `auth.ts`), enforce permissions, throw `ServiceError` for 4xx, and publish realtime events. Both `routes/*.ts` (thin wrappers) and the MCP tools call them, so any new mutation should be added here to get permissions + realtime for free.
- `events.ts` — in-process pub/sub keyed by user id. Mutations call `publish(audience, { type, source })` with `type` ∈ `tasks|lists|tags|settings`; use `taskAudience` / `listAudience` (compute the audience **before** deleting rows). `routes/events.ts` streams these as SSE at `GET /api/events`. Events carry no data — clients refetch. Code that writes to the DB outside `services/` (Telegram service, tags/admin routes) must publish itself.
- `mcp/server.ts` + `routes/mcp.ts` — MCP server (stateless Streamable HTTP, JSON responses) at `POST /api/mcp`, one `McpServer` per request bound to the token's user. Auth is personal access tokens only (`mtd_…`, SHA-256 hashed in `api_tokens`, see `services/apiTokens.ts`); JWTs are rejected there and tokens are rejected everywhere else.
- `config.ts` — single source for all env-derived settings. Also defines `TELEGRAM_SYNTHETIC_EMAIL_DOMAIN` (`telegram.local`), which normal signup must reject.
- `db.ts` — `node:sqlite` `DatabaseSync` (WAL, foreign keys on). Use the `prepare()` wrapper and cast rows to types in `types.ts`. Schema is `CREATE TABLE IF NOT EXISTS` in `initDb()`; **new columns must be added as idempotent migrations in `runMigrations()`** (`columnExists` + `ALTER TABLE`) so existing databases upgrade. The admin user from `.env` is seeded/re-promoted on every boot.
- `access.ts` — list permission model: `owner` / `editor` / `viewer` via `lists.user_id` and `list_shares.can_edit`. Route handlers and the Telegram service must go through `getListAccess` / `canEditList` / `accessibleListIds` rather than checking `user_id` directly — tasks in shared lists are visible to members.
- `validate.ts` — Zod schemas plus `validateBody` / `validateParams` middleware; validated data replaces `req.body`. All write endpoints validate here.
- `auth.ts` — JWT (`Bearer` header, 7d expiry), `authRequired`, `adminRequired`.
- `routes/tasks.ts` — task CRUD, tag resolution (tags are per-user and auto-created by name), and recurrence logic (`occursOnDate`) used for the `?today=true` view. `repeat_days` is stored as a JSON string.
- `telegram/` — Telegraf bot (long polling), disabled unless both `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` are set. `service.ts` holds DB logic (account linking via one-time codes, Telegram Login Widget accounts, list/task ops reusing `access.ts`); `bot.ts` is the command/keyboard UI; `verify.ts` checks login widget signatures.

## Client architecture (`client/src`)

- `api.ts` — all HTTP calls go through `request()`; JWT stored in `localStorage` (`mtodo_token`). Errors surface the server's `{ error }` message. Every request sends `X-Client-Id` (per-tab `CLIENT_ID`) so the tab can ignore realtime echoes of its own changes. `streamEvents()` reads the SSE stream via `fetch` (not `EventSource`) to keep the JWT in a header.
- `context/RealtimeContext.tsx` — single SSE connection with backoff + watchdog; `useRealtimeEvents(handler)` subscribes. On reconnect it emits every event type so views resync. `settings` events refresh the user in AuthContext; `DashboardPage` coalesces task/list/tag events into refetches.
- User preferences (currently `show_completed`) live server-side on `user.settings` (JSON column, defaults in `server/src/services/settings.ts`, schema `updateSettingsSchema`). Adding a preference means touching both of those plus `UserSettings` in both `types.ts` files.
- `context/` — Auth, Realtime, Theme, Toast, and Confirm (themed confirmation dialogs) providers.
- `pages/DashboardPage.tsx` — the main app (lists sidebar, task views, keyboard shortcuts, optimistic toggles with rollback). `utils.ts` has date helpers and `parseQuickAdd` (natural-language quick add: `#tags`, relative dates).
- `lib/listsTransfer.ts` — pure (no network) import/export of lists as a versioned JSON envelope; orchestration lives in `SettingsPage.tsx`, which recreates lists/tasks through the normal API.
- `i18n.ts` + `locales/{en,ru,uk,sr}.json` — every user-facing string must be added to **all four** locale files.
- PWA via `vite-plugin-pwa` in `vite.config.ts` (icons generated from `public/logo.svg`; service worker is enabled in dev too, and caches `/api/` GETs network-first except `/api/events` and `/api/mcp` — keep that in mind when debugging stale data, and exclude any new streaming endpoint there).

## Other

- `docker/` — Dockerfiles, compose, nginx config (has a dedicated unbuffered `location = /api/events` for SSE), and POSIX-sh backup/restore/scheduler scripts. The SQLite DB is bind-mounted from a host folder (`DATA_HOST_DIR`, default `./data`).
- `docs/` — `specification.md` plus the static GitHub Pages landing page (`index.html`), unrelated to the app build.
- The realtime bus is in-memory: the design assumes a single API server process.
- When adding env vars, update `config.ts`, `.env.example`, and the README env table.
