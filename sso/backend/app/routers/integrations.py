import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings
from app.routers.auth import decode_token

router = APIRouter()
bearer = HTTPBearer(auto_error=False)


def _require_sso_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    if payload.get("app") != "sso" or payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Требуются права SSO-администратора")
    return payload


def _traffic_request(method: str, path: str, timeout: float = 20.0) -> dict:
    url = f"{settings.TRAFFIC_API_URL}{path}"
    try:
        response = httpx.request(
            method,
            url,
            headers={"X-Service-Secret": settings.SSO_SERVICE_SECRET},
            timeout=timeout,
        )
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Traffic backend недоступен")

    if response.status_code >= 400:
        detail = "Ошибка запроса к Traffic backend"
        try:
            payload = response.json()
            if isinstance(payload, dict) and isinstance(payload.get("detail"), str):
                detail = payload["detail"]
        except ValueError:
            pass
        raise HTTPException(status_code=response.status_code, detail=detail)

    try:
        payload = response.json()
    except ValueError:
        payload = {}
    return payload if isinstance(payload, dict) else {}


@router.get("/traffic/teacher-sync/status")
def traffic_teacher_sync_status(_: dict = Depends(_require_sso_admin)):
    return _traffic_request("GET", "/api/teachers/sync/status")


@router.post("/traffic/teacher-sync/run", status_code=202)
def traffic_teacher_sync_run(_: dict = Depends(_require_sso_admin)):
    return _traffic_request("POST", "/api/teachers/sync/run", timeout=30.0)
