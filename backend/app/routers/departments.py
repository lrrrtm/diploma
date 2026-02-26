from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Department, User, UserRole
from app.schemas.department import (
    DepartmentCreate,
    DepartmentUpdate,
    DepartmentResponse,
    DepartmentWithServicesResponse,
)
from app.dependencies import get_current_user, require_role

router = APIRouter()


@router.get("/", response_model=list[DepartmentResponse])
def list_departments(db: Session = Depends(get_db)):
    departments = db.query(Department).order_by(Department.name).all()
    return [DepartmentResponse.model_validate(d) for d in departments]


@router.get("/{department_id}", response_model=DepartmentWithServicesResponse)
def get_department(department_id: int, db: Session = Depends(get_db)):
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
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    department = Department(name=data.name, description=data.description)
    db.add(department)
    db.commit()
    db.refresh(department)
    return DepartmentResponse.model_validate(department)


@router.put("/{department_id}", response_model=DepartmentResponse)
def update_department(
    department_id: int,
    data: DepartmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
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
    department_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    department = db.query(Department).filter(Department.id == department_id).first()
    if not department:
        raise HTTPException(status_code=404, detail="Структура не найдена")
    db.delete(department)
    db.commit()
