# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout — Monolith

```
diploma/
  main/        ← Политехник.Студент — root student portal (CAS auth)
  services/    ← Политехник.Услуги — service-request mini-app
  traffic/     ← Политехник.Посещаемость — QR attendance mini-app
  sso/         ← Политехник.SSO — central authentication service
  docker-compose.yml   ← unified production compose
  .env.dist            ← env template (copy to .env)
  TASKS.md             ← pending feature backlog (see implementation order inside)
```

Each app has `frontend/` (React + Vite + TypeScript + Tailwind + shadcn) and `backend/` (FastAPI + SQLAlchemy + MySQL, except main which uses CAS/httpx).

### Branding

All services follow the **Политехник.X** naming convention:
- `Политехник.Студент` — main
- `Политехник.Услуги` — services
- `Политехник.Посещаемость` — traffic
- `Политехник.SSO` — sso

### Deployment

Production URLs → Docker Compose ports:
- `https://poly.hex8d.space` → port `3010` (main)
- `https://services.poly.hex8d.space` → port `3011` (services)
- `https://traffic.poly.hex8d.space` → port `3012` (traffic)
- `https://sso.poly.hex8d.space` → port `3013` (sso)

Server nginx reverse-proxies subdomains to ports. SSL via Certbot.

### Nginx DNS caching fix (all nginx configs)

```nginx
resolver 127.0.0.11 valid=5s;
location /api/ {
    set $backend http://backend:8000;
    proxy_pass $backend$request_uri;
}
```
Without `resolver` + `set $var`, nginx caches DNS at startup and breaks when containers restart.

### shadcn/ui convention

**Always install components via CLI — never create manually:**
```bash
cd <app>/frontend
npx shadcn@latest add <component>
```
`components.json` and `tsconfig.json` with paths must exist. Path alias `@` → `./src` in `tsconfig.app.json` and `vite.config.ts`.

### CI/CD

`.github/workflows/deploy.yml` — on push to `master`:
1. `changes` job — detects which frontends changed via `dorny/paths-filter@v3`
2. `typecheck` job — runs `npx tsc --noEmit` only for changed frontends
3. `deploy` job — SSH to server, `git pull`, then rebuilds only changed Docker services based on `git diff --name-only`

---

## SSO Service

**Политехник.SSO** — central authentication for all staff/admin/teacher roles. Students authenticate via CAS (main app).

### SSO Dev Commands

Requires `sso/.env` with: `SSO_JWT_SECRET`, `SSO_SERVICE_SECRET`, `SSO_ADMIN_USERNAME`, `SSO_ADMIN_PASSWORD`, `SSO_MYSQL_*`.

```bash
cd sso/frontend && npm install && npm run dev
cd sso/backend && pip install -r requirements.txt && uvicorn app.main:app --reload
```

### SSO Architecture

```
React SPA (Vite + TypeScript + shadcn)
  └── /api/auth/login → FastAPI
        ├── Validates username+password against SSO DB
        ├── Issues JWT signed with SSO_JWT_SECRET
        │     payload: { sub, role, entity_id, full_name, app }
        └── Redirects back to mini-app with ?token=<jwt>
```

### SSO Login Flow

1. Mini-app frontend calls `goToSSOLogin()` → `window.location.replace(sso.poly.hex8d.space/?app=X&app_name=Y&redirect_to=Z)` (**replace not href**, so SSO never appears in back-history)
2. User enters credentials on SSO login page
3. SSO backend validates, issues JWT, calls `window.location.replace(redirect_to?token=<jwt>)` (**replace**, same reason)
4. Mini-app `AuthCallbackPage` reads `?token=`, calls `login(token)`, navigates based on `role` (replace)
5. JWT payload: `{ sub, role, entity_id, full_name, app }`

**Critical**: raw SSO JWT uses `entity_id` (not `department_id`/`executor_id`). The `require_staff`/`require_executor` dependencies in services backend add `department_id`/`executor_id` by aliasing `entity_id`. Endpoints using `get_current_auth` directly must use `auth.get("entity_id")`.

### SSO Key Files

| File | Purpose |
|---|---|
| `sso/backend/app/main.py` | FastAPI app, CORS, routers |
| `sso/backend/app/routers/auth.py` | `POST /auth/login` — validates credentials, issues JWT |
| `sso/frontend/src/pages/LoginPage.tsx` | Login form; reads `?app`, `?app_name`, `?redirect_to`; shows per-app icon |
| `sso/frontend/src/pages/AdminPage.tsx` | SSO admin panel — user/department management |
| `sso/frontend/src/context/AuthContext.tsx` | SSO admin auth state |

---

## Main App

**Политехник.Студент** — root student portal. Authenticates via SPbSTU CAS, launches mini-apps in iframe overlays.

### Main App Dev Commands

Requires `main/.env`: `SECRET_KEY`, `CAS_SERVER`, `CAS_SERVICE_URL`, `FRONTEND_URL`, `SERVICES_URL`, `TRAFFIC_URL`, `LAUNCH_TOKEN_SECRET`.

