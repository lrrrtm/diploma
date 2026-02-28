import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.executor import Executor
from app.schemas.executor import ExecutorCreate, ExecutorOut
from app.dependencies import require_staff

router = APIRouter()


# ---------------------------------------------------------------------------
# SSO helpers
# ---------------------------------------------------------------------------

def _sso_headers() -> dict:
    return {"X-Service-Secret": settings.SSO_SERVICE_SECRET}


def _sso_create_executor(executor_id: str, username: str, password: str, name: str) -> None:
    resp = httpx.post(
        f"{settings.SSO_API_URL}/api/users/",
        json={
            "username": username,
            "password": password,
            "full_name": name,
            "app": "services",
            "role": "executor",
            "entity_id": executor_id,
        },
        headers=_sso_headers(),
        timeout=10,
    )
    if resp.status_code not in (200, 201):
        detail = resp.json().get("detail", "Ошибка создания пользователя в SSO")
        raise HTTPException(status_code=400, detail=detail)


def _sso_delete_by_entity(entity_id: str) -> None:
    httpx.delete(
        f"{settings.SSO_API_URL}/api/users/by-entity/{entity_id}",
        params={"app": "services"},
        headers=_sso_headers(),
        timeout=10,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/", response_model=list[ExecutorOut])
def list_executors(
    db: Session = Depends(get_db),
    auth: dict = Depends(require_staff),
):
    return (
        db.query(Executor)
        .filter(Executor.department_id == auth["department_id"])
        .order_by(Executor.created_at.desc())
        .all()
    )


@router.post("/", response_model=ExecutorOut, status_code=201)
def create_executor(
    data: ExecutorCreate,
    db: Session = Depends(get_db),
    auth: dict = Depends(require_staff),
):
    executor = Executor(
        department_id=auth["department_id"],
        name=data.name,
    )
    db.add(executor)
    db.flush()  # get executor.id

    _sso_create_executor(executor.id, data.username, data.password, data.name)

    db.commit()
    db.refresh(executor)
    return executor


@router.delete("/{executor_id}", status_code=204)
def delete_executor(
    executor_id: str,
    db: Session = Depends(get_db),
    auth: dict = Depends(require_staff),
):
    executor = (
        db.query(Executor)
        .filter(Executor.id == executor_id, Executor.department_id == auth["department_id"])
        .first()
    )
    if not executor:
        raise HTTPException(status_code=404, detail="Исполнитель не найден")
    db.delete(executor)
    db.commit()
    _sso_delete_by_entity(executor_id)
