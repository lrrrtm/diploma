from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from passlib.context import CryptContext

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
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


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
        login=data.login,
        password_hash=pwd_context.hash(data.password) if data.password else None,
    )
    db.add(department)
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
    if data.login is not None:
        department.login = data.login
    if data.password is not None:
        department.password_hash = pwd_context.hash(data.password)

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
