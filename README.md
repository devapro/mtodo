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
- 💾 **Automated backups** – a Docker sidecar takes a consistent SQLite snapshot on deploy and once a day, gzips it to a host folder, prunes old ones by retention, and ships a one-command restore. See [Data persistence & backups](#data-persistence--backups).

## Project structure

```
mtodo/
├── server/              # Express + SQLite API (TypeScript)
│   └── src/telegram/    # Telegram bot integration (Telegraf)
├── client/              # React + Vite SPA (TypeScript)
├── docker/              # Docker configs (compose, Dockerfiles, nginx, ngrok)
│   └── backup/          # SQLite backup/restore + daily scheduler scripts
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

## Deployment

mTodo is hardened for production but stays **zero-config for local / LAN use**.
Pick the scenario that matches your setup.

### 1. Local machine / LAN over plain HTTP (zero-config)

This is the default and needs **no extra configuration**. It works on
`http://localhost` as well as on a LAN IP such as `http://192.168.1.10`.

- `ALLOWED_ORIGINS` is left **empty**, so the API reflects any origin (CORS is open).
- HSTS is disabled, so plain HTTP is not force-upgraded to HTTPS.
- `NODE_ENV` stays `development`, so the default `JWT_SECRET` is accepted.

```bash
cp .env.example .env
npm run docker:up
# Client: http://localhost:5173   API: http://localhost:4000/api
```

To reach it from other devices on your network, point the client at the host's
LAN IP when building so the browser calls the right API address:

```bash
# In .env (consumed at client build time):
VITE_API_URL=http://192.168.1.10:4000/api
```

Then open `http://192.168.1.10:5173` from any device on the LAN.

> Note: PWA install/offline requires a **secure context** (HTTPS or
> `localhost`). Over a raw LAN IP the app still runs, but it won't be
> installable until served over HTTPS.

### 2. Public / production deployment (HTTPS, locked down)

For an internet-facing deployment, switch on the production safeguards. At a
minimum set:

```bash
NODE_ENV=production                         # enables the JWT-secret guard
JWT_SECRET=<long-random-string>             # REQUIRED — server won't start with the default
ALLOWED_ORIGINS=https://todo.example.com    # comma-separated CORS allow-list
TRUST_PROXY=true                            # when behind nginx/traefik/Caddy
VITE_API_URL=https://todo.example.com/api   # API base URL the client calls
ADMIN_EMAIL=you@example.com                 # change the default admin
ADMIN_PASSWORD=<strong-password>
```

Generate a strong secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Key behaviors in production:

- The server **refuses to start** if `NODE_ENV=production` and `JWT_SECRET` is
  still the default dev value.
- CORS only allows the origins listed in `ALLOWED_ORIGINS` (requests from other
  origins are rejected).
- Rate limiting applies per client IP — set `TRUST_PROXY=true` so the real
  client IP is read from the proxy's `X-Forwarded-*` headers instead of the
  proxy's own IP.

#### Behind a reverse proxy (nginx example)

Terminate TLS at the proxy and forward `/api` to the server and everything else
to the client container. Forwarded headers must be passed through for rate
limiting to work (`TRUST_PROXY=true`):

```nginx
server {
  listen 443 ssl;
  server_name todo.example.com;

  # ...ssl_certificate / ssl_certificate_key...

  location /api/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    proxy_pass http://127.0.0.1:5173;   # nginx-served static client
  }
}
```

With this layout the client and API share one origin, so you can set
`ALLOWED_ORIGINS=https://todo.example.com` and `VITE_API_URL=https://todo.example.com/api`.

### 3. Quick public tunnel (ngrok)

The Docker stack bundles an optional **ngrok** service to expose the client
publicly without a server. Set `NGROK_AUTHTOKEN` in `.env`, bring the stack up,
and read the public URL from the ngrok inspector at http://localhost:4040.
Because ngrok terminates TLS, set `TRUST_PROXY=true` so rate limiting sees the
real client IP, and add the ngrok URL to `ALLOWED_ORIGINS` if you lock CORS down.

### Tuning rate limits

Defaults are generous and shouldn't affect normal use. Adjust per IP via:

| Variable               | Default      | Meaning                                   |
| ---------------------- | ------------ | ----------------------------------------- |
| `RATE_LIMIT_WINDOW_MS` | `900000`     | Window length in ms (15 min)              |
| `RATE_LIMIT_MAX`       | `600`        | Max API requests per window               |
| `RATE_LIMIT_AUTH_MAX`  | `30`         | Max sign-in/sign-up attempts per window   |

### Data persistence & backups

The SQLite database lives at `DATABASE_FILE` (default `/data/mtodo.sqlite` in
Docker, on the named `mtodo-data` volume). `npm run docker:down -v` **drops** the
volume and all data, so omit `-v` for an ordinary stop.

#### Automated daily backups (Docker)

The Compose stack includes a `backup` sidecar (`docker/backup.Dockerfile`) that
runs alongside the server. It:

- takes a **consistent snapshot on startup** (so a backup exists right after
  deploy), and then **once a day** at `BACKUP_TIME` (HH:MM, UTC, default `03:00`);
- uses SQLite's online `.backup` API, so snapshots are safe to take while the
  server is writing (the DB runs in WAL mode);
- gzips each snapshot and **copies it to a host folder** — `./backups` by default
  (override with `BACKUP_HOST_DIR`) — so backups survive even if the Docker
  volume is removed;
- verifies each snapshot with `PRAGMA integrity_check` and prunes backups older
  than `BACKUP_RETENTION_DAYS` (default `7`).

Backups are named `mtodo-YYYYMMDD-HHMMSS.sqlite.gz`. Relevant env vars
(`BACKUP_TIME`, `BACKUP_RETENTION_DAYS`, `BACKUP_HOST_DIR`) are documented in
`.env.example`.

Take an on-demand backup of the running stack:

```bash
npm run db:backup
# or: docker compose -p mtodo -f docker/docker-compose.yml exec backup sh /scripts/backup.sh
```

#### Restoring from a backup

The `restore.sh` script decompresses a chosen backup, verifies its integrity,
keeps a safety copy of the current database (`*.pre-restore.*`), and replaces the
live file. **Stop the server first** so it isn't writing during the swap:

```bash
# List available backups
npm run db:backups

# Restore the most recent backup
docker compose -p mtodo -f docker/docker-compose.yml stop server
npm run db:restore                       # newest backup
# or restore a specific one:
# docker compose -p mtodo -f docker/docker-compose.yml run --rm backup \
#   sh /scripts/restore.sh mtodo-20260101-030000.sqlite.gz
docker compose -p mtodo -f docker/docker-compose.yml start server
```

The backup/restore scripts are plain POSIX shell (`docker/backup/`) and read
`DATABASE_FILE` / `BACKUP_DIR` from the environment, so they also work outside
Docker (they only require the `sqlite3` CLI).

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
| `BACKUP_TIME`     | Daily backup time `HH:MM` (UTC) for the backup sidecar (default `03:00`) |
| `BACKUP_RETENTION_DAYS` | Days of backups to keep before pruning (default `7`) |
| `BACKUP_HOST_DIR` | Host folder backups are copied to, relative to `docker/` (default `../backups`) |

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
public deployment, see the [Deployment](#deployment) section above for the full
production setup (HTTPS, locked-down CORS, reverse proxy, rate-limit tuning).

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
