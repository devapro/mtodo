# mTodo — Specification

Version 1.1 · Status: implemented · Last updated 2026-11-09

This document specifies the behavior of mTodo: its domain model, permissions,
HTTP API, realtime protocol, MCP interface for AI agents, and operational
requirements. It describes the system as implemented; the README covers
installation and deployment how-tos.

---

## 1. Overview

mTodo is a self-hostable, multi-user TODO application.

| Component | Technology | Location |
| --- | --- | --- |
| API server | Node.js 24+, Express 4, SQLite (`node:sqlite`), TypeScript | `server/` |
| Web client | React 18, Vite, React-Bootstrap, i18next, PWA (Workbox) | `client/` |
| Telegram bot | Telegraf (long polling), runs inside the API process | `server/src/telegram/` |
| MCP server | `@modelcontextprotocol/sdk`, Streamable HTTP, runs inside the API process | `server/src/mcp/` |
| Deployment | Docker Compose: server, nginx-served client, backup sidecar, optional ngrok | `docker/` |

Clients of the system:

1. **Web app** (primary UI), authenticated with a JWT.
2. **Telegram bot**, bound to an account through a one-time link code.
3. **AI agents** over MCP, authenticated with a personal access token.

All three change data through the same server-side rules. Every change is pushed live to the
web app (§6).

---

## 2. Actors and roles

| Actor | Description |
| --- | --- |
| Anonymous visitor | Can sign up, sign in, and sign in with Telegram. |
| User | Manages their own lists, tasks, tags, settings and access tokens; can use shared lists. |
| Admin | A user with `role = admin`. Can also manage users. The account named by `ADMIN_EMAIL` is seeded at every start and always keeps admin rights. |

### 2.1 List roles

A user's role for a list is derived per request:

| Role | Condition |
| --- | --- |
| `owner` | `lists.user_id` is the user. |
| `editor` | A `list_shares` row exists with `can_edit = 1`. |
| `viewer` | A `list_shares` row exists with `can_edit = 0`. |
| none | Otherwise. The list is reported as *not found* (404), never *forbidden*. |

### 2.2 Permission matrix

| Operation | owner | editor | viewer | task creator, no list access |
| --- | :-: | :-: | :-: | :-: |
| See list and its tasks | ✅ | ✅ | ✅ | — |
| Create task in list | ✅ | ✅ | ❌ 403 | — |
| Edit / toggle / delete a task in the list | ✅ | ✅ | ❌ 403 | ✅ (own task) |
| Move a task into a list | ✅ | ✅ | ❌ 403 | — |
| Rename / recolor / delete list | ✅ | ❌ 403 | ❌ 403 | — |
| View or manage shares | ✅ | ❌ 403 | ❌ 403 | — |
| Leave the list (remove own share) | — | ✅ | ✅ | — |

A user can always see and modify tasks they created, even when the task sits in a list they
can no longer access.

---

## 3. Domain model

SQLite runs in WAL mode with foreign keys enforced. The schema is created at startup
(`CREATE TABLE IF NOT EXISTS`). New columns are added by idempotent migrations in
`server/src/db.ts`.

### 3.1 Entities

**User** (`users`)

| Field | Type | Notes |
| --- | --- | --- |
| id | int PK | |
| email | text, unique | Lower-cased. The domain `@telegram.local` is reserved for accounts created by Telegram login. |
| password_hash | text | bcrypt, 10 rounds |
| role | `user` \| `admin` | |
| created_at | datetime (UTC) | |
| telegram_id, telegram_username, telegram_first_name | text, nullable | `telegram_id` is unique when set. |
| telegram_link_code, telegram_link_expires | text, nullable | One-time link code, valid for 15 minutes. |
| settings | JSON text, nullable | See §3.2. |

**List** (`lists`): `id`, `user_id` (owner), `name` (1–120 chars), `color` (nullable),
`emoji` (nullable, at most 16 code points), `created_at`. Deleting a list deletes its shares.
Its tasks are kept with `list_id = NULL`.

**List share** (`list_shares`): primary key (`list_id`, `user_id`), `can_edit` 0/1,
`created_at`.

**Task** (`tasks`)

