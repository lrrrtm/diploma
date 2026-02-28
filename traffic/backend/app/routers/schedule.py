from fastapi import APIRouter, HTTPException
import httpx

from app.config import settings

router = APIRouter()

RUZ = settings.RUZ_BASE_URL
HEADERS = {"User-Agent": "Polytech-Traffic/1.0"}


@router.get("/buildings")
async def get_buildings():
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{RUZ}/buildings", headers=HEADERS, timeout=10)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="RUZ API unavailable")
    return resp.json()


@router.get("/buildings/{building_id}/rooms")
async def get_rooms(building_id: int):
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{RUZ}/buildings/{building_id}/rooms", headers=HEADERS, timeout=10)
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="Building not found")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="RUZ API unavailable")
    return resp.json()


@router.get("/buildings/{building_id}/rooms/{room_id}/scheduler")
async def get_room_schedule(building_id: int, room_id: int, date: str | None = None):
    params = {}
    if date:
        params["date"] = date
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{RUZ}/buildings/{building_id}/rooms/{room_id}/scheduler",
            params=params,
            headers=HEADERS,
            timeout=10,
        )
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="Room not found")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="RUZ API unavailable")
    return resp.json()
