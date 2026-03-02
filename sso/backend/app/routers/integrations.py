import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.audit import log_audit, request_context, token_actor
from app.config import settings
from app.routers.auth import decode_token

router = APIRouter()
bearer = HTTPBearer(auto_error=False)


def _require_sso_admin(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict:
    if not credentials:
        log_audit("sso.integrations.auth_denied", reason="missing_bearer", **request_context(request))
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    if payload.get("app") != "sso" or payload.get("role") != "admin":
        log_audit(
            "sso.integrations.auth_denied",
            reason="not_sso_admin",
            **token_actor(payload),
            **request_context(request),
        )
        raise HTTPException(status_code=403, detail="Требуются права SSO-администратора")
    return payload


def _traffic_request(method: str, path: str, timeout: float = 20.0) -> dict:
    url = f"{settings.TRAFFIC_API_URL}{path}"
    try:
        response = httpx.request(
            method,
            url,
            headers={"X-Service-Secret": settings.TRAFFIC_INTERNAL_SERVICE_SECRET},
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
def traffic_teacher_sync_status(
    request: Request,
    caller: dict = Depends(_require_sso_admin),
):
    payload = _traffic_request("GET", "/api/teachers/sync/status")
    log_audit(
        "sso.integrations.traffic_teacher_sync_status",
        **token_actor(caller),
        **request_context(request),
    )
    return payload


@router.post("/traffic/teacher-sync/run", status_code=202)
def traffic_teacher_sync_run(
    request: Request,
    caller: dict = Depends(_require_sso_admin),
):
    payload = _traffic_request("POST", "/api/teachers/sync/run", timeout=30.0)
    log_audit(
        "sso.integrations.traffic_teacher_sync_run",
        **token_actor(caller),
        **request_context(request),
    )
    return payload
