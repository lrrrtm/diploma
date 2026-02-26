# CLAUDE.md

This file provides guidance to AI assistants working with code in this repository.

## Repository Strategy — Monolith

This repository hosts **the entire super-app platform** as a monolith. Multiple mini-apps live side by side, each in its own directory, all deployed via a unified Docker Compose.

```
diploma/                        ← this repo
  superapp/                     ← root student portal (BUILT)
    frontend/                   ← React SPA, Vite, TypeScript, Tailwind, lucide-react
    backend/                    ← FastAPI, httpx, python-jose
    docker-compose.yml          ← standalone dev compose (nginx on :8001)
  services/                     ← services mini-app (BUILT)
    frontend/                   ← React SPA, Vite, TypeScript, Tailwind/shadcn
    backend/                    ← FastAPI, SQLAlchemy, MySQL
    nginx/                      ← dev nginx config
    docker-compose.yml          ← standalone dev compose
  docker-compose.yml            ← unified production compose (superapp + services)
  .env.dist                     ← env template for unified compose
  library/                      ← (future) mini-app: library
  dormitory/                    ← (future) mini-app: dormitory
```

### Deployment

Production URL: `https://poly.hex8d.space` (superapp) + `https://services.poly.hex8d.space` (services).

Unified compose exposes:
- Port `3010` → superapp (nginx serving SPA + proxying /api/ to backend)
- Port `3011` → services (nginx serving SPA + proxying /api/ and /uploads/ to backend)

Server nginx (on the host) reverse-proxies each subdomain to the corresponding port. SSL via Certbot.

### Super-app ↔ Mini-app contract

The super-app deep-links into mini-apps by appending student identity as URL query params:
```
https://services.poly.hex8d.space/?student_id=...&student_name=...&student_email=...
```
The services mini-app reads these via `StudentContext` (sessionStorage). The services URL is configured via `SERVICES_URL` env var in the superapp backend.

---

## Superapp

**UniComm** — root student portal. Authenticates against SPbSTU CAS, displays a bottom-navbar SPA with cards/tabs for all mini-apps.

### Superapp Dev Commands

Requires `superapp/.env` with: `SECRET_KEY`, `CAS_SERVER`, `CAS_SERVICE_URL`, `FRONTEND_URL`, `SERVICES_URL`.

```bash
cd superapp
docker compose up --build    # nginx+frontend on :8001, backend internal
```

Frontend only (dev):
```bash
cd superapp/frontend
npm install
npm run dev    # port 5174
```

