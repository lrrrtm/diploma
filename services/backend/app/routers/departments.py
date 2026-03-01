from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.models import Department
from app.schemas.department import (
    DepartmentCreate,
    DepartmentUpdate,
    DepartmentResponse,
    DepartmentWithServicesResponse,
)
from app.dependencies import require_admin
from poly_shared.clients.sso_client import SSOClient
from poly_shared.errors import UpstreamRejected, UpstreamUnavailable

router = APIRouter()


# ---------------------------------------------------------------------------
# SSO helpers
# ---------------------------------------------------------------------------

def _sso_create_staff(dept_id: str, username: str, password: str, dept_name: str) -> None:
    client = SSOClient(
        base_url=settings.SSO_API_URL,
        service_secret=settings.SSO_SERVICE_SECRET,
    )
    try:
        client.provision_services_staff(
            username=username,
            password=password,
            full_name=dept_name,
            entity_id=dept_id,
        )
    except UpstreamUnavailable:
        raise HTTPException(status_code=502, detail="SSO недоступен: не удалось создать пользователя")
    except UpstreamRejected as exc:
        raise HTTPException(status_code=400, detail=exc.detail or "Ошибка создания пользователя в SSO")


def _sso_delete_by_entity(entity_id: str) -> None:
    client = SSOClient(
        base_url=settings.SSO_API_URL,
        service_secret=settings.SSO_SERVICE_SECRET,
    )
    try:
        client.delete_user_by_entity(entity_id=entity_id, app="services")
    except (UpstreamUnavailable, UpstreamRejected):
        # Entity is already removed in local DB; keep API operation idempotent.
        return


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/", response_model=list[DepartmentResponse])
def list_departments(db: Session = Depends(get_db)):
    departments = db.query(Department).order_by(Department.name).all()
    return [DepartmentResponse.model_validate(d) for d in departments]


@router.get("/{department_id}", response_model=DepartmentWithServicesResponse)
def get_department(department_id: str, db: Session = Depends(get_db)):
    department = (
        db.query(Department)
        .options(joinedload(Department.services))
        .filter(Department.id == department_id)
        .first()
    )
    if not department:
        raise HTTPException(status_code=404, detail="Структура не найдена")
    return DepartmentWithServicesResponse.model_validate(department)


@router.post("/", response_model=DepartmentResponse, status_code=201)
def create_department(
    data: DepartmentCreate,
    db: Session = Depends(get_db),
    auth: dict = Depends(require_admin),
):
    department = Department(
        name=data.name,
        description=data.description,
    )
    db.add(department)
    db.flush()  # get department.id

    if data.username and data.password:
        _sso_create_staff(department.id, data.username, data.password, data.name)

    db.commit()
    db.refresh(department)
    return DepartmentResponse.model_validate(department)


@router.put("/{department_id}", response_model=DepartmentResponse)
def update_department(
    department_id: str,
    data: DepartmentUpdate,
    db: Session = Depends(get_db),
    auth: dict = Depends(require_admin),
):
    department = db.query(Department).filter(Department.id == department_id).first()
    if not department:
        raise HTTPException(status_code=404, detail="Структура не найдена")

    if data.name is not None:
        department.name = data.name
    if data.description is not None:
        department.description = data.description

    db.commit()
    db.refresh(department)
    return DepartmentResponse.model_validate(department)


@router.delete("/{department_id}", status_code=204)
def delete_department(
    department_id: str,
    db: Session = Depends(get_db),
    auth: dict = Depends(require_admin),
):
    department = db.query(Department).filter(Department.id == department_id).first()
    if not department:
        raise HTTPException(status_code=404, detail="Структура не найдена")
    db.delete(department)
    db.commit()
    _sso_delete_by_entity(department_id)