| Field | Type | Notes |
| --- | --- | --- |
| id | int PK | |
| user_id | int | Creator |
| list_id | int, nullable | Set to NULL when the list is deleted |
| title | text | 1–500 chars |
| description | text, nullable | Markdown, up to 20,000 chars. Rendered sanitized (`rehype-sanitize`). |
| due_date | `YYYY-MM-DD`, nullable | |
| repeat_type | `none` \| `daily` \| `weekly` \| `monthly` \| `custom` | |
| repeat_interval | int 1–1000, nullable | `custom` only |
| repeat_unit | `day` \| `week` \| `month`, nullable | `custom` only |
| repeat_days | JSON int array, nullable | `weekly`: weekdays 0 = Sun … 6 = Sat. `monthly`: days of month 1–31. |
| completed | 0/1 | |
| created_at, updated_at | datetime (UTC) | |

**Tag** (`tags`): per user, unique by (`user_id`, `name`). Names are 1–50 chars and matched
case-insensitively. Assigning an unknown tag name to a task creates the tag on the acting
user's account. Linked to tasks through `task_tags`. A task has at most 50 tags.

**API token** (`api_tokens`): `id`, `user_id`, `name` (1–80 chars), `token_hash` (SHA-256,
unique), `token_prefix` (first 10 chars, for display), `created_at`, `last_used_at`. At most 20
per user.

### 3.2 User settings

Settings are stored as a JSON object on the user record. Unknown keys are dropped and missing
keys take their defaults.

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `show_completed` | boolean | `true` | Whether task views show completed tasks. |

Settings are returned on every user object (`user.settings`). Changes are pushed to the user's
other sessions (§6), so a preference changed on one device applies everywhere.

### 3.3 Recurrence: does a task occur on date D?

- `none`: `due_date == D`.
- Otherwise the recurrence starts at `due_date`, or at the creation date if there is none. The
  task never occurs before that start.
- `daily`: every day.
- `weekly`: on the weekdays in `repeat_days`. If there are none, on the start's weekday.
- `monthly`: on the days of month in `repeat_days`. If there are none, on the start's day of
  month.
- `custom`: every `repeat_interval` (default 1) days, weeks or months from the start. Monthly
  repeats also require the same day of month as the start.

The **Today** view lists the tasks that occur on the client's local date.

---

## 4. Functional requirements

### 4.1 Authentication

- **FR-A1** Sign up with email and password (password 6–200 chars). The email is
  lower-cased; addresses at `@telegram.local` are rejected.
- **FR-A2** Sign in returns a JWT (HS256, valid 7 days) and the public user object. Failed
  sign-ins return the same message whether the email or the password was wrong.
- **FR-A3** Sign in with the Telegram Login Widget. The payload signature is verified against
  the bot token. Telegram users without an account get one automatically.
- **FR-A4** `GET /auth/me` returns the current user, including `settings`.

### 4.2 Lists and sharing

- **FR-L1** Create, rename, recolor, set an emoji on, and delete lists (owner only).
- **FR-L2** Share a list with an existing user by email, as read-only or can-edit. Sharing an
  already-shared list updates the permission.
- **FR-L3** The owner can revoke any member. A member can leave.
- **FR-L4** The sidebar marks list state with an icon: 📁 private, 🔗 owned and shared,
  👥 shared with me. Read-only lists show a badge.

### 4.3 Tasks

- **FR-T1** Create, edit, complete or reopen, and delete tasks, subject to §2.2. Completion
  toggles are optimistic in the UI and roll back on error.
- **FR-T2** Fields: title, Markdown description, list, due date, recurrence, tags.
- **FR-T3** Views: **Today**, **All tasks**, a single list. Filter by search text and by tag.
  Sort by manual order, due date, title or completion. Overdue tasks are highlighted.
- **FR-T4** Natural-language quick add: `#tag` adds a tag. A date token sets the due date:
  `today`, `tomorrow`, a weekday name (`mon`, `friday`, meaning the next one), `in 3d` or
  `in 2w`, or an ISO date. Tokens are removed from the title.
- **FR-T5** Keyboard shortcuts: `N` new task, `/` focus search, `T` Today view, `A` All tasks.
- **FR-T6** **Show completed** switch. The choice is saved to the user's settings on the
  server (`show_completed`) and applied on all of the user's devices. It can be changed from
  the task toolbar or from **Settings → Preferences**.

### 4.4 Import / export

- **FR-X1** Export all accessible lists with their tasks as a versioned JSON file
  (`kind: "mtodo-lists"`, `version: 1`).
- **FR-X2** Import validates the file and recreates its lists and tasks as new lists owned by
  the importing user. It never merges into existing lists.

### 4.5 Realtime updates

- **FR-R1** When data changes on the server, every open web session that can see it updates
  without a page reload. This applies to changes from another tab or device, another user on
  a shared list, the Telegram bot, an AI agent over MCP, and admin actions.
- **FR-R2** A tab does not refetch after changes it made itself; it already shows them.
- **FR-R3** After a lost connection the client reconnects with exponential backoff (up to 30 s)
  and then refetches everything, so missed changes are recovered.
- **FR-R4** If the list currently shown is deleted, or access to it is revoked, the view
  switches to **All tasks**.
- **FR-R5** The navbar shows the connection state (*Live* / *Offline*).

### 4.6 AI agents (MCP)

- **FR-M1** Users create and revoke personal access tokens in **Settings → AI agents (MCP)**.
  The token is shown only once. The list shows each token's name, prefix and last use.
- **FR-M2** AI agents connect to `<API base>/mcp` and can list, create, update and delete
  lists and tasks, mark tasks done, and read tags (§7).
- **FR-M3** Agents act as the token's owner, with exactly the permissions of §2.2.
- **FR-M4** Changes made by agents appear live in the web app (FR-R1).

### 4.7 Telegram bot

- **FR-B1** Disabled unless both `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` are set.
- **FR-B2** Linking: Settings shows a one-time code (valid 15 minutes). The user sends
  `/start <code>` to the bot or follows the deep link. The account can be unlinked from
  Settings.
- **FR-B3** `/lists` shows accessible lists with open-task counts. From there the user can
  open a list, add a task (on editable lists), and complete or reopen tasks. `/help` and
  `/cancel` are also supported.

### 4.8 Administration

- **FR-AD1** Admins can list users (with task counts and whether Telegram is linked), create
  users, reset passwords, and delete users. Admins cannot delete themselves.

### 4.9 Settings page

Sections: Appearance (language, theme), Preferences (show completed, import/export),
Telegram (when enabled), AI agents (MCP), Account (sign out).

### 4.10 Localization and theming

- **FR-I1** UI languages: English, Russian, Ukrainian, Serbian (Cyrillic). The language is
  detected from localStorage, then the browser, with English as the fallback.
- **FR-I2** Light and dark themes. The theme choice is stored per browser.

### 4.11 PWA

- **FR-P1** The app can be installed. A service worker precaches the app shell. `GET /api/*`
  is cached network-first (5 s timeout, 24 h, 100 entries), except `/api/events` and
  `/api/mcp`, which always go to the network.

---

## 5. REST API

Base path: `/api`. Request and response bodies are JSON. Errors have the form
`{ "error": "<message>" }`. Request bodies and ids are validated with Zod; invalid input
returns 400.

Authenticated endpoints need `Authorization: Bearer <JWT>`. Clients may send
`X-Client-Id: <opaque id>`. The server echoes it in realtime events (§6).

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/health` | — | Liveness |
| POST | `/auth/signup` | — | `{email, password}` → `{token, user}` |
| POST | `/auth/signin` | — | `{email, password}` → `{token, user}` |
| GET | `/auth/me` | JWT | `{user}` |
| GET | `/auth/settings` | JWT | `{settings}` |
| PUT | `/auth/settings` | JWT | Partial `{show_completed?}` → `{settings}`. Unknown keys return 400. |
| GET | `/auth/tokens` | JWT | List access tokens (never includes the secret) |
| POST | `/auth/tokens` | JWT | `{name}` → `{token, info}`. **The only time the raw token is returned.** |
| DELETE | `/auth/tokens/:id` | JWT | Revoke a token (204) |
| GET | `/auth/telegram/config` | — | `{enabled, botUsername}` |
| POST | `/auth/telegram` | — | Telegram Login Widget payload → `{token, user}` |
| POST | `/auth/telegram/link-code` | JWT | `{code, botUsername}` |
| POST | `/auth/telegram/unlink` | JWT | `{user}` |
| GET | `/lists` | JWT | Owned and shared lists, each with `role`, `can_edit`, `owner_email`, `shared_count` |
| POST | `/lists` | JWT | `{name, color?, emoji?}` → 201 |
| PUT | `/lists/:id` | JWT | Partial update (owner) |
| DELETE | `/lists/:id` | JWT | Owner. 204 |
| GET | `/lists/:id/shares` | JWT | Owner. `[{user_id, email, can_edit}]` |
| POST | `/lists/:id/shares` | JWT | Owner. `{email, can_edit}`, upsert → 201 with the shares |
| DELETE | `/lists/:id/shares/:userId` | JWT | Owner revokes, or a member leaves. 204 |
| GET | `/tags` | JWT | The user's tags |
| POST | `/tags` | JWT | `{name}`. Idempotent: returns the existing tag (200) or the new one (201). |
| DELETE | `/tags/:id` | JWT | 204 |
| GET | `/tasks` | JWT | Query: `listId`, `date=YYYY-MM-DD`, `today=true` (server UTC date) |
| GET | `/tasks/:id` | JWT | |
| POST | `/tasks` | JWT | Task fields (§3.1). `tags` is an array of names. → 201 |
| PUT | `/tasks/:id` | JWT | Partial update. `null` clears a field. `tags` replaces all tags. |
| PATCH | `/tasks/:id/toggle` | JWT | Flip `completed` |
| DELETE | `/tasks/:id` | JWT | 204 |
| GET | `/events` | JWT | Realtime stream (§6) |
| POST | `/mcp` | Access token | MCP endpoint (§7) |
| GET | `/admin/users` | Admin | |
| POST | `/admin/users` | Admin | `{email, password, role?}` |
| PATCH | `/admin/users/:id/password` | Admin | `{password}` → 204 |
| DELETE | `/admin/users/:id` | Admin | 204. Cannot delete yourself. |

Status codes: 400 validation, 401 missing or invalid credentials, 403 not permitted on a
visible resource, 404 not found or not visible, 409 conflict (duplicate email, Telegram
already linked), 429 rate limited, 503 Telegram not configured.

---

## 6. Realtime protocol

`GET /api/events` returns a **Server-Sent Events** stream for the authenticated user.

```
retry: 3000

event: ready
data: {}

event: change
data: {"type":"tasks","source":"6f1c…"}

: ping
```

- `ready` is sent once per connection. A client that is reconnecting should then refetch all
  resources.
- `change.type` is one of `tasks`, `lists`, `tags`, `settings`. Events carry no entity data:
  clients refetch the named resource, so every client ends up with server-side truth and
  correctly filtered data.
- `source` is the `X-Client-Id` of the request that caused the change. It is absent for
  changes from the Telegram bot, MCP and admin actions. A client ignores events whose
  `source` is its own id.
- The server sends a `: ping` comment every 25 s. The client treats 60 s of silence as a dead
  connection and reconnects.
- The web client reads the stream with `fetch()` rather than `EventSource`, so the JWT stays
  in the `Authorization` header and never appears in URLs or access logs.

**Who gets an event**: every user who can see the changed data. For a task, that is its
creator plus the owner and members of its list, both before and after a move. For a list, its
owner and members, computed before a delete. Sharing changes also notify the affected member.
Tag and settings changes notify only their owner.

**Limits**: the event bus is in-process, so the design assumes a single API server instance.
Scaling out would need a shared broker such as Redis pub/sub. Proxies must not buffer this
route; the provided nginx config sets `proxy_buffering off` and a 1 h read timeout.

---

## 7. MCP interface (AI agents)

- **Endpoint**: `POST {API base}/mcp`, for example `http://localhost:5173/api/mcp` in Docker
  or `http://localhost:4000/api/mcp` in development.
- **Transport**: MCP Streamable HTTP, stateless (no sessions), JSON responses. `GET` and
  `DELETE` return 405.
