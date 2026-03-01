import uuid
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from app.config import settings
from app.database import get_db
from app.dependencies import require_admin
from app.models.teacher import Teacher

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

def _sso_headers() -> dict:
    return {"X-Service-Secret": settings.SSO_SERVICE_SECRET}


def _sso_check_username(username: str) -> bool:
    try:
        resp = httpx.get(
            f"{settings.SSO_API_URL}/api/users/check-username",
            params={"username": username},
            headers=_sso_headers(),
            timeout=10,
        )
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="SSO недоступен: не удалось проверить логин")
    if resp.status_code != 200:
        try:
            detail = resp.json().get("detail", "Ошибка проверки логина в SSO")
        except ValueError:
            detail = "Ошибка проверки логина в SSO"
        raise HTTPException(status_code=400, detail=detail)
    return bool(resp.json().get("available", False))


def _sso_fetch_teacher_users() -> dict[str, dict]:
    try:
        resp = httpx.get(
            f"{settings.SSO_API_URL}/api/users/",
            params={"app_filter": "traffic"},
            headers=_sso_headers(),
            timeout=10,
        )
    except httpx.RequestError as exc:
        logger.warning("SSO unavailable while fetching teacher users: %s", exc)
        return {}
    if resp.status_code != 200:
        logger.warning("SSO returned non-200 while fetching teacher users: %s", resp.status_code)
        return {}

    try:
        users = resp.json()
    except ValueError:
        return {}

    users_by_entity: dict[str, dict] = {}
    for user in users:
        if user.get("role") != "teacher":
            continue
        entity_id = user.get("entity_id")
        username = user.get("username")
        sso_user_id = user.get("id")
        telegram_linked = bool(user.get("telegram_linked"))
        if isinstance(entity_id, str) and isinstance(username, str):
            users_by_entity[entity_id] = {
                "username": username,
                "sso_user_id": sso_user_id if isinstance(sso_user_id, str) else None,
                "telegram_linked": telegram_linked,
            }
    return users_by_entity


def _sso_create_user(teacher_id: str, username: str, password: str, full_name: str) -> None:
    try:
        resp = httpx.post(
            f"{settings.SSO_API_URL}/api/users/",
            json={
                "username": username,
                "password": password,
                "full_name": full_name,
                "app": "traffic",
                "role": "teacher",
                "entity_id": teacher_id,
            },
            headers=_sso_headers(),
            timeout=10,
        )
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="SSO недоступен: не удалось создать пользователя")
    if resp.status_code not in (200, 201):
        try:
            detail = resp.json().get("detail", "Ошибка создания пользователя в SSO")
        except ValueError:
            detail = "Ошибка создания пользователя в SSO"
        raise HTTPException(status_code=400, detail=detail)


def _sso_delete_user(teacher_id: str) -> None:
    try:
        httpx.delete(
            f"{settings.SSO_API_URL}/api/users/by-entity/{teacher_id}",
            params={"app": "traffic"},
            headers=_sso_headers(),
            timeout=10,
        )
    except httpx.RequestError as exc:
        logger.warning("Failed to delete SSO user by entity %s: %s", teacher_id, exc)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/")
def list_teachers(db: DBSession = Depends(get_db), _: dict = Depends(require_admin)):
    teachers = db.query(Teacher).order_by(Teacher.created_at).all()
    users_by_entity = _sso_fetch_teacher_users()
    return [_serialize(t, users_by_entity.get(t.id)) for t in teachers]


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

    users_by_entity = _sso_fetch_teacher_users()
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


def _serialize(t: Teacher, sso_user: dict | None = None) -> dict:
    return {
        "id": t.id,
        "username": sso_user["username"] if sso_user else None,
        "sso_user_id": sso_user["sso_user_id"] if sso_user else None,
        "telegram_linked": sso_user["telegram_linked"] if sso_user else False,
        "full_name": t.full_name,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }
