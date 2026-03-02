from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.executor import Executor
from app.schemas.executor import ExecutorCreate, ExecutorOut
from app.dependencies import require_staff
from poly_shared.clients.sso_client import SSOClient
from poly_shared.errors import UpstreamRejected, UpstreamUnavailable

router = APIRouter()


# ---------------------------------------------------------------------------
# SSO helpers
# ---------------------------------------------------------------------------

def _sso_create_executor(executor_id: str, username: str, password: str, name: str) -> None:
    client = SSOClient(
        base_url=settings.SSO_API_URL,
        service_secret=settings.SERVICES_SSO_SERVICE_SECRET,
    )
    try:
        client.provision_services_executor(
            username=username,
            password=password,
            full_name=name,
            entity_id=executor_id,
        )
    except UpstreamUnavailable:
        raise HTTPException(status_code=502, detail="SSO недоступен: не удалось создать пользователя")
    except UpstreamRejected as exc:
        raise HTTPException(status_code=400, detail=exc.detail or "Ошибка создания пользователя в SSO")


def _sso_delete_by_entity(entity_id: str) -> None:
    client = SSOClient(
        base_url=settings.SSO_API_URL,
        service_secret=settings.SERVICES_SSO_SERVICE_SECRET,
    )
    try:
        client.delete_user_by_entity(entity_id=entity_id, app="services")
    except (UpstreamUnavailable, UpstreamRejected):
        # Entity is already removed in local DB; keep API operation idempotent.
        return


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