```bash
cd main && docker compose up --build   # nginx on :8001
cd main/frontend && npm run dev        # port 5174
cd main/backend && uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### Main App Auth Flow

**Dev (CAS scraping):** POST credentials → backend scrapes CAS, extracts `wsAsu` identity, issues JWT `{sub, email, name}` → stored in `localStorage`.

**Production (registered CAS service):** GET `/api/auth/login` → CAS redirect → `GET /api/auth/callback?ticket=ST-xxx` → `serviceValidate` XML parse → JWT → redirect with `?token=`.

### Main App ↔ Mini-app Contract

Main app generates a **launch token** (short-lived JWT, 5 min, `LAUNCH_TOKEN_SECRET`) and opens mini-apps in iframe:
```
https://services.poly.hex8d.space/?launch_token=<jwt>
https://traffic.poly.hex8d.space/scan?launch_token=<jwt>
```
Mini-app `POST /api/auth/verify-launch` decodes it, returns `{student_id, student_name, student_email}`, stored in `StudentContext` (sessionStorage).

### Main App Frontend

Single-file SPA (`App.tsx`) — no react-router, pathname-based routing: `/login` → `LoginPage`, `/` → `HomePage`.

Tabs: `home | schedule | gradebook | services`. `ServicesSheet` and `TrafficSheet` slide up as fullscreen iframe overlays (`translateY` CSS, z-50).

**Theme**: `ThemeContext` — light/dark/system, persisted in `localStorage`.

### Main App Key Files

| File | Purpose |
|---|---|
| `main/backend/app/routers/auth.py` | CAS scraping + callback |
| `main/backend/app/routers/miniapps.py` | Mini-app registry + launch token (`GET /api/miniapps/launch-token`) |
| `main/backend/app/routers/schedule.py` | RUZ API proxy |
| `main/frontend/src/App.tsx` | Entire SPA |
| `main/frontend/src/DevLoginPage.tsx` | Login form (real login despite filename) |
| `main/frontend/src/context/ThemeContext.tsx` | Theme management |

---

## Services Mini-App

**Политехник.Услуги** — students submit service requests; staff and executors process them. All UI text in Russian.

### Services Dev Commands

Requires `services/.env`: `MYSQL_*`, `DATABASE_URL`, `UPLOAD_DIR`, `LAUNCH_TOKEN_SECRET`, `SSO_JWT_SECRET`, `SSO_SERVICE_SECRET`.

```bash
cd services && docker-compose up --build
cd services/frontend && npm run dev    # port 5173
cd services/backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Services Domain Model

- **Department** — university unit; `username` for SSO account
- **Service** — offered by department; `required_fields` JSON (`{name, label, type, required, options}`)
- **Application** — student request; stores student data as strings, form data as JSON; status `pending → in_progress → completed/rejected`; optionally assigned to Executor
- **ApplicationResponse** — reply with optional file attachments + status change
- **Attachment** — file linked to application or response
- **Executor** — worker within a department

### Services Auth Model (SSO-based)

| Actor | Method | JWT payload |
|---|---|---|
| **Student** | `launch_token` via URL → `POST /api/auth/verify-launch` | stored in `StudentContext` (sessionStorage) |
| **Staff** | SSO login (`role=staff`) → callback → `loginFromToken(token)` | `role, entity_id` (= department_id), `full_name` |
| **Admin** | SSO login (`role=admin`) | `role, full_name` |
| **Executor** | SSO login (`role=executor`) | `role, entity_id` (= executor_id), `full_name` |

`require_staff` dep maps `entity_id` → `department_id`. `require_executor` fetches executor from DB to get `department_id`. Endpoints using raw `get_current_auth` must use `auth.get("entity_id")` not `auth["department_id"]`.

On 401, `api/client.ts` calls `goToSSOLogin()` (via `window.location.replace`).

### Services Key Patterns

**Dynamic forms**: `components/shared/dynamic-form.tsx` renders fields from JSON schema at runtime.

**Multipart submissions**: applications + responses use `multipart/form-data`.

**Tabs + 5s polling**: `ApplicationsPage`, `StaffDashboardPage`, `ExecutorDashboardPage` use radix Tabs + `setInterval(5000)`.

**Step animations**: `step-enter-forward`/`step-enter-back` CSS classes in `index.css`, `key={step}` forces remount.

**Theme**: `ThemeContext` in `context/ThemeContext.tsx`, `ThemeProvider` in `main.tsx`.

### Services Key Files

| File | Purpose |
|---|---|
| `services/backend/app/dependencies.py` | Auth deps; maps `entity_id` → role-specific id |
| `services/backend/app/routers/applications.py` | Core workflow; uses `entity_id` for staff/executor filtering |
| `services/frontend/src/context/AuthContext.tsx` | `loginFromToken(token)` parses JWT |
| `services/frontend/src/context/StudentContext.tsx` | Launch token verification |
| `services/frontend/src/lib/sso.ts` | `goToSSOLogin()` with `window.location.replace` |
| `services/frontend/src/pages/auth/AuthCallbackPage.tsx` | Reads `?token=`, routes by role |
| `services/frontend/src/components/shared/app-layout.tsx` | Header + sidebar navigation |
| `services/frontend/src/components/shared/dynamic-form.tsx` | Runtime form renderer |
| `services/frontend/src/components/shared/responses-list.tsx` | Response history (shared) |
| `services/frontend/src/components/shared/respond-form.tsx` | Respond form (staff + executor) |

---

## Traffic Mini-App

**Политехник.Посещаемость** — kiosk-based attendance. Kiosks display rotating QR codes for students to scan; teachers manage sessions; admins manage kiosks.

### Traffic Dev Commands

No standalone compose — runs via root unified compose or manually.

```bash
cd traffic/frontend && npm run dev
cd traffic/backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Requires `traffic/.env`: `MYSQL_*`, `DATABASE_URL`, `LAUNCH_TOKEN_SECRET`, `SSO_JWT_SECRET`, `SSO_SERVICE_SECRET`, `QR_ROTATE_SECONDS`, `SESSION_MAX_MINUTES`.

### Traffic Architecture

```
React SPA (Vite + TS + React Router v6 + @zxing + qrcode.react + shadcn)
  └── Axios → /api/* (proxied by nginx)
        └── FastAPI
              ├── SSO JWT verification (SSO_JWT_SECRET)
              ├── Launch token verification
              └── HMAC-SHA256 rotating QR tokens
```

### Traffic Key Concepts

**Kiosk** (`/kiosk`): auto-registers via `POST /api/tablets/init` (gets `device_id` + `init_secret` stored in `localStorage`). Admin registers it by assigning building+room. `init_secret` authenticates `GET /api/sessions/current` and receives `qr_secret`.

**Sessions**: teacher creates session for a kiosk → generates per-session HMAC `qr_secret`. Auto-expire after `SESSION_MAX_MINUTES` (default 90).

**Rotating QR**: kiosk generates HMAC-SHA256 tokens client-side (`lib/hmac.ts`, Web Crypto API). Rotates every `QR_ROTATE_SECONDS`. Backend accepts current + previous window.

**Student attendance**: `/scan?launch_token=<jwt>` iframe. Student scans QR → `POST /api/sessions/:id/attend` with `qr_token` + `launch_token`.

**Cascade deletes**: `Tablet → Session → Attendance` via SQLAlchemy `cascade="all, delete-orphan"`.

### Traffic Routes

| Route | Page |
|---|---|
| `/` | `RootRedirect` — SSO or cabinet if already logged in |
| `/kiosk` | `DisplayPage` — kiosk self-registers, shows QR |
| `/scan` | `StudentScanPage` — camera scanner, iframe from main app |
| `/auth/callback` | `AuthCallbackPage` — processes SSO token |
| `/teacher/session` | `TeacherSessionPage` — create/manage session |
| `/teacher/history` | `TeacherHistoryPage` |
| `/teacher/history/:id` | `TeacherSessionDetailPage` |
| `/admin/tablets` | `AdminTabletsPage` |
| `/admin/tablets/register/:deviceId` | `AdminRegisterPage` — two-step building→room |
| `/admin/teachers` | `AdminTeachersPage` |

### Traffic Auth Model (SSO-based)

| Actor | Method |
|---|---|
| **Teacher/Admin** | SSO → `AuthCallbackPage` → navigate by role |
| **Student** | `launch_token` via `/scan?launch_token=` → `POST /api/auth/verify-launch` |
| **Kiosk display** | `init_secret` in localStorage → query param to `GET /api/sessions/current` |

On 401, `api/client.ts` calls `goToSSOLogin()`.

### Traffic Key Files

| File | Purpose |
|---|---|
| `traffic/backend/app/config.py` | `QR_ROTATE_SECONDS`, `SESSION_MAX_MINUTES`, secrets |
| `traffic/backend/app/models/tablet.py` | `Tablet` with cascade to sessions |
| `traffic/backend/app/models/session.py` | `Session` with `qr_secret`, `is_active` |
| `traffic/backend/app/routers/sessions.py` | Session CRUD + `POST /:id/attend` |
| `traffic/backend/app/routers/tablets.py` | Kiosk CRUD, init, register |
| `traffic/frontend/src/App.tsx` | Routes + `RootRedirect` component |
| `traffic/frontend/src/lib/hmac.ts` | Client-side HMAC token generation |
| `traffic/frontend/src/lib/sso.ts` | `goToSSOLogin()` |
| `traffic/frontend/src/pages/DisplayPage.tsx` | Kiosk display logic |
| `traffic/frontend/src/pages/admin/AdminRegisterPage.tsx` | Slide animations + AlertDialog |
