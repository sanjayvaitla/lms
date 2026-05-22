# Vtricks LMS — Setup & Run Guide

## Tech Stack
- **Frontend:** React 18, Vite, Tailwind CSS v4
- **Backend:** Node.js, Express
- **Database:** PostgreSQL (raw `pg` driver — no ORM)
- **Auth:** JWT (access + refresh tokens)

---

## Prerequisites
- Node.js 18+ installed
- pnpm installed globally (`npm install -g pnpm`)
- A PostgreSQL database (local or Supabase free tier)

---

## Step 1 — PostgreSQL Database

**Option A — Supabase (recommended, free)**
1. Go to [supabase.com](https://supabase.com) → Sign up → **New Project**
2. Name it `vtricks-lms`, set a database password
3. Go to **Settings → Database → Connection String → URI**
4. Copy the URI: `postgresql://postgres:[PASSWORD]@db.xxxx.supabase.co:5432/postgres`

**Option B — Local PostgreSQL**
```bash
createdb vtricks_lms
# CONNECTION STRING: postgresql://localhost:5432/vtricks_lms
```

---

## Step 2 — Environment Setup

```bash
# In the server/ folder, copy the example env
copy server\.env.example server\.env
```

Open `server/.env` and fill in:
```
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.xxxx.supabase.co:5432/postgres"
JWT_ACCESS_SECRET="any-long-random-string-at-least-32-chars"
JWT_REFRESH_SECRET="another-long-random-string-at-least-32-chars"
JWT_ACCESS_EXPIRY="1h"
JWT_REFRESH_EXPIRY="7d"
PORT=5000
NODE_ENV=development
CORS_ORIGIN="http://localhost:5173"
```

---

## Step 3 — Install Dependencies

```bash
# From the project root
pnpm install
```

---

## Step 4 — Create Tables + Seed Data

```bash
# 1. Run SQL schema (creates all tables, indexes, triggers)
pnpm --filter lms-server db:schema

# 2. Seed demo data (trainers, courses, students, enrollments)
pnpm --filter lms-server db:seed
```

Expected seed output:
```
🌱 Starting seed...

✅ Super Admin: ravi@vtricks.com
✅ 6 Trainers created
✅ 6 Courses created
✅ 20 Students created
✅ 70+ Enrollments created

✨ Seeding complete!

   👤 Super Admin : ravi@vtricks.com   / password123
   🎓 Trainer     : rajesh@vtricks.com / password123
   📚 Courses     : 6
   👥 Students    : 20
```

---

## Step 5 — Run the Full Stack App

```bash
# From the project ROOT — starts both client + server
pnpm dev
```

Or run separately:
```bash
pnpm dev:server   # Express API on http://localhost:5000
pnpm dev:client   # React app  on http://localhost:5173
```

---

## Login Credentials

| Role        | Email                | Password    |
|-------------|----------------------|-------------|
| Super Admin | ravi@vtricks.com     | password123 |
| Trainer     | rajesh@vtricks.com   | password123 |
| Student     | student1@vtricks.com | password123 |

---

## API Endpoints (port 5000)

| Method   | Path                       | Auth     | Description              |
|----------|----------------------------|----------|--------------------------|
| POST     | /api/v1/auth/register      | —        | Register new user        |
| POST     | /api/v1/auth/login         | —        | Login                    |
| GET      | /api/v1/auth/me            | Bearer   | Get current user         |
| POST     | /api/v1/auth/logout        | Bearer   | Logout                   |
| GET      | /api/v1/courses            | —        | List courses             |
| POST     | /api/v1/courses            | Admin    | Create course            |
| PUT      | /api/v1/courses/:id        | Admin    | Update course            |
| DELETE   | /api/v1/courses/:id        | Admin    | Archive course           |
| GET      | /api/v1/batches            | —        | List batches             |
| GET      | /api/v1/dashboard/stats    | Bearer   | Dashboard statistics     |
| GET      | /health                    | —        | Health check             |

---

## Project Structure

```
LMS Admin Portal Screens/
├── package.json              ← root pnpm workspace
├── pnpm-workspace.yaml
├── client/                   ← React + Vite + Tailwind CSS
│   └── src/
│       ├── app/pages/        ← Login, Dashboard, CourseMaster
│       ├── app/components/   ← Layout, Sidebar, Header
│       ├── store/            ← AuthContext (JWT)
│       └── lib/              ← Axios, React Query client
└── server/                   ← Node.js + Express
    └── src/
        ├── db/               ← schema.ts (SQL), seed.ts (pg)
        ├── lib/              ← db.ts (pg Pool), jwt.ts
        ├── middleware/       ← auth, error handler
        ├── routes/           ← auth, courses, batches, dashboard
        ├── controllers/      ← request handlers
        ├── services/         ← raw SQL business logic (pg)
        └── validators/       ← Zod schemas
```
