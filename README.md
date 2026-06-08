# mTodo

A simple, modern TODO Proof of Concept built with a TypeScript stack.

- **Server:** Express.js + SQLite (Node.js built-in `node:sqlite`) + TypeScript
- **Client:** React + TypeScript + Vite + Bootstrap (React‑Bootstrap), with a Markdown editor
- **Deploy:** docker‑compose

## Features

- 🔐 **Auth** – sign up / sign in with JWT.
- 🛡️ **Admin panel** – list & remove users. Admin credentials come from `.env`.
- ✅ **Tasks** – create, edit, complete, delete.
- 🗂️ **Lists** – organize tasks into TODO lists.
- 🤝 **Sharing** – share a list with another user by email, as **read-only** (only the owner/editors can change tasks) or **can edit**. Shared lists appear in the sidebar with a distinct icon (👥) and a read-only badge; owners get a 🔗 "shared" indicator. Manage members (change permission / remove) from the list's **⋯** menu, where owners can also delete and members can leave.
- 🏷️ **Tags** – autocomplete from existing tags or type a new one to create it on the fly.
- 🔁 **Repeats** – none / daily / weekly (pick weekdays) / monthly (pick days) / custom (every N days/weeks/months).
- 📅 **Dates** – assign a specific date to a task.
- ⭐ **Today view** – shows tasks due today plus recurring tasks that occur today.
- 📝 **Markdown** – task descriptions are written in a Markdown editor and rendered as HTML.
- 🌗 **Dark / light theme** – toggle in the navbar; preference is remembered.
- 🌍 **Localization (i18n)** – UI available in English, Russian, Ukrainian and Serbian, with automatic browser language detection.
- ✈️ **Telegram bot** – link your account from **Settings → Telegram**, then review your lists, browse tasks, add tasks and mark them complete straight from Telegram. You can also **Log in with Telegram** on the sign-in page, and admins see a ✈️ icon next to users who linked Telegram.
- 📱 **Responsive, modern UI** – themed confirmation dialogs, toast notifications, optimistic task toggles with rollback on error.
- ⌨️ **Keyboard shortcuts** – `N` new task, `/` focus search, `T` today view, `A` all tasks.
- 🗣️ **Natural-language quick add** – type `Buy milk #groceries tomorrow` to set title, tags and due date in one go.
- 📊 **Task sorting** – sort by due date, title, or completion status; overdue tasks are highlighted.
- 📲 **Installable PWA** – installable on desktop & mobile (Chrome/Edge/Safari), runs in a standalone window, works offline via a service worker, with an auto-updating cache.

## Project structure

```
mtodo/
├── server/              # Express + SQLite API (TypeScript)
│   └── src/telegram/    # Telegram bot integration (Telegraf)
├── client/              # React + Vite SPA (TypeScript)
├── docker/              # Docker configs (compose, Dockerfiles, nginx, ngrok)
├── .env.example
└── requirements.md
```

## Installation

mTodo ships with two installation variants: a **production** variant that runs
the whole stack in Docker, and a **development** variant that runs the API and
client locally with hot reload.

### Prerequisites

- **Production:** Docker + Docker Compose.
- **Development:** Node.js 24+ and npm (required for the built-in `node:sqlite` module).

In both cases, start by creating your environment file:

```bash
cp .env.example .env      # adjust secrets / admin credentials
```

### Production variant (Docker)

All Docker configs live in [`docker/`](./docker). The compose file builds from
the repository root, loads variables from the repo-root `.env`, and runs the
API and client with restart policies and a persistent SQLite volume
(`mtodo-data`, mounted at `/data` inside the server container).

```bash
npm run docker:up
# or, equivalently, from the repo root:
docker compose -f docker/docker-compose.yml up --build
```

- Client (static build served by nginx): http://localhost:5173
- API: http://localhost:4000/api
- Sign in as admin using `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`.

To run it in the background, add `-d`; stop it with `npm run docker:down`
(append `-v` to the compose `down` command to also drop the database volume).

#### Public tunnel (ngrok)

The stack includes an optional **ngrok** service that exposes the client to the
public internet. Set `NGROK_AUTHTOKEN` in `.env` (from the
[ngrok dashboard](https://dashboard.ngrok.com)) and bring the stack up — the
public URL is shown in the ngrok inspector at http://localhost:4040.

### Development variant (local, hot reload)

Install all dependencies (server + client) from the repo root:

```bash
npm run install:all
# (equivalent to running `npm install` in both ./server and ./client)
```

Then run the API and client in two terminals:

```bash
# 1) API – ts-node-dev with auto-respawn
npm run dev:server     # http://localhost:4000

# 2) Client – Vite dev server with HMR
npm run dev:client     # http://localhost:5173
```

The client reads the API base URL from `VITE_API_URL` (defaults to
`http://localhost:4000/api`).

#### Building for production without Docker

```bash
npm run build          # builds both server (tsc) and client (vite build)
# Serve the compiled API and the built client separately:
npm --prefix server start          # node dist/index.js
npm --prefix client run preview    # static preview on http://localhost:5173
```

## Progressive Web App (PWA)

The client is a PWA powered by [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/):

- A web app manifest (`manifest.webmanifest`) and icon set are generated from
  `client/public/logo.svg` at build time.
- A Workbox **service worker** precaches the app shell and uses a
  *network-first* strategy for `/api` GET requests, so previously loaded data
  is available offline. New versions auto-update (`registerType: 'autoUpdate'`).

**Install it:**

1. Build & serve over `http://localhost` or HTTPS (service workers require a
   secure context; `localhost` counts). The Docker setup serves it on
   `http://localhost:5173`.
2. In Chrome/Edge, click the **install icon** in the address bar (or
   *⋮ → Install mTodo*). On iOS Safari use *Share → Add to Home Screen*.

> During `vite dev`, the service worker is enabled (`devOptions.enabled`), so
> you can test install/offline behavior locally too.

## Environment variables

See [`.env.example`](./.env.example):

| Variable          | Description                                  |
| ----------------- | -------------------------------------------- |
| `PORT`            | API server port                              |
| `NODE_ENV`        | `development` or `production`                |
| `JWT_SECRET`      | Secret used to sign auth tokens (required in production; server refuses to start with the default) |
| `DATABASE_FILE`   | Path to the SQLite database file             |
| `ALLOWED_ORIGINS` | Comma-separated CORS allow-list. Empty = allow any origin (default; works on LAN HTTP) |
| `TRUST_PROXY`     | `true` when behind a reverse proxy (for correct rate-limit client IPs) |
| `RATE_LIMIT_WINDOW_MS` | Rate-limit window in ms (default 15 min) |
| `RATE_LIMIT_MAX`  | Max requests per IP per window (default 600) |
| `RATE_LIMIT_AUTH_MAX` | Max auth attempts per IP per window (default 30) |
| `ADMIN_EMAIL`     | Built-in admin account email                 |
| `ADMIN_PASSWORD`  | Built-in admin account password              |
| `TELEGRAM_BOT_TOKEN`    | BotFather token (empty = Telegram disabled) |
| `TELEGRAM_BOT_USERNAME` | Bot username without `@` (for deep links & login widget) |
| `VITE_API_URL`    | API base URL the client calls                |
| `NGROK_AUTHTOKEN` | ngrok auth token for the optional public tunnel (Docker) |

## Security

The API includes several production-hardening measures while remaining
zero-config for local / LAN development:

- **Helmet** security headers (HSTS disabled so plain HTTP on a LAN still works).
- **Configurable CORS** — leave `ALLOWED_ORIGINS` empty to reflect any origin
  (handy for `http://localhost` or `http://192.168.x.x`); set it in production
  to lock down to your client origin(s).
- **Rate limiting** — a generous global limit plus a stricter limit on
  sign-in/sign-up to blunt credential stuffing.
- **Input validation** — all write endpoints validate request bodies with Zod
  schemas (email format, password length, date format, repeat settings, etc.).
- **JWT secret guard** — the server refuses to start in `NODE_ENV=production`
  if `JWT_SECRET` is still the default dev value.

For a LAN-only deployment over HTTP, no extra configuration is needed. For a
public deployment, set at minimum:

```bash
NODE_ENV=production
JWT_SECRET=<long-random-string>
ALLOWED_ORIGINS=https://your-domain.example
TRUST_PROXY=true   # if behind nginx/traefik
```

## Telegram integration

The Telegram bot lives in [`server/src/telegram/`](./server/src/telegram) and is
built with [Telegraf](https://telegraf.js.org/). It stays completely disabled
until both `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` are set.

**Setup**

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy the token.
2. Put the token and the bot's username in `.env`:

   ```bash
   TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
   TELEGRAM_BOT_USERNAME=my_mtodo_bot
   ```

3. (For *Log in with Telegram*) tell BotFather the site domain via
   `/setdomain` (e.g. `localhost` for local dev or your real domain).
4. Restart the server — the bot starts in long-polling mode automatically.

**Linking an account** — open **Settings → Telegram** in the web app, click
*Link Telegram*, then either open the bot via the deep link or send the shown
`/start <code>` to the bot. Once linked, the user gets a ✈️ marker in the admin
panel.

**Bot features** — after linking, send `/lists` to:

- review the list of todo lists (with open-task counts),
- open a list to review its tasks,
- ➕ add a new task,
- ✔️ mark a task as completed (or reopen it).

**Log in with Telegram** — the sign-in page shows the official Telegram Login
Widget. Authenticating creates/links an account and returns a normal JWT, so it
behaves like any other session.

## API overview

| Method | Endpoint                | Description                |
| ------ | ----------------------- | -------------------------- |
| POST   | `/api/auth/signup`      | Create account             |
| POST   | `/api/auth/signin`      | Log in                     |
| GET    | `/api/auth/me`          | Current user               |
| GET    | `/api/auth/telegram/config`    | Whether Telegram is enabled + bot username |
| POST   | `/api/auth/telegram`           | Log in with Telegram Login Widget |
| POST   | `/api/auth/telegram/link-code` | Generate a one-time bot link code |
| POST   | `/api/auth/telegram/unlink`    | Disconnect the linked Telegram account |
| GET    | `/api/lists`            | List owned + shared lists  |
| POST   | `/api/lists`            | Create list                |
| GET    | `/api/lists/:id/shares` | List members (owner only)  |
| POST   | `/api/lists/:id/shares` | Share with a user by email |
| DELETE | `/api/lists/:id/shares/:userId` | Revoke / leave a share |
| GET    | `/api/tags`             | List tags                  |
| GET    | `/api/tasks?today=true` | Today's tasks              |
| POST   | `/api/tasks`            | Create task                |
| PUT    | `/api/tasks/:id`        | Update task                |
| PATCH  | `/api/tasks/:id/toggle` | Toggle completion          |
| DELETE | `/api/tasks/:id`        | Delete task                |
| GET    | `/api/admin/users`      | List users (admin only)    |
| DELETE | `/api/admin/users/:id`  | Delete user (admin only)   |
