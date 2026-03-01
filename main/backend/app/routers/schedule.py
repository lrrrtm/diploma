import httpx
from fastapi import APIRouter, HTTPException, Query

from app.config import settings

router = APIRouter()
TIMEOUT = 15


async def _schedule_get(path: str, params: dict | None = None):
    url = f"{settings.SCHEDULE_API_URL}{path}"
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(url, params=params)
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Schedule API unavailable")

    if resp.status_code != 200:
        detail = None
        try:
            payload = resp.json()
            if isinstance(payload, dict):
                detail = payload.get("detail")
        except ValueError:
            pass
        raise HTTPException(status_code=resp.status_code, detail=detail or "Schedule API error")

    try:
        return resp.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="Invalid response from Schedule API")


@router.get("/resolve-group")
async def resolve_group(
    faculty_abbr: str = Query(...),
    group_name: str = Query(...),
):
    return await _schedule_get(
        "/api/schedule/resolve-group",
        params={"faculty_abbr": faculty_abbr, "group_name": group_name},
    )


@router.get("")
async def get_schedule(
    group_id: int | None = Query(None),
    faculty_abbr: str | None = Query(None),
    group_name: str | None = Query(None),
    date: str | None = Query(None),
):
    params: dict[str, str | int] = {}
    if group_id is not None:
        params["group_id"] = group_id
    if faculty_abbr is not None:
        params["faculty_abbr"] = faculty_abbr
    if group_name is not None:
        params["group_name"] = group_name
    if date is not None:
        params["date"] = date
    return await _schedule_get("/api/schedule", params=params)
