# Auth Refactoring Plan: From User-Based Auth to Super-App Model

## Summary

Remove the User model entirely. Students are unauthenticated (data comes from super-app via query params). Admin logs in with a single env-var password. Each department gets its own login+password (created by admin). The `users` table is dropped; department table gains credentials.

---

## Phase 1: Backend Models

### 1.1 Delete `backend/app/models/user.py`

Remove the file entirely. `User` and `UserRole` no longer exist as ORM models.

### 1.2 Modify `backend/app/models/department.py`

Add two columns:
```python
login = Column(String(100), unique=True, nullable=True, index=True)
password_hash = Column(String(255), nullable=True)
```

Remove the `staff_members` relationship (was `relationship("User", ...)`).

### 1.3 Modify `backend/app/models/application.py`

**Application model:**
- Remove `student_id = Column(Integer, ForeignKey("users.id"), ...)` and `student` relationship
- Add three new columns:
  ```python
  student_external_id = Column(String(255), nullable=False)
  student_name = Column(String(255), nullable=False)
  student_email = Column(String(255), nullable=True)
  ```

**Attachment model:**
- Remove `uploaded_by_id = Column(Integer, ForeignKey("users.id"), ...)` and `uploaded_by` relationship

**ApplicationResponse model:**
- Remove `staff_id = Column(Integer, ForeignKey("users.id"), ...)` and `staff` relationship
- Add:
  ```python
  department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
  ```
  and a relationship: `department = relationship("Department")`

### 1.4 Modify `backend/app/models/__init__.py`

- Remove imports of `User`, `UserRole`
- Export `Department` (already exported), confirm all other exports remain

---

## Phase 2: Backend Config & Auth Infrastructure

### 2.1 Modify `backend/app/config.py`

Add:
```python
ADMIN_PASSWORD: str = "admin"
```
This reads from `ADMIN_PASSWORD` env var.

### 2.2 Rewrite `backend/app/dependencies.py`

Replace the entire file. No more User-based auth. New approach:

```python
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

def get_current_auth(token: str | None = Depends(oauth2_scheme)):
    """Returns decoded JWT payload or None (for public/student endpoints)."""
    if token is None:
        return None
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Недействительный токен")

def require_admin(auth: dict | None = Depends(get_current_auth)):
    if not auth or auth.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Требуются права администратора")
    return auth

def require_staff(auth: dict | None = Depends(get_current_auth)):
    if not auth or auth.get("role") != "staff":
        raise HTTPException(status_code=403, detail="Требуются права сотрудника")
    return auth

def require_staff_or_admin(auth: dict | None = Depends(get_current_auth)):
    if not auth or auth.get("role") not in ("staff", "admin"):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    return auth
```

Key change: `get_current_auth` returns a **dict** (JWT payload) or None, not a User ORM object. The payload contains `role`, and for staff also `department_id` and `department_name`.

### 2.3 Rewrite `backend/app/routers/auth.py`

Remove register endpoint entirely. Rewrite login:

```python
@router.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    # Try admin login
    if data.login == "admin" and pwd_context.verify(data.password, hash_of_admin_pw):
        # Actually - compare plain text to ADMIN_PASSWORD env var
        token = create_token(role="admin")
        return {"access_token": token, "role": "admin"}

    # Try department login
    department = db.query(Department).filter(Department.login == data.login).first()
    if department and pwd_context.verify(data.password, department.password_hash):
        token = create_token(role="staff", department_id=department.id, department_name=department.name)
        return {"access_token": token, "role": "staff", "department_id": department.id, "department_name": department.name}

    raise HTTPException(401, "Неверный логин или пароль")
```

`LoginRequest` schema: `{login: str, password: str}` (not email anymore).

JWT payload for admin: `{role: "admin", exp: ...}`
JWT payload for staff: `{role: "staff", department_id: int, department_name: str, exp: ...}`

Remove `/me` endpoint — replace with a simple token verification endpoint if needed, or remove entirely (frontend can decode JWT or store role info from login response).

### 2.4 Rewrite `backend/app/schemas/user.py` → rename to `backend/app/schemas/auth.py`

Delete old file, create new:
```python
from pydantic import BaseModel

class LoginRequest(BaseModel):
    login: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    role: str
    department_id: int | None = None
    department_name: str | None = None
```

---

## Phase 3: Backend Schemas

