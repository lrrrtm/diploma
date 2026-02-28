"""
Schedule router — proxies ruz.spbstu.ru API.

GET /api/schedule?faculty_abbr=ИКНК&group_name=5130904/10101&date=2026-02-27
  1. Fetch all faculties, find by abbr.
  2. Fetch groups for that faculty, find by name.
  3. Fetch weekly schedule from RUZ for that group.
  4. Return structured schedule.

GET /api/schedule/resolve-group?faculty_abbr=ИКНК&group_name=5130904/10101
  Returns just {group_id, group_name, faculty_id, faculty_name}.
"""

import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query, status

router = APIRouter()

RUZ_BASE = "https://ruz.spbstu.ru/api/v1/ruz"
_CLIENT_TIMEOUT = 15


# ── RUZ helpers (async) ──────────────────────────────────────────────────────


async def _ruz_get(path: str, params: dict | None = None) -> dict | list:
    url = f"{RUZ_BASE}{path}"
    async with httpx.AsyncClient(timeout=_CLIENT_TIMEOUT) as client:
        resp = await client.get(
            url,
            params=params,
            headers={"Accept": "application/json", "User-Agent": "Polytech/1.0"},
        )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"RUZ API returned HTTP {resp.status_code} for {path}",
        )
    return resp.json()


async def _resolve_group(faculty_abbr: str, group_name: str) -> tuple[int, int]:
    """Returns (faculty_id, group_id). Raises 404 if not found."""
    faculties_data = await _ruz_get("/faculties")
    faculties = faculties_data.get("faculties", [])

    faculty = next((f for f in faculties if f["abbr"] == faculty_abbr), None)
    if not faculty:
        # Try case-insensitive fallback
        faculty = next(
            (f for f in faculties if f["abbr"].lower() == faculty_abbr.lower()), None
        )
    if not faculty:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Faculty with abbr '{faculty_abbr}' not found",
        )

    groups_data = await _ruz_get(f"/faculties/{faculty['id']}/groups")
    groups = groups_data.get("groups", [])

    group = next((g for g in groups if g["name"] == group_name), None)
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Group '{group_name}' not found in faculty '{faculty_abbr}'",
        )

    return faculty["id"], group["id"]


def _normalize_date(raw: str) -> str:
    return raw.replace(".", "-")


def _fmt_time(time_str: str) -> str:
    """'10:00' → '10:00'  (already fine, just guard)"""
    return time_str or ""


# ── Routes ───────────────────────────────────────────────────────────────────


@router.get("/resolve-group")
async def resolve_group(
    faculty_abbr: str = Query(...),
    group_name: str = Query(...),
):
    """Resolve faculty_abbr + group_name → group_id (cached by frontend)."""
    faculty_id, group_id = await _resolve_group(faculty_abbr, group_name)
    return {"faculty_id": faculty_id, "group_id": group_id}


@router.get("")
async def get_schedule(
    group_id: Optional[int] = Query(None),
    faculty_abbr: Optional[str] = Query(None),
    group_name: Optional[str] = Query(None),
    date: Optional[str] = Query(None, description="ISO date YYYY-MM-DD, defaults to today"),
):
    """
    Returns the weekly schedule for a group.
    Supply either group_id directly, or faculty_abbr + group_name for auto-resolution.
    """
    if group_id is None:
        if not faculty_abbr or not group_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Provide group_id or both faculty_abbr and group_name",
            )
        _, group_id = await _resolve_group(faculty_abbr, group_name)

    if date is None:
        date = datetime.date.today().isoformat()

    data = await _ruz_get(f"/scheduler/{group_id}", params={"date": date})

    week = data.get("week", {})
    days_raw = data.get("days", [])

    days = []
    for day in days_raw:
        lessons = []
        for lesson in day.get("lessons", []):
            type_obj = lesson.get("typeObj") or {}
            teachers = [
                {
                    "id": t.get("id"),
                    "full_name": t.get("full_name", ""),
                }
                for t in (lesson.get("teachers") or [])
            ]
            auditories = [
                {
                    "id": a.get("id"),
                    "name": a.get("name", ""),
                    "building": (a.get("building") or {}).get("name", ""),
                }
                for a in (lesson.get("auditories") or [])
            ]
            lessons.append(
                {
                    "time_start": _fmt_time(lesson.get("time_start", "")),
                    "time_end": _fmt_time(lesson.get("time_end", "")),
                    "subject": lesson.get("subject", ""),
                    "subject_short": lesson.get("subject_short", ""),
                    "type_abbr": type_obj.get("abbr", ""),
                    "type_name": type_obj.get("name", ""),
                    "additional_info": lesson.get("additional_info", ""),
                    "teachers": teachers,
                    "auditories": auditories,
                    "webinar_url": lesson.get("webinar_url", ""),
                }
            )
        days.append(
            {
                "weekday": day.get("weekday"),
                "date": _normalize_date(day.get("date", "")),
                "lessons": lessons,
            }
        )

    return {
        "group_id": group_id,
        "week": {
            "date_start": _normalize_date(week.get("date_start", "")),
            "date_end": _normalize_date(week.get("date_end", "")),
            "is_odd": week.get("is_odd", False),
        },
        "days": days,
    }
