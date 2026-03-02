import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import Request


audit_logger = logging.getLogger("polytech.security.audit")


def configure_audit_logging() -> None:
    """Ensure security audit logs are always emitted in JSON."""
    if audit_logger.handlers:
        return

    handler = logging.StreamHandler()
    handler.setLevel(logging.INFO)
    handler.setFormatter(logging.Formatter("%(message)s"))
    audit_logger.addHandler(handler)
    audit_logger.setLevel(logging.INFO)
    audit_logger.propagate = False


def request_context(request: Request | None) -> dict[str, Any]:
    if request is None:
        return {}
    forwarded_for = request.headers.get("x-forwarded-for")
    client_ip = forwarded_for.split(",")[0].strip() if forwarded_for else None
    if not client_ip and request.client:
        client_ip = request.client.host
    return {
        "client_ip": client_ip,
        "user_agent": request.headers.get("user-agent"),
    }


def token_actor(payload: dict[str, Any] | None) -> dict[str, Any]:
    if not payload:
        return {}
    return {
        "actor_user_id": payload.get("sub"),
        "actor_username": payload.get("username"),
        "actor_app": payload.get("app"),
        "actor_role": payload.get("role"),
    }


def service_actor(service_app: str | None) -> dict[str, Any]:
    return {"actor_service_app": service_app}


def log_audit(event: str, **payload: Any) -> None:
    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": event,
        **payload,
    }
    audit_logger.info(json.dumps(record, ensure_ascii=False, default=str))