### 3.1 Modify `backend/app/schemas/department.py`

**DepartmentCreate** — add:
```python
login: str | None = None
password: str | None = None
```

**DepartmentUpdate** — add:
```python
login: str | None = None
password: str | None = None
```

**DepartmentResponse** — add:
```python
login: str | None = None
```
(Never expose password_hash)

### 3.2 Modify `backend/app/schemas/application.py`

**ApplicationResponse (the full detail schema):**
- Replace `student_id: int` with `student_external_id: str`
- `student_name` stays
- Add `student_email: str | None = None`

**ApplicationBrief:**
- `student_name` stays (already there)

**AttachmentResponse:**
- Remove `uploaded_by_id: int` field

**ApplicationResponseOut:**
- Replace `staff_id: int` and `staff_name: str | None` with `department_name: str | None`

---

## Phase 4: Backend Routers

### 4.1 Modify `backend/app/routers/departments.py`

- Replace `Depends(require_role(UserRole.ADMIN))` with `Depends(require_admin)`
- In `create_department`: hash the password from `data.password` and store in `department.password_hash`, store `data.login` in `department.login`
- In `update_department`: allow updating login/password
- Remove imports of `User`, `UserRole`

### 4.2 Modify `backend/app/routers/services.py`

- Replace `Depends(require_role(UserRole.STAFF, UserRole.ADMIN))` with `Depends(require_staff_or_admin)`
- For staff: get `department_id` from JWT payload (`auth["department_id"]`) instead of `current_user.department_id`
- For create: if staff, force `department_id` from JWT (don't trust client). If admin, accept from request body.
- Remove imports of `User`, `UserRole`

### 4.3 Rewrite `backend/app/routers/applications.py`

This is the most complex change.

**POST `/` (create application)** — now PUBLIC (no auth):
- Accept `student_external_id`, `student_name`, `student_email` as Form fields alongside `service_id`, `form_data`, `files`
- No auth dependency
- Create Application with the student string fields instead of student_id FK
- Attachment: no `uploaded_by_id`

**GET `/` (list applications):**
- For student: accept `student_external_id` as query param, filter by it. No auth needed.
- For staff/admin: require auth, filter by department (from JWT) or show all (admin).
- Need to distinguish: if request has JWT → staff/admin mode. If `student_external_id` query param → student mode.

**GET `/{id}` (detail):**
- For student: accept `student_external_id` as query param, verify it matches the application's student_external_id.
- For staff/admin: require JWT, verify access.

**PATCH `/{id}/status`:**
- Require staff_or_admin auth (from JWT)

**POST `/{id}/respond`:**
- Require staff_or_admin auth
- Create ApplicationResponse with `department_id` from JWT (for staff) or from the application's service's department (for admin)
- Attachment: no `uploaded_by_id`

**Update helper functions:**
- `_build_application_response`: use `app.student_name` directly (not `app.student.full_name`), use `resp.department.name` instead of `resp.staff.full_name`
- `_build_brief`: use `app.student_name` directly
- Remove all references to User model

### 4.4 Modify `backend/app/main.py`

- Remove `import app.models` if still needed for model registration (check — it's needed for `Base.metadata.create_all`)
- The import stays, but ensure it doesn't fail now that User is gone

---

## Phase 5: Backend Cleanup

### 5.1 Delete `backend/app/models/user.py`
### 5.2 Delete `backend/app/schemas/user.py` (replaced by `auth.py`)
### 5.3 Update `.env.dist`

Add:
```
ADMIN_PASSWORD=changeme
```

---

## Phase 6: Frontend Types & API Client

### 6.1 Modify `frontend/src/types/index.ts`

- Remove `User` interface (or replace with simpler `AuthInfo`)
- Remove `UserRole` type
- Change `TokenResponse` to match new backend: `{access_token, role, department_id?, department_name?}`
- Add `StudentInfo` interface: `{student_external_id: string, student_name: string, student_email: string}`
- Update `AttachmentInfo`: remove `uploaded_by_id`
- Update `ApplicationResponseInfo`: replace `staff_id`/`staff_name` with `department_name`
- Update `ApplicationDetail`: replace `student_id` with `student_external_id`, add `student_email`
- Update `Department`: add `login: string | null`

### 6.2 Modify `frontend/src/api/client.ts`

- Keep Bearer token injection (still used for staff/admin)
- On 401: redirect to `/login` only if current path starts with `/staff` or `/admin`. Student pages don't need auth.

---

## Phase 7: Frontend Auth Context → Split into AuthContext + StudentContext

### 7.1 Rewrite `frontend/src/context/AuthContext.tsx`

Strip down to staff/admin auth only:
- Remove `register` function
- `login(loginStr: string, password: string)` → calls `POST /api/auth/login` with `{login, password}`
- Store `token`, `role`, `department_id`, `department_name` in localStorage
- No more `User` object; replace with `AuthInfo: {role, department_id?, department_name?}`
- `isAuthenticated` checks for token presence

### 7.2 Create `frontend/src/context/StudentContext.tsx`

New file:
- On mount, parse URL query params: `student_id`, `student_name`, `student_email`
- Store in context and sessionStorage (so it persists during navigation)
- Provide `useStudent()` hook returning `{studentExternalId, studentName, studentEmail} | null`

---

## Phase 8: Frontend Routing (App.tsx)

### 8.1 Rewrite `frontend/src/App.tsx`

**Route structure:**
- Student routes (`/departments`, `/departments/:id`, `/apply/:serviceId`, `/applications`, `/applications/:id`) are PUBLIC — no ProtectedRoute wrapper. Wrap in `AppLayout` with student nav.
- Staff routes (`/staff`, `/staff/applications/:id`, `/staff/services`) — ProtectedRoute (requires auth + role=staff)
- Admin routes (`/admin/departments`) — ProtectedRoute (requires auth + role=admin)
- `/login` — GuestRoute (only for staff/admin)
- Remove `/register` route entirely
- Remove `RegisterPage` import
- `/` home redirect: if authenticated staff → `/staff`, if admin → `/admin/departments`, otherwise → `/departments`

**Remove:**
- `GuestRoute` can remain or be simplified
- `ProtectedRoute` stays for staff/admin routes

**Add:**
- Wrap entire app (or student routes) in `<StudentProvider>` that reads query params

---

## Phase 9: Frontend Pages

### 9.1 Delete `frontend/src/pages/auth/RegisterPage.tsx`

### 9.2 Rewrite `frontend/src/pages/auth/LoginPage.tsx`

- Change from email+password to login+password
- Fields: "Логин" (text input, not email type) and "Пароль"
- Remove "Нет аккаунта? Зарегистрироваться" link
- Use `login(loginStr, password)` from AuthContext

### 9.3 Modify `frontend/src/pages/student/ServiceApplyPage.tsx`

- Get student data from `useStudent()` context
- Send `student_external_id`, `student_name`, `student_email` as Form fields in the multipart request
- No auth token needed (student requests are public)

### 9.4 Modify `frontend/src/pages/student/ApplicationsPage.tsx`

- Get `studentExternalId` from `useStudent()` context
- Pass it as query param: `GET /api/applications/?student_external_id=X`
- No auth required

### 9.5 Modify `frontend/src/pages/student/ApplicationDetailPage.tsx`

- Get `studentExternalId` from `useStudent()` context
- Pass as query param: `GET /api/applications/{id}?student_external_id=X`
- No auth required

### 9.6 Modify `frontend/src/pages/student/DepartmentsPage.tsx` and `DepartmentDetailPage.tsx`

- These are already fetching public endpoints (GET departments/services)
- Remove any auth dependency if present (they shouldn't have any, but verify)

### 9.7 Modify `frontend/src/pages/staff/ManageServicesPage.tsx`

- Replace `useAuth()` to get `department_id` from new auth context: `auth.department_id`
- Minimal changes otherwise

### 9.8 Modify `frontend/src/pages/staff/StaffDashboardPage.tsx`

- No changes needed (already just fetches `/applications/` — backend will filter by JWT)

### 9.9 Modify `frontend/src/pages/staff/StaffApplicationDetailPage.tsx`

- In responses display: show `department_name` instead of `staff_name`
- `resp.staff_name` → `resp.department_name`

### 9.10 Modify `frontend/src/pages/admin/AdminDepartmentsPage.tsx`

- Add login/password fields to the create/edit dialog
- Update form state to include `login`, `password`
- Send them in the API request body

### 9.11 Modify `frontend/src/components/shared/app-layout.tsx`

- For student: show nav without logout button, show student name from `useStudent()`
- For staff/admin: keep current behavior (show role name, logout button)
- Determine mode: if `useAuth().isAuthenticated` → staff/admin mode, else → student mode

---

## Phase 10: Database Migration

Since the project uses `Base.metadata.create_all()` (no Alembic), the DB schema change requires either:
- Dropping and recreating the DB (acceptable for dev), OR
- Manual SQL migration

The `create_all` call won't drop existing tables or columns. For a clean start, drop the database and let it recreate.

If existing data matters, manual SQL:
```sql
-- Add columns to departments
ALTER TABLE departments ADD COLUMN login VARCHAR(100) UNIQUE;
ALTER TABLE departments ADD COLUMN password_hash VARCHAR(255);

-- Modify applications
ALTER TABLE applications DROP FOREIGN KEY <fk_name>;
ALTER TABLE applications DROP COLUMN student_id;
ALTER TABLE applications ADD COLUMN student_external_id VARCHAR(255) NOT NULL;
ALTER TABLE applications ADD COLUMN student_name VARCHAR(255) NOT NULL;
ALTER TABLE applications ADD COLUMN student_email VARCHAR(255);

-- Modify attachments
ALTER TABLE attachments DROP FOREIGN KEY <fk_for_uploaded_by_id>;
ALTER TABLE attachments DROP COLUMN uploaded_by_id;

-- Modify application_responses
ALTER TABLE application_responses DROP FOREIGN KEY <fk_for_staff_id>;
ALTER TABLE application_responses DROP COLUMN staff_id;
ALTER TABLE application_responses ADD COLUMN department_id INTEGER NOT NULL REFERENCES departments(id);

-- Drop users table
DROP TABLE users;
```

---

## Implementation Order

Execute in this order to keep things compiling at each step:

1. **Backend models** (Phase 1) — modify Department, Application, Attachment, ApplicationResponse; delete User
2. **Backend config** (Phase 2.1) — add ADMIN_PASSWORD
3. **Backend auth infrastructure** (Phase 2.2-2.4) — rewrite dependencies, auth router, schemas
4. **Backend schemas** (Phase 3) — update department and application schemas
5. **Backend routers** (Phase 4) — update departments, services, applications routers
6. **Backend main.py** cleanup (Phase 4.4)
7. **Frontend types** (Phase 6.1)
8. **Frontend API client** (Phase 6.2)
9. **Frontend contexts** (Phase 7) — rewrite AuthContext, create StudentContext
10. **Frontend App.tsx** (Phase 8)
11. **Frontend pages** (Phase 9) — update all pages
12. **.env.dist** update (Phase 5.3)
13. **Test the full flow**

---

## Files Changed Summary

### Backend — Delete:
- `backend/app/models/user.py`
- `backend/app/schemas/user.py`

### Backend — Create:
- `backend/app/schemas/auth.py`

### Backend — Modify:
- `backend/app/models/department.py`
- `backend/app/models/application.py`
- `backend/app/models/__init__.py`
- `backend/app/config.py`
- `backend/app/dependencies.py` (full rewrite)
- `backend/app/routers/auth.py` (full rewrite)
- `backend/app/routers/departments.py`
- `backend/app/routers/services.py`
- `backend/app/routers/applications.py` (heavy changes)
- `backend/app/main.py` (minor)

### Frontend — Delete:
- `frontend/src/pages/auth/RegisterPage.tsx`

### Frontend — Create:
- `frontend/src/context/StudentContext.tsx`

### Frontend — Modify:
- `frontend/src/types/index.ts`
- `frontend/src/api/client.ts`
- `frontend/src/context/AuthContext.tsx` (full rewrite)
- `frontend/src/App.tsx` (significant changes)
- `frontend/src/pages/auth/LoginPage.tsx`
- `frontend/src/pages/student/ServiceApplyPage.tsx`
- `frontend/src/pages/student/ApplicationsPage.tsx`
- `frontend/src/pages/student/ApplicationDetailPage.tsx`
- `frontend/src/pages/staff/ManageServicesPage.tsx`
- `frontend/src/pages/staff/StaffApplicationDetailPage.tsx`
- `frontend/src/pages/admin/AdminDepartmentsPage.tsx`
- `frontend/src/components/shared/app-layout.tsx`
- `.env.dist`

**Total: ~25 files touched (2 deleted, 2 created, ~21 modified)**
