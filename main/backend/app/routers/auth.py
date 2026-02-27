"""
CAS SSO authentication router.

Development flow (scraping — used when CAS service URL is not registered):
  1. POST /api/auth/login {username, password}
       → GET  https://cas.spbstu.ru/login  (fetch execution token + session cookie)
       → POST https://cas.spbstu.ru/login  (submit credentials)
       → Parse wsAsu JSON from "page-context" script in response HTML
       → Issue our JWT, return {token, student_name, student_email, ws_asu}

Production flow (standard CAS redirect — when service URL is registered with CAS):
  1. GET /api/auth/login  → redirect browser to CAS login page
  2. CAS redirects to CAS_SERVICE_URL?ticket=ST-xxx
  3. GET /api/auth/callback?ticket=ST-xxx → serviceValidate → JWT → redirect to frontend

GET /api/auth/me  → verify JWT, return student info
"""

import json
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, quote

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

from app.config import settings

router = APIRouter()
bearer = HTTPBearer(auto_error=False)

# In-memory credential cache: student_id → (username, password)
# Lost on server restart — user simply re-logs in.
_credential_cache: dict[str, tuple[str, str]] = {}


def cache_credentials(student_id: str, username: str, password: str) -> None:
    _credential_cache[student_id] = (username, password)


def get_cached_credentials(student_id: str) -> tuple[str, str] | None:
    return _credential_cache.get(student_id)


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------


def _create_token(student_id: str, email: str, name: str, study_group_str: str = "", grade_book_number: str = "", faculty_abbr: str = "") -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": student_id,
        "email": email,
        "name": name,
        "study_group_str": study_group_str,
        "grade_book_number": grade_book_number,
        "faculty_abbr": faculty_abbr,
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ---------------------------------------------------------------------------
# CAS scraping helper
# ---------------------------------------------------------------------------


async def _scrape_cas_login(username: str, password: str) -> dict:
    """
    Authenticate against CAS by scraping the login form directly.

    Flow:
      1. GET /login  — grab the execution token and session cookie.
      2. POST /login — submit credentials.
      3. Parse the <script id="page-context"> JSON embedded in the response;
         extract ctx.user.wsAsu for identity data.

    Returns a dict with keys: student_id, email, name, ws_asu.
    Raises HTTP 401 on bad credentials, HTTP 502 on unexpected CAS response.
    """
    login_url = f"{settings.CAS_SERVER}/login"

    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
        # Step 1 — fetch the login page to get the execution token
        get_resp = await client.get(login_url)
        match = re.search(r'name="execution"\s+value="([^"]+)"', get_resp.text)
        if not match:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not parse CAS execution token from login page",
            )
        execution = match.group(1)

        # Step 2 — submit credentials
        post_resp = await client.post(
            login_url,
            data={
                "username": username,
                "password": password,
                "execution": execution,
                "_eventId": "submit",
                "geolocation": "",
            },
        )

    # Step 3 — parse page-context JSON embedded in the response HTML
    ctx_match = re.search(
        r'<script[^>]+id="page-context"[^>]*>\s*(.*?)\s*</script>',
        post_resp.text,
        re.DOTALL,
    )
    if not ctx_match:
        # No page-context means login failed (CAS re-rendered the login form)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid CAS credentials",
        )

    try:
        ctx = json.loads(ctx_match.group(1))
        ws_asu = ctx["user"]["wsAsu"]
    except (json.JSONDecodeError, KeyError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to parse CAS page-context: {exc}",
        )

    first = ws_asu.get("first_name", "")
    last = ws_asu.get("last_name", "")
    middle = ws_asu.get("middle_name", "")
    name = " ".join(part for part in [last, first, middle] if part).strip()
    student_id = str(ws_asu["user_id"])
    email = username if "@" in username else f"{username}@edu.spbstu.ru"

    # Identity fields live inside structure[0] (active record)
    structure = ws_asu.get("structure") or []
    active = next((s for s in structure if s.get("is_active")), structure[0] if structure else {})
    study_group_str = active.get("sub_dep", "")
    grade_book_number = active.get("number", "")
    faculty_abbr = active.get("dep", "")

    return {
        "student_id": student_id,
        "email": email,
        "name": name,
        "study_group_str": study_group_str,
        "grade_book_number": grade_book_number,
        "faculty_abbr": faculty_abbr,
        "ws_asu": ws_asu,
    }


# ---------------------------------------------------------------------------
# Request/response models
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    username: str
    password: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/login")
async def login(body: LoginRequest):
    """
    Authenticate with CAS by scraping the login form.
    Returns a JWT + student identity on success.
    """
    identity = await _scrape_cas_login(body.username, body.password)
    cache_credentials(identity["student_id"], body.username, body.password)
    token = _create_token(
        identity["student_id"],
        identity["email"],
        identity["name"],
        identity["study_group_str"],
        identity["grade_book_number"],
        identity["faculty_abbr"],
    )
    return {
        "token": token,
        "student_id": identity["student_id"],
        "student_name": identity["name"],
        "student_email": identity["email"],
        "study_group_str": identity["study_group_str"],
        "grade_book_number": identity["grade_book_number"],
        "faculty_abbr": identity["faculty_abbr"],
        "ws_asu": identity["ws_asu"],
    }


@router.get("/login")
def cas_login():
    """Redirect the browser to the CAS login page (production SSO flow)."""
    params = urlencode({"service": settings.CAS_SERVICE_URL})
    return RedirectResponse(url=f"{settings.CAS_SERVER}/login?{params}")


@router.get("/callback")
async def cas_callback(ticket: str = Query(...)):
    """
    CAS redirects here after successful SSO login.
    Validates the ticket via serviceValidate, mints a JWT, redirects to frontend.
    """
    validate_url = f"{settings.CAS_SERVER}/serviceValidate"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            validate_url,
            params={"service": settings.CAS_SERVICE_URL, "ticket": ticket},
        )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"CAS serviceValidate returned HTTP {resp.status_code}",
        )

    # Parse CAS XML response inline
    CAS_NS = "http://www.yale.edu/tp/cas"
    root = ET.fromstring(resp.text)
    ns = {"cas": CAS_NS}

    failure = root.find("cas:authenticationFailure", ns)
    if failure is not None:
        code = failure.attrib.get("code", "UNKNOWN")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"CAS authentication failed: {code}",
        )

    success = root.find("cas:authenticationSuccess", ns)
    if success is None:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Unexpected CAS response")

    user_el = success.find("cas:user", ns)
    if user_el is None or not user_el.text:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="CAS response missing <cas:user>")
    email = user_el.text.strip()

    attrs = success.find("cas:attributes", ns)
    name = None
    if attrs is not None:
        cn = attrs.find("cas:cn", ns)
        if cn is not None and cn.text:
            name = cn.text.strip()
    if not name:
        name = email.split("@")[0]

    token = _create_token(student_id=email, email=email, name=name)
    redirect_url = f"{settings.FRONTEND_URL}/?token={quote(token)}"
    return RedirectResponse(url=redirect_url)


@router.get("/me")
def get_me(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    """Return the current student's identity from the JWT. Used by the frontend on load."""
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = _decode_token(credentials.credentials)
    return {
        "student_id": payload["sub"],
        "student_email": payload["email"],
        "student_name": payload["name"],
        "study_group_str": payload.get("study_group_str", ""),
        "grade_book_number": payload.get("grade_book_number", ""),
        "faculty_abbr": payload.get("faculty_abbr", ""),
    }
