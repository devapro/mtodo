# mTodo

A simple, modern TODO Proof of Concept built with a TypeScript stack.

- **Server:** Express.js + SQLite (`better-sqlite3`) + TypeScript
- **Client:** React + TypeScript + Vite + Bootstrap (React‑Bootstrap), with a Markdown editor
- **Deploy:** docker‑compose

## Features

- 🔐 **Auth** – sign up / sign in with JWT.
- 🛡️ **Admin panel** – list & remove users. Admin credentials come from `.env`.
- ✅ **Tasks** – create, edit, complete, delete.
- 🗂️ **Lists** – organize tasks into TODO lists.
- 🏷️ **Tags** – autocomplete from existing tags or type a new one to create it on the fly.
- 🔁 **Repeats** – none / daily / weekly (pick weekdays) / monthly (pick days) / custom (every N days/weeks/months).
- 📅 **Dates** – assign a specific date to a task.
- ⭐ **Today view** – shows tasks due today plus recurring tasks that occur today.
- 📝 **Markdown** – task descriptions are written in a Markdown editor and rendered as HTML.
- 🌗 **Dark / light theme** – toggle in the navbar; preference is remembered.
- 📱 **Responsive, modern UI.**

## Project structure

```
mtodo/
├── server/        # Express + SQLite API (TypeScript)
├── client/        # React + Vite SPA (TypeScript)
├── docker-compose.yml
├── .env.example
└── requirements.md
```

## Quick start (Docker)

```bash
cp .env.example .env      # adjust secrets / admin credentials
docker compose up --build
```

- Client: http://localhost:5173
- API: http://localhost:4000/api
- Sign in as admin using `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`.

## Local development

Two terminals:

```bash
# 1) API
cd server
npm install
npm run dev        # http://localhost:4000

# 2) Client
cd client
npm install
npm run dev        # http://localhost:5173
```

The client reads the API base URL from `VITE_API_URL` (defaults to `http://localhost:4000/api`).

## Environment variables

See [`.env.example`](./.env.example):

| Variable          | Description                                  |
| ----------------- | -------------------------------------------- |
| `PORT`            | API server port                              |
| `JWT_SECRET`      | Secret used to sign auth tokens              |
| `DATABASE_FILE`   | Path to the SQLite database file             |
| `ADMIN_EMAIL`     | Built-in admin account email                 |
| `ADMIN_PASSWORD`  | Built-in admin account password              |
| `VITE_API_URL`    | API base URL the client calls                |

## API overview

| Method | Endpoint                | Description                |
| ------ | ----------------------- | -------------------------- |
| POST   | `/api/auth/signup`      | Create account             |
| POST   | `/api/auth/signin`      | Log in                     |
| GET    | `/api/auth/me`          | Current user               |
| GET    | `/api/lists`            | List TODO lists            |
| POST   | `/api/lists`            | Create list                |
| GET    | `/api/tags`             | List tags                  |
| GET    | `/api/tasks?today=true` | Today's tasks              |
| POST   | `/api/tasks`            | Create task                |
| PUT    | `/api/tasks/:id`        | Update task                |
| PATCH  | `/api/tasks/:id/toggle` | Toggle completion          |
| DELETE | `/api/tasks/:id`        | Delete task                |
| GET    | `/api/admin/users`      | List users (admin only)    |
| DELETE | `/api/admin/users/:id`  | Delete user (admin only)   |
