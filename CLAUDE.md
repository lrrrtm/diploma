# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Strategy — Monolith

This repository hosts **the entire UniComm platform** as a monolith. The main app and mini-apps live side by side, each in its own directory, all deployed via a unified Docker Compose.

```
diploma/                        ← this repo
  main/                         ← root student portal (UniComm)
    frontend/                   ← React SPA, Vite, TypeScript, Tailwind, shadcn, lucide-react
    backend/                    ← FastAPI, httpx, python-jose
    docker-compose.yml          ← standalone dev compose (nginx on :8001)
  services/                     ← services mini-app
    frontend/                   ← React SPA, Vite, TypeScript, React Router, Tailwind/shadcn, Axios
    backend/                    ← FastAPI, SQLAlchemy, MySQL
    nginx/                      ← dev nginx config
    docker-compose.yml          ← standalone dev compose
  traffic/                      ← attendance mini-app
    frontend/                   ← React SPA, Vite, TypeScript, React Router, @zxing, qrcode.react, shadcn
    backend/                    ← FastAPI, SQLAlchemy, MySQL
  docker-compose.yml            ← unified production compose (main + services + traffic)
  .env.dist                     ← env template for unified compose
```

### Deployment

Production URLs:
- `https://poly.hex8d.space` — main app
- `https://services.poly.hex8d.space` — services
- `https://traffic.poly.hex8d.space` — traffic (attendance)

Unified compose exposes:
- Port `3010` → main (nginx serving SPA + proxying /api/ to backend)
- Port `3011` → services (nginx serving SPA + proxying /api/ and /uploads/ to backend)
- Port `3012` → traffic (nginx serving SPA + proxying /api/ to backend)

Server nginx (on the host) reverse-proxies each subdomain to the corresponding port. SSL via Certbot.

### Nginx DNS caching fix

All nginx configs use the Docker embedded resolver to prevent stale IPs when backend containers restart:
```nginx
resolver 127.0.0.11 valid=5s;
location /api/ {
    set $backend http://backend:8000;
    proxy_pass $backend$request_uri;
}
```
Without `resolver` + `set $var`, nginx resolves the upstream hostname once at startup and breaks after container restarts.

### Main app ↔ Mini-app contract

The main app generates a **launch token** (short-lived JWT, 5-minute expiry, signed with `LAUNCH_TOKEN_SECRET`) and opens mini-apps in an iframe:
```
https://services.poly.hex8d.space/?launch_token=<jwt>
https://traffic.poly.hex8d.space/scan?launch_token=<jwt>
```
The mini-app frontend reads `launch_token` from URL, sends `POST /api/auth/verify-launch` to its own backend, which decodes the token using the shared `LAUNCH_TOKEN_SECRET` and returns student identity (`student_id`, `student_name`, `student_email`). The mini-app stores this in `StudentContext` (sessionStorage) and also stores the raw token for later use (e.g., attendance verification).

Mini-app URLs are configured via `SERVICES_URL` and `TRAFFIC_URL` env vars in the main backend.

### shadcn/ui convention

All frontends use shadcn/ui. **Always install components via CLI** — never create them manually:
```bash
cd <app>/frontend
npx shadcn@latest add <component>
```
The `components.json` and `tsconfig.json` (with `paths`) must exist for the CLI to work. Path alias `@` → `./src` is configured in `tsconfig.app.json` and `vite.config.ts`.

---

## Main App

**UniComm** — root student portal. Authenticates against SPbSTU CAS, displays a bottom-navbar SPA with cards/tabs for all mini-apps.

### Main App Dev Commands

Requires `main/.env` with: `SECRET_KEY`, `CAS_SERVER`, `CAS_SERVICE_URL`, `FRONTEND_URL`, `SERVICES_URL`, `TRAFFIC_URL`, `LAUNCH_TOKEN_SECRET`.

```bash
cd main
docker compose up --build    # nginx+frontend on :8001, backend internal
```