- **Auth**: `Authorization: Bearer mtd_…`, a personal access token (§3.1). Tokens are
  accepted **only** on `/api/mcp`, and JWTs are not accepted there. An invalid or revoked
  token returns 401 with `WWW-Authenticate`.
- **Behavior**: tools call the same service layer as the REST API, so validation,
  permissions (§2.2) and realtime notifications are identical.
- **Errors**: permission, not-found and validation failures come back as tool results with
  `isError: true` and a readable message.

### 7.1 Tools

| Tool | Arguments | Notes |
| --- | --- | --- |
| `list_lists` | — | Read-only. Lists with `role`, `can_edit`, `open_count`, `task_count`. |
| `create_list` | `name`, `color?`, `emoji?` | |
| `update_list` | `list_id`, `name?`, `color?`, `emoji?` | Owner only |
| `delete_list` | `list_id` | Owner only, destructive. Tasks are kept without a list. |
| `list_tasks` | `list_id?`, `date?`, `today?`, `include_completed?` (default true), `search?` | Read-only |
| `get_task` | `task_id` | Read-only |
| `create_task` | `title`, `description?`, `list_id?`, `due_date?`, `repeat_type?`, `repeat_interval?`, `repeat_unit?`, `repeat_days?`, `tags?`, `completed?` | |
| `update_task` | `task_id`, plus any field of `create_task` | Partial. `null` clears a field. |
| `set_task_completed` | `task_id`, `completed` (default true) | Idempotent |
| `delete_task` | `task_id` | Destructive |
| `list_tags` | — | Read-only |

### 7.2 Client configuration example

```json
{
  "mcpServers": {
    "mtodo": {
      "type": "http",
      "url": "https://todo.example.com/api/mcp",
      "headers": { "Authorization": "Bearer mtd_XXXXXXXX" }
    }
  }
}
```

Claude Code: `claude mcp add --transport http mtodo https://todo.example.com/api/mcp --header "Authorization: Bearer mtd_XXXXXXXX"`.

---

## 8. Non-functional requirements

### 8.1 Security

- Helmet headers. HSTS and CSP are off at the API, so the app works over plain-HTTP LAN
  setups; the static client host owns CSP.
- CORS: an empty `ALLOWED_ORIGINS` reflects any origin (zero-config LAN). In production, set
  it to an allow-list.
- Rate limits per IP: global (`RATE_LIMIT_MAX`, default 600 per 15 min) and sign-in/sign-up
  (`RATE_LIMIT_AUTH_MAX`, default 30, counting only failed attempts). Set `TRUST_PROXY=true`
  behind a proxy.
- With `NODE_ENV=production`, the server refuses to start if `JWT_SECRET` is a known
  placeholder or shorter than 32 chars, or if `ADMIN_PASSWORD` is the default.
- Access tokens: 256-bit random values, stored only as SHA-256 hashes, shown once, revocable,
  usable only on the MCP endpoint, and limited to 20 per user.
- Passwords are hashed with bcrypt. Markdown is rendered sanitized.
- Request bodies are limited to 1 MB.

### 8.2 Data and operations

- SQLite file at `DATABASE_FILE`. In Docker it is bind-mounted from `DATA_HOST_DIR`.
- A backup sidecar takes a consistent snapshot at startup and daily at `BACKUP_TIME` (UTC),
  checks integrity, gzips it to `BACKUP_HOST_DIR`, and prunes after `BACKUP_RETENTION_DAYS`.
  `npm run db:restore` restores, keeping a safety copy of the replaced database.
- Schema changes must be backward-compatible idempotent migrations; existing databases are
  upgraded at startup.

### 8.3 Compatibility

- Node.js 24+ (built-in `node:sqlite`). Recent Chromium, Firefox and Safari browsers. PWA
  install requires HTTPS or `localhost`.

---

## 9. Out of scope / known limitations

- Realtime and MCP assume a single API process (in-memory event bus).
- Realtime events notify; they do not carry diffs. Clients refetch the affected resource.
- No conflict resolution beyond last-write-wins.
- Access tokens have no scopes or expiry; they act with the full rights of their owner on
  lists and tasks (no admin operations are exposed over MCP).
- The **Today** view in the web app uses the client's local date. `today=true` on the REST
  API and MCP uses the server's UTC date.
