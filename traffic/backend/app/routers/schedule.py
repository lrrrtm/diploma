import httpx
from fastapi import APIRouter, HTTPException

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


@router.get("/buildings")
async def get_buildings():
    return await _schedule_get("/api/schedule/buildings")


@router.get("/buildings/{building_id}/rooms")
async def get_rooms(building_id: int):
    return await _schedule_get(f"/api/schedule/buildings/{building_id}/rooms")


@router.get("/buildings/{building_id}/rooms/{room_id}/scheduler")
async def get_room_schedule(building_id: int, room_id: int, date: str | None = None):
    params = {"date": date} if date else None
    return await _schedule_get(
        f"/api/schedule/buildings/{building_id}/rooms/{room_id}/scheduler",
        params=params,
    )
