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

    def _academic_year_label(date_str: str) -> str:
        try:
            dt = datetime.strptime(date_str.strip(), "%d.%m.%Y")
            start = dt.year if dt.month >= 9 else dt.year - 1
            return f"{start}/{start + 1} уч. год"
        except Exception:
            return "Другое"

    year_groups: dict[str, list] = defaultdict(list)
    for entry in result.get("record_book_data", []):
        label = _academic_year_label(entry.get("date", ""))
        year_groups[label].append(entry)

    sorted_labels = sorted(
        (k for k in year_groups if k != "Другое"), reverse=True
    )
    if "Другое" in year_groups:
        sorted_labels.append("Другое")

    return {
        "orders_type_name": result.get("orders_type_name", ""),
        "academic_years": [
            {"label": label, "entries": year_groups[label]}
            for label in sorted_labels
        ],
    }
