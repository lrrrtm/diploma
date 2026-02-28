import httpx
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

router = APIRouter()


# ---------------------------------------------------------------------------
# SSO helpers
# ---------------------------------------------------------------------------

def _sso_headers() -> dict:
    return {"X-Service-Secret": settings.SSO_SERVICE_SECRET}


def _sso_create_staff(dept_id: str, username: str, password: str, dept_name: str) -> None:
    resp = httpx.post(
        f"{settings.SSO_API_URL}/api/users/",
        json={
            "username": username,
            "password": password,
            "full_name": dept_name,
            "app": "services",
            "role": "staff",
            "entity_id": dept_id,
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