Backend only:
```bash
cd superapp/backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### Superapp Architecture

```
React SPA (Vite + TypeScript + Tailwind + lucide-react)
  └── fetch → /api/* (proxied by nginx)
        └── FastAPI (Python 3.12, uvicorn, port 8001)
              ├── CAS SSO scraping (httpx)
              └── JWT (python-jose, 7-day expiry)
```

### Superapp Auth Flow

**Development / scraping flow** (used when CAS service URL is not registered):
1. Student enters SPbSTU login + password on `/login` form
2. `POST /api/auth/login` → backend GETs CAS login page (execution token), POSTs credentials, parses `page-context` JSON from response HTML, extracts `wsAsu` identity
3. Backend issues a JWT with `{sub: student_id, email, name}`, returns it in JSON
4. Frontend stores token in `localStorage`, redirects to `/`

**Production flow** (when CAS service URL is registered with IT dept):
1. `GET /api/auth/login` → redirect to `https://cas.spbstu.ru/login?service=...`
2. CAS redirects to `GET /api/auth/callback?ticket=ST-xxx`
3. Backend calls `serviceValidate`, parses XML, issues JWT, redirects to frontend with `?token=...`

### Superapp Frontend

Single-file SPA — no react-router. Manual pathname-based routing:
- `/login` → `LoginPage` (username + password form, POST to `/api/auth/login`)
- `/` (everything else) → `HomePage`

**`HomePage` tab structure** (`Tab = "home" | "schedule" | "gradebook" | "services" | "profile"`):
- **Главная** — greeting + `MiniAppCard` list fetched from `/api/miniapps/`
- **Расписание** — `ComingSoon` placeholder
- **Зачётка** — `ComingSoon` placeholder
- **Заявки** — opens `ServicesSheet` (slides up from bottom as fullscreen iframe over the SPA; closes with slide-down animation; tab state stays on `"home"` behind the sheet to avoid blank-screen flash)
- **Профиль** — student name/email/ID + logout button

**`ServicesSheet`**: fixed `inset-0 z-50`, CSS transform `translateY(100% → 0)` on mount via `requestAnimationFrame`, `translateY(0 → 100%)` + 320ms timeout before unmount on close. Contains `<iframe>` pointing to the services mini-app URL with student identity query params.

**Bottom navbar**: `z-40`, always visible behind the sheet; active item highlighted in blue; `servicesOpen ? "services" : tab` used for highlight state so navbar stays correct during sheet animation.

### Superapp Key Files

| File | Purpose |
|---|---|
| `superapp/backend/app/main.py` | FastAPI factory, CORS, router registration |
| `superapp/backend/app/config.py` | `Settings`: `SECRET_KEY`, `CAS_SERVER`, `CAS_SERVICE_URL`, `FRONTEND_URL`, `SERVICES_URL`, JWT config |
| `superapp/backend/app/routers/auth.py` | CAS scraping (`POST /login`), CAS redirect (`GET /login`), callback, `/me` |
| `superapp/backend/app/routers/miniapps.py` | Mini-apps list using `settings.SERVICES_URL` (`GET /api/miniapps/`) |
| `superapp/frontend/src/App.tsx` | Entire SPA: routing, tabs, `ServicesSheet`, `BottomNav`, `LoginPage` import |
| `superapp/frontend/src/DevLoginPage.tsx` | Login form component (despite filename — this is the real login, not dev-only) |
| `superapp/frontend/src/api.ts` | `fetchMe(token)`, `fetchMiniApps(token)` helpers |
| `superapp/frontend/src/types.ts` | `Student`, `MiniApp` interfaces |
| `superapp/frontend/nginx.conf` | Proxies `/api/` to backend, serves SPA with `try_files` |

---

## Services Mini-App

**UniComm Services** — students submit service requests (applications) to university administrative departments; staff and executors process them. All UI text is in **Russian**.

### Services Dev Commands

Requires `services/.env` with: `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `DATABASE_URL`, `SECRET_KEY`, `UPLOAD_DIR`, `ADMIN_PASSWORD`.

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
React SPA (Vite + TypeScript + Tailwind/shadcn)
  └── Axios → /api/* (proxied by Nginx or Vite dev proxy)
        └── FastAPI (Python 3.12, uvicorn)
              ├── JWT auth for staff/admin/executor (python-jose, passlib/bcrypt)
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

This app is a mini-app inside a super-app. There is **no generic User model**.

| Actor | Auth method | JWT claims |
|---|---|---|
| **Student** | No auth. Super-app passes `student_id`, `student_name`, `student_email` via URL query params. Stored in `StudentContext` (sessionStorage). | — |
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

**Frontend auth**: `AuthContext.tsx` manages staff/admin/executor token + role in `localStorage`. `StudentContext.tsx` reads student data from URL query params and stores in `sessionStorage`. `api/client.ts` auto-injects Bearer token and redirects to `/login` on 401 for `/staff`, `/admin`, `/executor` paths.

**Tabs + auto-refresh**: Application list pages (student `ApplicationsPage`, staff `StaffDashboardPage`, executor `ExecutorDashboardPage`) use `@radix-ui/react-tabs` to split by status (Ожидает / В обработке / Завершённые) and poll every 5 seconds via `setInterval`.

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
| `services/backend/app/routers/auth.py` | Single login endpoint for admin, staff, and executor |
| `services/backend/app/routers/applications.py` | Core application workflow; `PATCH /{id}/assign` to assign executor |
| `services/backend/app/routers/executors.py` | CRUD for executors (staff-only) |
| `services/frontend/src/App.tsx` | React Router v6 route tree |
| `services/frontend/src/context/AuthContext.tsx` | Staff/admin/executor auth state |
| `services/frontend/src/context/StudentContext.tsx` | Student identity from super-app query params |
| `services/frontend/src/types/index.ts` | All shared TypeScript interfaces |
| `services/frontend/src/api/client.ts` | Axios instance with auth + 401 interceptor |
| `services/frontend/src/components/shared/dynamic-form.tsx` | Runtime form renderer from JSON schema |
| `services/frontend/src/components/shared/responses-list.tsx` | Shared response history list |
| `services/frontend/src/components/shared/respond-form.tsx` | Shared respond form (staff + executor) |
| `services/frontend/src/pages/staff/StaffDashboardPage.tsx` | Tabs + search + service filter + 5s refresh |
| `services/frontend/src/pages/staff/StaffExecutorsPage.tsx` | Create/delete executors |
| `services/frontend/src/pages/executor/ExecutorDashboardPage.tsx` | Executor's tabbed application list |
| `services/frontend/src/pages/executor/ExecutorApplicationDetailPage.tsx` | Executor detail + respond |
