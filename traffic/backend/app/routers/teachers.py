import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from app.config import settings
from app.database import get_db
from app.dependencies import require_admin
from app.models.teacher import Teacher

router = APIRouter()


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


def _sso_create_user(teacher_id: str, username: str, password: str, full_name: str) -> None:
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
    if resp.status_code not in (200, 201):
        detail = resp.json().get("detail", "Ошибка создания пользователя в SSO")
        raise HTTPException(status_code=400, detail=detail)


def _sso_delete_user(teacher_id: str) -> None:
    httpx.delete(
        f"{settings.SSO_API_URL}/api/users/by-entity/{teacher_id}",
        params={"app": "traffic"},
        headers=_sso_headers(),
        timeout=10,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/check-username")
def check_username(
    username: str,
    _: dict = Depends(require_admin),
):
    """Proxy username availability check to SSO."""
    try:
        resp = httpx.get(
            f"{settings.SSO_API_URL}/api/users/check-username",
            params={"username": username},
            headers=_sso_headers(),
            timeout=10,
        )
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass
    return {"available": True}  # fallback: let backend reject on duplicate


@router.get("/")
def list_teachers(db: DBSession = Depends(get_db), _: dict = Depends(require_admin)):
    teachers = db.query(Teacher).order_by(Teacher.created_at).all()
    return [_serialize(t) for t in teachers]


@router.post("/")
def create_teacher(
    data: CreateTeacherRequest,
    db: DBSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
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


def _serialize(t: Teacher) -> dict:
    return {
        "id": t.id,
        "full_name": t.full_name,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }
