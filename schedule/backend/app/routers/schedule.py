import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query, status

from app.config import settings

router = APIRouter()

HEADERS = {"Accept": "application/json", "User-Agent": "Polytech-Schedule/1.0"}


async def _ruz_get(path: str, params: dict | None = None) -> dict | list:
    url = f"{settings.RUZ_BASE_URL}{path}"
    async with httpx.AsyncClient(timeout=settings.REQUEST_TIMEOUT_SECONDS) as client:
        resp = await client.get(url, params=params, headers=HEADERS)
    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"RUZ API returned HTTP {resp.status_code} for {path}",
        )
    return resp.json()


async def _resolve_group_ids(faculty_abbr: str, group_name: str) -> tuple[int, int]:
    faculties_data = await _ruz_get("/faculties")
    faculties = faculties_data.get("faculties", [])

    faculty = next((f for f in faculties if f.get("abbr") == faculty_abbr), None)
    if not faculty:
        faculty = next(
            (f for f in faculties if str(f.get("abbr", "")).lower() == faculty_abbr.lower()),
            None,
        )
    if not faculty:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Faculty with abbr '{faculty_abbr}' not found",
        )

    groups_data = await _ruz_get(f"/faculties/{faculty['id']}/groups")
    groups = groups_data.get("groups", [])
    group = next((g for g in groups if g.get("name") == group_name), None)
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Group '{group_name}' not found in faculty '{faculty_abbr}'",
        )

    return int(faculty["id"]), int(group["id"])


def _normalize_date(raw: str) -> str:
    return raw.replace(".", "-")


def _fmt_time(time_str: str) -> str:
    return time_str or ""


@router.get("/buildings")
async def get_buildings():
    return await _ruz_get("/buildings")


@router.get("/buildings/{building_id}/rooms")
async def get_rooms(building_id: int):
    try:
        return await _ruz_get(f"/buildings/{building_id}/rooms")
    except HTTPException as exc:
        if "HTTP 404" in str(exc.detail):
            raise HTTPException(status_code=404, detail="Building not found")
        raise


@router.get("/buildings/{building_id}/rooms/{room_id}/scheduler")
async def get_room_schedule(building_id: int, room_id: int, date: str | None = None):
    params = {"date": date} if date else None
    try:
        return await _ruz_get(f"/buildings/{building_id}/rooms/{room_id}/scheduler", params=params)
    except HTTPException as exc:
        if "HTTP 404" in str(exc.detail):
            raise HTTPException(status_code=404, detail="Room not found")
        raise


@router.get("/teachers")
async def get_teachers():
    return await _ruz_get("/teachers")


@router.get("/resolve-group")
async def resolve_group(
    faculty_abbr: str = Query(...),
    group_name: str = Query(...),
):
    faculty_id, group_id = await _resolve_group_ids(faculty_abbr, group_name)
    return {"faculty_id": faculty_id, "group_id": group_id}


@router.get("")
async def get_group_schedule(
    group_id: Optional[int] = Query(None),
    faculty_abbr: Optional[str] = Query(None),
    group_name: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
):
    if group_id is None:
        if not faculty_abbr or not group_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Provide group_id or both faculty_abbr and group_name",
            )
        _, group_id = await _resolve_group_ids(faculty_abbr, group_name)

    if date is None:
        date = datetime.date.today().isoformat()

    data = await _ruz_get(f"/scheduler/{group_id}", params={"date": date})
    week = data.get("week", {})
    days_raw = data.get("days", [])

    days: list[dict] = []
    for day in days_raw:
        lessons: list[dict] = []
        for lesson in day.get("lessons", []):
            type_obj = lesson.get("typeObj") or {}
            teachers = [
                {
                    "id": teacher.get("id"),
                    "full_name": teacher.get("full_name", ""),
                }
                for teacher in (lesson.get("teachers") or [])
            ]
            auditories = [
                {
                    "id": aud.get("id"),
                    "name": aud.get("name", ""),
                    "building": (aud.get("building") or {}).get("name", ""),
                }
                for aud in (lesson.get("auditories") or [])
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