Frontend only (dev):
```bash
cd main/frontend
npm install
npm run dev    # port 5174
```

Backend only:
```bash
cd main/backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### Main App Architecture

```
React SPA (Vite + TypeScript + Tailwind + shadcn + lucide-react)
  └── fetch → /api/* (proxied by nginx)
        └── FastAPI (Python 3.12, uvicorn, port 8001)
              ├── CAS SSO scraping (httpx)
              ├── JWT (python-jose, 7-day expiry)
              ├── Mini-app registry + launch token generation
              └── Schedule proxy (ruz.spbstu.ru API)
```

### Auth Flow

**Development / scraping flow** (used when CAS service URL is not registered):
1. Student enters SPbSTU login + password on `/login` form
2. `POST /api/auth/login` → backend GETs CAS login page (execution token), POSTs credentials, parses `page-context` JSON from response HTML, extracts `wsAsu` identity
3. Backend issues a JWT with `{sub: student_id, email, name}`, returns it in JSON
4. Frontend stores token in `localStorage`, redirects to `/`

**Production flow** (when CAS service URL is registered with IT dept):
1. `GET /api/auth/login` → redirect to `https://cas.spbstu.ru/login?service=...`
2. CAS redirects to `GET /api/auth/callback?ticket=ST-xxx`
3. Backend calls `serviceValidate`, parses XML, issues JWT, redirects to frontend with `?token=...`

### Main App Frontend

Single-file SPA — no react-router. Manual pathname-based routing:
- `/login` → `LoginPage` (username + password form, POST to `/api/auth/login`)
- `/` (everything else) → `HomePage`

**`HomePage` tab structure** (`Tab = "home" | "schedule" | "gradebook" | "services" | "profile"`):
- **Главная** — greeting + `MiniAppCard` list fetched from `/api/miniapps/` + QR scan button for attendance
- **Расписание** — `ScheduleTab` with week/day navigation, swipe gestures, calendar picker; proxies ruz.spbstu.ru API via `/api/schedule`
- **Зачётка** — `ComingSoon` placeholder
- **Заявки** — opens `ServicesSheet` (fullscreen iframe overlay)
- **Профиль** — student name/email/ID + theme selector (light/dark/system) + logout button

**`ServicesSheet`**: fixed `inset-0 z-50`, CSS transform `translateY(100% → 0)` on mount, `translateY(0 → 100%)` + 320ms timeout on close. Contains `<iframe>` pointing to `{SERVICES_URL}?launch_token=<jwt>`.

**`TrafficSheet`**: same pattern as ServicesSheet. Opens `{TRAFFIC_URL}/scan?launch_token=<jwt>` in iframe. Triggered by QR scan button on home tab.

**Bottom navbar**: `z-40`, always visible behind sheets; active item highlighted in blue.

**Theme support**: `ThemeContext` manages light/dark/system themes, persisted in `localStorage`. System preference detection via `matchMedia`.

### Main App Key Files

| File | Purpose |
|---|---|
| `main/backend/app/main.py` | FastAPI factory, CORS, router registration (auth, miniapps, schedule) |
| `main/backend/app/config.py` | `Settings`: `SECRET_KEY`, `CAS_SERVER`, `CAS_SERVICE_URL`, `FRONTEND_URL`, `SERVICES_URL`, `TRAFFIC_URL`, `LAUNCH_TOKEN_SECRET`, JWT config |
| `main/backend/app/routers/auth.py` | CAS scraping (`POST /login`), CAS redirect (`GET /login`), callback, `/me` |
| `main/backend/app/routers/miniapps.py` | Mini-apps registry (`GET /api/miniapps/`), launch token generation (`GET /api/miniapps/launch-token`) |
| `main/backend/app/routers/schedule.py` | RUZ API proxy: group resolution, weekly schedule fetch |
| `main/frontend/src/App.tsx` | Entire SPA: routing, tabs, `ServicesSheet`, `TrafficSheet`, `ScheduleTab`, `BottomNav` |
| `main/frontend/src/DevLoginPage.tsx` | Login form component (despite filename — this is the real login, not dev-only) |
| `main/frontend/src/api.ts` | `fetchMe`, `fetchMiniApps`, `fetchLaunchToken`, `fetchResolveGroup`, `fetchSchedule` helpers |
| `main/frontend/src/types.ts` | `Student`, `MiniApp`, `LessonEntry`, `DaySchedule`, `WeekSchedule` interfaces |
| `main/frontend/src/context/ThemeContext.tsx` | Light/dark/system theme management with localStorage persistence |
| `main/frontend/nginx.conf` | Proxies `/api/` to backend, serves SPA with `try_files` |

---

## Services Mini-App

**UniComm Services** — students submit service requests (applications) to university administrative departments; staff and executors process them. All UI text is in **Russian**.

### Services Dev Commands

Requires `services/.env` with: `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `DATABASE_URL`, `SECRET_KEY`, `UPLOAD_DIR`, `ADMIN_PASSWORD`, `LAUNCH_TOKEN_SECRET`.

```bash
cd services
docker-compose up --build
# nginx on :80, backend directly on :8000, frontend dev server on :5173
```

```bash
cd services/frontend
npm install
npm run dev      # Vite dev server on port 5173
npm run build
```

```bash
cd services/backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

There are no test suites in this project.

### Services Architecture

```
React SPA (Vite + TypeScript + React Router v6 + Tailwind/shadcn + Axios)
  └── Axios → /api/* (proxied by Nginx or Vite dev proxy)
        └── FastAPI (Python 3.12, uvicorn)
              ├── JWT auth for staff/admin/executor (python-jose, passlib/bcrypt)
              ├── Launch token verification (shared LAUNCH_TOKEN_SECRET)
              ├── SQLAlchemy 2.0 ORM (sync)
              └── MySQL 8.0 (PyMySQL driver)
                    + file uploads on disk at /app/uploads
```

### Domain Model

- **Department** — university administrative unit; has `login` + `password_hash` for staff auth
- **Service** — offered by a department; has `required_fields` JSON array defining a dynamic form schema (`{name, label, type, required, options}`)
- **Application** — student's service request; stores student data (external_id, name, email) as plain strings, form data as JSON; tracks status (`pending → in_progress → completed/rejected`); optionally assigned to an `Executor`
- **ApplicationResponse** — department/executor reply with optional message, file attachments, and status change; linked to department
- **Attachment** — file upload linked to an application or response
- **Executor** — a named worker account within a department; can be assigned to applications and respond to them; created/deleted by staff

### Authentication Model

This app is a mini-app inside the main app. There is **no generic User model**.

| Actor | Auth method | JWT claims |
|---|---|---|
| **Student** | Main app passes `launch_token` via URL. Verified by `POST /api/auth/verify-launch`. Stored in `StudentContext` (sessionStorage). | — |
| **Staff** (per department) | Login with department `login` + `password`. One shared credential per department. | `role=staff`, `department_id`, `department_name` |
| **Admin** | Login with `admin` + `ADMIN_PASSWORD` env var. | `role=admin` |
| **Executor** | Login with executor `login` + `password`. Created by staff. | `role=executor`, `executor_id`, `executor_name`, `department_id` |

**Important:** `require_staff`, `require_executor`, and related dependencies in `dependencies.py` validate not just the JWT role but also **confirm the entity still exists in the DB**. If a department or executor has been deleted, the token returns `401`, which triggers logout + redirect to `/login` on the frontend.

### Auth Roles Summary

- `admin` — manages departments and services; no access to applications
- `staff` — sees all applications for their department; assigns executors; responds to applications; manages executors
- `executor` — sees only applications assigned to them; can respond

### Key Patterns

**Dynamic forms**: Services define fields as JSON in the DB. `components/shared/dynamic-form.tsx` renders them at runtime, supporting `text`, `textarea`, `number`, `date`, `select`.

**Multipart submissions**: Applications and responses use `multipart/form-data` to send JSON data and files in one request.

**Backend auth**: `dependencies.py` provides `get_current_auth` (JWT decode only), `require_admin`, `require_staff` (+ DB check), `require_executor` (+ DB check), `require_staff_or_admin`, `require_staff_executor_or_admin` (+ DB checks as appropriate).

**Frontend auth**: `AuthContext.tsx` manages staff/admin/executor token + role in `localStorage`. `StudentContext.tsx` verifies launch token and stores student data in `sessionStorage`. `api/client.ts` auto-injects Bearer token and redirects to `/login` on 401 for `/staff`, `/admin`, `/executor` paths.

**Tabs + auto-refresh**: Application list pages (student `ApplicationsPage`, staff `StaffDashboardPage`, executor `ExecutorDashboardPage`) use `@radix-ui/react-tabs` to split by status (Ожидает / В обработке / Завершённые) and poll every 5 seconds via `setInterval`.

**Step animations**: Multi-step flows (e.g., new application: departments → services) use `step-enter-forward` / `step-enter-back` CSS classes defined in `index.css`. `key={step}` on the content div forces remount to trigger animation; `stepDir` state controls direction.

**Shared detail components**:
- `components/shared/responses-list.tsx` — renders the sorted (newest-first) list of response cards; used on all three detail pages
- `components/shared/respond-form.tsx` — message + status change + file upload form; used on staff and executor detail pages

**Toast notifications**: `sonner` library, `<Toaster position="top-right" />` in `main.tsx`. All mutating actions call `toast.success` / `toast.error`.

**Path alias**: `@` → `./src` (in `vite.config.ts` and `tsconfig.app.json`).

### Services Key Files

| File | Purpose |
|---|---|
| `services/backend/app/main.py` | FastAPI app factory, CORS, static file mount, router registration |
| `services/backend/app/dependencies.py` | JWT auth dependencies with DB existence checks |
| `services/backend/app/models/department.py` | `Department` with `login`/`password_hash` |
| `services/backend/app/models/service.py` | `Service` with `required_fields` JSON column |
| `services/backend/app/models/application.py` | `Application`, `Attachment`, `ApplicationResponse`, `ApplicationStatus` enum |
| `services/backend/app/models/executor.py` | `Executor` — worker account linked to a department |
| `services/backend/app/routers/auth.py` | Login for admin/staff/executor + `POST /verify-launch` for student launch tokens |
| `services/backend/app/routers/applications.py` | Core application workflow; `PATCH /{id}/assign` to assign executor |
| `services/backend/app/routers/departments.py` | CRUD for departments (admin-only) |
| `services/backend/app/routers/services.py` | CRUD for services (staff/admin) |
| `services/backend/app/routers/executors.py` | CRUD for executors (staff-only) |
| `services/frontend/src/App.tsx` | React Router v6 route tree |
| `services/frontend/src/context/AuthContext.tsx` | Staff/admin/executor auth state |
| `services/frontend/src/context/StudentContext.tsx` | Student identity from launch token verification |
| `services/frontend/src/types/index.ts` | All shared TypeScript interfaces |
| `services/frontend/src/api/client.ts` | Axios instance with auth + 401 interceptor |
| `services/frontend/src/components/shared/dynamic-form.tsx` | Runtime form renderer from JSON schema |
| `services/frontend/src/components/shared/responses-list.tsx` | Shared response history list |
| `services/frontend/src/components/shared/respond-form.tsx` | Shared respond form (staff + executor) |
| `services/frontend/src/pages/student/ApplicationsPage.tsx` | Tabs + new app sheet with step animations + 5s refresh |
| `services/frontend/src/pages/staff/StaffDashboardPage.tsx` | Tabs + search + service filter + 5s refresh |
| `services/frontend/src/pages/staff/StaffExecutorsPage.tsx` | Create/delete executors |
| `services/frontend/src/pages/staff/ManageServicesPage.tsx` | Service CRUD for staff |
| `services/frontend/src/pages/executor/ExecutorDashboardPage.tsx` | Executor's tabbed application list |
| `services/frontend/src/pages/executor/ExecutorApplicationDetailPage.tsx` | Executor detail + respond |
| `services/frontend/src/pages/admin/AdminDepartmentsPage.tsx` | Department CRUD (admin) |

---

## Traffic Mini-App

**UniComm Traffic** — QR-based attendance system. Students scan QR codes displayed on classroom tablets to mark their presence; teachers create and manage attendance sessions via their cabinet; admins manage tablets and teacher accounts.

### Traffic Dev Commands

No standalone docker-compose — traffic runs only via the root unified compose or manually.

```bash
cd traffic/frontend
npm install
npm run dev      # Vite dev server
```

```bash
cd traffic/backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Requires `traffic/.env` (for unified compose) with: `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `DATABASE_URL`, `LAUNCH_TOKEN_SECRET`, `TEACHER_SECRET`, `ADMIN_SECRET`, `ADMIN_PASSWORD`, `QR_ROTATE_SECONDS`, `SESSION_MAX_MINUTES`.

### Traffic Architecture

```
React SPA (Vite + TypeScript + React Router v6 + @zxing + qrcode.react + shadcn)
  └── Axios → /api/* (proxied by nginx)
        └── FastAPI (Python 3.12, uvicorn)
              ├── SQLAlchemy 2.0 ORM (sync) + MySQL 8.0 (PyMySQL)
              ├── Launch token verification (shared LAUNCH_TOKEN_SECRET)
              ├── Teacher JWT auth (TEACHER_SECRET, 8h expiry)
              ├── Admin JWT auth (ADMIN_SECRET)
              └── HMAC-SHA256 rotating QR tokens (default 5s rotation)
```

### Key Concepts

**Tablets**: Each classroom display runs `/display` which auto-registers itself via `POST /api/tablets/init` (creates unregistered tablet with `init_secret`). Admin scans the registration QR and assigns a building+room via `/admin/tablets/register/:id`. The `init_secret` is stored in `localStorage` on the display and passed to `GET /api/sessions/current` to authenticate the display page and receive `qr_secret`.

**Sessions**: A teacher opens `/teacher/session?device=<tablet_id>`, creates an attendance session specifying a discipline. The session generates a per-session HMAC secret (`qr_secret`). Sessions auto-expire after `SESSION_MAX_MINUTES` (default 90).

**Rotating QR tokens**: The display page generates HMAC-SHA256 tokens client-side using Web Crypto API (no backend polling). Tokens rotate every `QR_ROTATE_SECONDS`. Backend accepts current and previous window to handle slow scans.

**Student attendance**: Students open `/scan?launch_token=<jwt>` in an iframe. They scan the QR, the frontend calls `POST /api/sessions/:id/attend` with `qr_token` + `launch_token`. Backend verifies both the HMAC token and the student's JWT identity.

**Cascade deletes**: `Tablet → Session → Attendance` relationships use `cascade="all, delete-orphan"` in SQLAlchemy so deleting a tablet removes all its sessions and attendance records.

### Traffic Routes

| Route | Page | Description |
|---|---|---|
| `/display` | `DisplayPage` | Classroom tablet — self-registers, shows QR, polls session state |
| `/scan` | `StudentScanPage` | Student camera QR scanner (opened in iframe from main app) |
| `/teacher/login` | `TeacherLoginPage` | Teacher login form |
| `/teacher/session` | `TeacherSessionPage` | Create/manage active session; shows live attendee list |
| `/teacher/history` | `TeacherHistoryPage` | Past sessions list |
| `/teacher/history/:id` | `TeacherSessionDetailPage` | Session details + full attendee table |
| `/admin/login` | `AdminLoginPage` | Admin login form |
| `/admin/tablets` | `AdminTabletsPage` | Registered tablets grid (unregistered tablets hidden) |
| `/admin/tablets/register/:deviceId` | `AdminRegisterPage` | Two-step building→room selection with slide animations + AlertDialog confirm |
| `/admin/teachers` | `AdminTeachersPage` | Teacher account CRUD |

### Traffic Authentication Model

| Actor | Auth method | JWT claims |
|---|---|---|
| **Student** | Main app `launch_token` via URL → `POST /api/auth/verify-launch` | stored in `sessionStorage` |
| **Teacher** | Login with `username` + `password` → `POST /api/auth/teacher/login` | `role=teacher`, `teacher_id`, `teacher_name` |
| **Admin** | Login with `admin` + `ADMIN_PASSWORD` → `POST /api/auth/admin/login` | `role=admin` |
| **Display (tablet)** | `init_secret` (64-char hex) stored in `localStorage`, passed as query param to `GET /api/sessions/current?tablet_secret=` | not a JWT — HMAC comparison |

### Traffic Key Files

| File | Purpose |
|---|---|
| `traffic/backend/app/main.py` | FastAPI app, CORS, routers registration |
| `traffic/backend/app/config.py` | All settings: secrets, `QR_ROTATE_SECONDS`, `SESSION_MAX_MINUTES`, `DATABASE_URL` |
| `traffic/backend/app/database.py` | SQLAlchemy engine + `get_db` dependency |
| `traffic/backend/app/models/tablet.py` | `Tablet`: `id`, `init_secret`, building/room fields, `sessions` cascade relationship |
| `traffic/backend/app/models/session.py` | `Session`: `qr_secret`, `rotate_seconds`, `is_active`, `attendances` cascade relationship |
| `traffic/backend/app/models/attendance.py` | `Attendance`: student identity + `marked_at`; unique constraint on `(session_id, student_external_id)` |
| `traffic/backend/app/models/teacher.py` | `Teacher`: `username`, `password_hash`, `full_name` |
| `traffic/backend/app/routers/auth.py` | Teacher + admin login, `POST /verify-launch` for students |
| `traffic/backend/app/routers/tablets.py` | `POST /init`, CRUD for tablets; register endpoint assigns building+room |
| `traffic/backend/app/routers/sessions.py` | Session CRUD; `GET /current` returns `qr_secret` only to authenticated display; `POST /:id/attend` verifies HMAC token + launch_token JWT |
| `traffic/backend/app/routers/teachers.py` | Admin CRUD for teacher accounts |
| `traffic/frontend/src/App.tsx` | React Router v6 route tree |
| `traffic/frontend/src/context/AuthContext.tsx` | Teacher + admin auth state (localStorage) |
| `traffic/frontend/src/context/StudentContext.tsx` | Student identity + raw launch_token (sessionStorage) |
| `traffic/frontend/src/lib/hmac.ts` | Client-side HMAC-SHA256 QR token generation (Web Crypto API) |
| `traffic/frontend/src/pages/DisplayPage.tsx` | Tablet display: self-init, polls tablet + session, generates QR client-side |
| `traffic/frontend/src/pages/StudentScanPage.tsx` | @zxing camera scanner; sends `qr_token` + `launch_token` to attend endpoint |
| `traffic/frontend/src/pages/TeacherSessionPage.tsx` | Create session with schedule suggestions; live attendee list with 5s polling |
| `traffic/frontend/src/pages/TeacherHistoryPage.tsx` | Past sessions list with active Badge |
| `traffic/frontend/src/pages/TeacherSessionDetailPage.tsx` | Session detail + attendees Table |
| `traffic/frontend/src/pages/admin/AdminTabletsPage.tsx` | Registered tablets in responsive grid |
| `traffic/frontend/src/pages/admin/AdminRegisterPage.tsx` | Two-step building→room selection with `step-enter-forward/back` animations + AlertDialog |
| `traffic/frontend/src/pages/admin/AdminTeachersPage.tsx` | Teacher CRUD in responsive grid |
| `traffic/frontend/nginx.prod.conf` | Production nginx: resolver fix + proxy_pass with `$request_uri` |
