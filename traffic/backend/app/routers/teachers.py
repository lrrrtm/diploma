import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session as DBSession

from app.config import settings
from app.database import get_db
from app.dependencies import require_admin, require_admin_or_service
from app.jobs.teacher_sync import (
    get_teacher_sync_status,
    is_teacher_sync_running,
    trigger_teacher_sync_now,
)
from app.models.teacher import Teacher
from poly_shared.clients.sso_client import SSOClient
from poly_shared.errors import UpstreamRejected, UpstreamUnavailable

router = APIRouter()
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CreateTeacherRequest(BaseModel):
    username: str
    password: str
    full_name: str


# ---------------------------------------------------------------------------
# SSO helpers
# ---------------------------------------------------------------------------

def _sso_check_username(username: str) -> bool:
    client = SSOClient(
        base_url=settings.SSO_API_URL,
        service_secret=settings.TRAFFIC_SSO_SERVICE_SECRET,
    )
    try:
        return client.check_username(username)
    except UpstreamUnavailable:
        raise HTTPException(status_code=502, detail="SSO недоступен: не удалось проверить логин")
    except UpstreamRejected as exc:
        raise HTTPException(status_code=400, detail=exc.detail or "Ошибка проверки логина в SSO")


def _sso_fetch_teacher_users(
    *,
    strict: bool = False,
    entity_ids: list[str] | None = None,
    search: str | None = None,
) -> dict[str, dict]:
    if entity_ids is not None and len(entity_ids) == 0:
        return {}

    client = SSOClient(
        base_url=settings.SSO_API_URL,
        service_secret=settings.TRAFFIC_SSO_SERVICE_SECRET,
    )
    try:
        users = client.list_users(
            app_filter="traffic",
            role_filter="teacher",
            entity_ids=entity_ids,
            search=search,
        )
    except (UpstreamUnavailable, UpstreamRejected) as exc:
        if strict:
            if isinstance(exc, UpstreamUnavailable):
                raise HTTPException(status_code=502, detail="SSO недоступен")
            raise HTTPException(status_code=400, detail=exc.detail or "Ошибка получения пользователей SSO")
        logger.warning("SSO unavailable while fetching teacher users: %s", exc)
        return {}

    users_by_entity: dict[str, dict] = {}
    for user in users:
        entity_id = user.get("entity_id")
        username = user.get("username")
        sso_user_id = user.get("id")
        telegram_linked = bool(user.get("telegram_linked"))
        if isinstance(entity_id, str):
            users_by_entity[entity_id] = {
                "username": username if isinstance(username, str) else None,
                "sso_user_id": sso_user_id if isinstance(sso_user_id, str) else None,
                "telegram_linked": telegram_linked,
            }
    return users_by_entity


def _sso_create_user(teacher_id: str, username: str, password: str, full_name: str) -> None:
    client = SSOClient(
        base_url=settings.SSO_API_URL,
        service_secret=settings.TRAFFIC_SSO_SERVICE_SECRET,
    )
    try:
        client.provision_traffic_teacher(
            username=username,
            password=password,
            full_name=full_name,
            entity_id=teacher_id,
        )
    except UpstreamUnavailable:
        raise HTTPException(status_code=502, detail="SSO недоступен: не удалось создать пользователя")
    except UpstreamRejected as exc:
        raise HTTPException(status_code=400, detail=exc.detail or "Ошибка создания пользователя в SSO")


def _sso_delete_user(teacher_id: str) -> None:
    client = SSOClient(
        base_url=settings.SSO_API_URL,
        service_secret=settings.TRAFFIC_SSO_SERVICE_SECRET,
    )
    try:
        client.delete_user_by_entity(entity_id=teacher_id, app="traffic")
    except (UpstreamUnavailable, UpstreamRejected) as exc:
        logger.warning("Failed to delete SSO user by entity %s: %s", teacher_id, exc)


def _sso_unlink_telegram(sso_user_id: str) -> None:
    client = SSOClient(
        base_url=settings.SSO_API_URL,
        service_secret=settings.TRAFFIC_SSO_SERVICE_SECRET,
    )
    try:
        client.unlink_user_telegram(user_id=sso_user_id)
    except UpstreamUnavailable:
        raise HTTPException(status_code=502, detail="SSO недоступен: не удалось отвязать Telegram")
    except UpstreamRejected as exc:
        raise HTTPException(status_code=400, detail=exc.detail or "Ошибка отвязки Telegram в SSO")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/")
