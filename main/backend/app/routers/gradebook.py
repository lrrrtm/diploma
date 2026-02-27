"""
Gradebook router — proxies my.spbstu.ru recordbook API.

GET /api/gradebook
  1. Look up cached CAS credentials (saved during login)
  2. Authenticate against my.spbstu.ru/accounts/basic-login/
  3. Fetch record book data using grade_book_number from the student JWT
  4. Return structured gradebook entries
"""

from collections import defaultdict
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import settings
from app.routers.auth import get_cached_credentials

router = APIRouter()
bearer = HTTPBearer()

MY_SPBSTU = "https://my.spbstu.ru"
_TIMEOUT = 15


def _get_student(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    """Decode main app JWT and return student identity."""
    try:
        payload = jwt.decode(
            credentials.credentials, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return payload


@router.get("")
async def get_gradebook(student: dict = Depends(_get_student)):
    """
    Fetch the student's record book from my.spbstu.ru.
    Uses CAS credentials cached during login.
    """
    grade_book_number = student.get("grade_book_number", "")
    if not grade_book_number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Номер зачётной книжки отсутствует в профиле",
        )

    student_id = student.get("sub", "")
    creds = get_cached_credentials(student_id)
    if not creds:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Сессия истекла. Войдите заново.",
        )
    username, password = creds

    async with httpx.AsyncClient(
        follow_redirects=False,
        timeout=_TIMEOUT,
        headers={"User-Agent": "UniComm/1.0"},
    ) as client:
        # Step 1: GET login page to obtain csrftoken cookie
        login_page = await client.get(f"{MY_SPBSTU}/accounts/basic-login/")
        csrf_token = login_page.cookies.get("csrftoken")
        if not csrf_token:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Не удалось получить CSRF-токен от my.spbstu.ru",
            )

        # Step 2: POST credentials to login
        login_resp = await client.post(
            f"{MY_SPBSTU}/accounts/basic-login/",
            data={
                "csrfmiddlewaretoken": csrf_token,
                "username": username,
                "password": password,
            },
            cookies={"csrftoken": csrf_token},
            headers={
                "Referer": f"{MY_SPBSTU}/accounts/basic-login/",
                "Origin": MY_SPBSTU,
            },
        )

        if login_resp.status_code not in (302, 200):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Неверные данные для входа в my.spbstu.ru",
            )

        session_id = login_resp.cookies.get("sessionid")
        if not session_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Не удалось авторизоваться в my.spbstu.ru",
            )

        # Step 3: Fetch record book data
        rb_resp = await client.post(
            f"{MY_SPBSTU}/science-and-education/recordbook/get_record_book_data_ajax",
            json={"record_book_number": grade_book_number},
            cookies={"csrftoken": csrf_token, "sessionid": session_id},
            headers={
                "X-CSRFToken": csrf_token,
                "Referer": f"{MY_SPBSTU}/science-and-education/recordbook/",
                "Origin": MY_SPBSTU,
            },
        )

    if rb_resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"my.spbstu.ru вернул HTTP {rb_resp.status_code}",
        )

    data = rb_resp.json()
    result = data.get("result", {})

    def _parse_date(date_str: str):
        try:
            return datetime.strptime(date_str.strip(), "%d.%m.%Y")
        except Exception:
            return None

    def _year_label(dt: datetime) -> str:
        start = dt.year if dt.month >= 9 else dt.year - 1
        return f"{start}/{start + 1} уч. год"

    # Group entries by semester number
    semester_map: dict[int, list] = defaultdict(list)
    for entry in result.get("record_book_data", []):
        sem = entry.get("semester") or 0
        semester_map[sem].append(entry)

    # Pair semesters into academic year groups: (1,2)→0, (3,4)→1, (5,6)→2, ...
    # This ensures semester 1 always stays with semester 2 in the same year,
    # regardless of the date the grade was recorded (handles retakes correctly).
    year_idx_map: dict[int, list] = defaultdict(list)
    for sem, entries in semester_map.items():
        group_idx = (sem - 1) // 2 if sem >= 1 else -1
        year_idx_map[group_idx].extend(entries)

    # Derive calendar year label from the minimum (earliest) date in the group
    def _label_for_group(entries: list, idx: int) -> str:
        if idx < 0:
            return "Другое"
        valid = [_parse_date(e.get("date", "")) for e in entries]
        valid = [d for d in valid if d is not None]
        if not valid:
            return f"Период {idx + 1}"
        return _year_label(min(valid))

    sorted_indices = sorted((k for k in year_idx_map if k >= 0), reverse=True)
    result_years = [
        {"label": _label_for_group(year_idx_map[idx], idx), "entries": year_idx_map[idx]}
        for idx in sorted_indices
    ]
    if -1 in year_idx_map:
        result_years.append({"label": "Другое", "entries": year_idx_map[-1]})

    return {
        "orders_type_name": result.get("orders_type_name", ""),
        "academic_years": result_years,
    }