def list_teachers(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
    search: str | None = None,
    db: DBSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    teachers_query = db.query(Teacher)

    normalized_search = search.strip().lower() if isinstance(search, str) else ""
    if normalized_search:
        pattern = f"%{normalized_search}%"
        sso_matches = _sso_fetch_teacher_users(search=normalized_search)
        matched_entity_ids = list(sso_matches.keys())
        if matched_entity_ids:
            teachers_query = teachers_query.filter(
                or_(
                    func.lower(Teacher.full_name).like(pattern),
                    Teacher.id.in_(matched_entity_ids),
                )
            )
        else:
            teachers_query = teachers_query.filter(func.lower(Teacher.full_name).like(pattern))

    total = teachers_query.count()
    teachers = (
        teachers_query
        .order_by(Teacher.created_at, Teacher.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    entity_ids = [teacher.id for teacher in teachers]
    users_by_entity = _sso_fetch_teacher_users(entity_ids=entity_ids)

    return {
        "items": [_serialize(t, users_by_entity.get(t.id)) for t in teachers],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/check-username")
def check_username(username: str, _: dict = Depends(require_admin)):
    available = _sso_check_username(username=username)
    return {"available": available}


@router.get("/{teacher_id}/telegram-register-link")
def get_telegram_register_link(
    teacher_id: str,
    db: DBSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    teacher = db.get(Teacher, teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Преподаватель не найден")

    if not settings.TELEGRAM_BOT_USERNAME:
        raise HTTPException(status_code=400, detail="TELEGRAM_BOT_USERNAME не настроен")

    users_by_entity = _sso_fetch_teacher_users(entity_ids=[teacher_id])
    user_info = users_by_entity.get(teacher_id)
    if not user_info or not user_info.get("sso_user_id"):
        raise HTTPException(status_code=404, detail="Учётка преподавателя в SSO не найдена")

    sso_user_id = user_info["sso_user_id"]
    link = f"https://t.me/{settings.TELEGRAM_BOT_USERNAME}?start=register_{sso_user_id}"
    return {"link": link, "sso_user_id": sso_user_id}


@router.post("/")
def create_teacher(
    data: CreateTeacherRequest,
    db: DBSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    if not _sso_check_username(data.username):
        raise HTTPException(status_code=400, detail="Пользователь с таким логином уже существует")

    teacher = Teacher(
        id=str(uuid.uuid4()),
        full_name=data.full_name,
    )
    db.add(teacher)
    db.flush()  # persist teacher.id without committing yet

    _sso_create_user(teacher.id, data.username, data.password, data.full_name)

    db.commit()
    return _serialize(teacher)


@router.delete("/{teacher_id}")
def delete_teacher(
    teacher_id: str,
    db: DBSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    teacher = db.get(Teacher, teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Преподаватель не найден")
    db.delete(teacher)
    db.commit()
    _sso_delete_user(teacher_id)
    return {"status": "deleted"}


@router.delete("/{teacher_id}/telegram-link")
def unlink_teacher_telegram(
    teacher_id: str,
    db: DBSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    teacher = db.get(Teacher, teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Преподаватель не найден")

    users_by_entity = _sso_fetch_teacher_users(strict=True, entity_ids=[teacher_id])
    user_info = users_by_entity.get(teacher_id)
    sso_user_id = user_info.get("sso_user_id") if isinstance(user_info, dict) else None
    if not isinstance(sso_user_id, str):
        raise HTTPException(status_code=404, detail="Учётка преподавателя в SSO не найдена")

    _sso_unlink_telegram(sso_user_id)
    return {"status": "unlinked"}


@router.get("/sync/status")
async def teacher_sync_status(_: dict = Depends(require_admin_or_service)):
    return get_teacher_sync_status()


@router.post("/sync/run", status_code=202)
async def teacher_sync_run(_: dict = Depends(require_admin_or_service)):
    if is_teacher_sync_running():
        raise HTTPException(status_code=409, detail="Синхронизация уже выполняется")
    started = trigger_teacher_sync_now()
    if not started:
        raise HTTPException(status_code=409, detail="Синхронизация уже запущена")
    return {
        "status": "started",
        "detail": "Ручная синхронизация запущена",
        "sync": get_teacher_sync_status(),
    }


def _serialize(t: Teacher, sso_user: dict | None = None) -> dict:
    return {
        "id": t.id,
        "ruz_teacher_id": t.ruz_teacher_id,
        "username": sso_user["username"] if sso_user else None,
        "sso_user_id": sso_user["sso_user_id"] if sso_user else None,
        "telegram_linked": sso_user["telegram_linked"] if sso_user else False,
        "full_name": t.full_name,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }
