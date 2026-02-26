from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.models import Service, Department
from app.schemas.service import ServiceCreate, ServiceUpdate, ServiceResponse
from app.dependencies import require_staff_or_admin

router = APIRouter()


@router.get("/", response_model=list[ServiceResponse])
def list_services(department_id: str | None = None, db: Session = Depends(get_db)):
    query = db.query(Service).filter(Service.is_active == True)
    if department_id:
        query = query.filter(Service.department_id == department_id)
    services = query.order_by(Service.name).all()
    return [ServiceResponse.model_validate(s) for s in services]


@router.get("/{service_id}", response_model=ServiceResponse)
def get_service(service_id: str, db: Session = Depends(get_db)):
    service = db.query(Service).filter(Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Услуга не найдена")
    return ServiceResponse.model_validate(service)


@router.post("/", response_model=ServiceResponse, status_code=201)
def create_service(
    data: ServiceCreate,
    db: Session = Depends(get_db),
    auth: dict = Depends(require_staff_or_admin),
):
    # Staff can only create services for their own department
    department_id = data.department_id
    if auth["role"] == "staff":
        department_id = auth["department_id"]

    # Проверяем, что отдел существует
    department = db.query(Department).filter(Department.id == department_id).first()
    if not department:
        raise HTTPException(status_code=404, detail="Отдел не найден")

    service = Service(
        department_id=department_id,
        name=data.name,
        description=data.description,
        required_fields=[f.model_dump() for f in data.required_fields],
        requires_attachment=data.requires_attachment,
    )
    db.add(service)
    db.commit()
    db.refresh(service)
    return ServiceResponse.model_validate(service)


@router.put("/{service_id}", response_model=ServiceResponse)
def update_service(
    service_id: str,
    data: ServiceUpdate,
    db: Session = Depends(get_db),
    auth: dict = Depends(require_staff_or_admin),
):
    service = db.query(Service).filter(Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Услуга не найдена")

    if data.name is not None:
        service.name = data.name
    if data.description is not None:
        service.description = data.description
    if data.required_fields is not None:
        service.required_fields = [f.model_dump() for f in data.required_fields]
    if data.requires_attachment is not None:
        service.requires_attachment = data.requires_attachment
    if data.is_active is not None:
        service.is_active = data.is_active

    db.commit()
    db.refresh(service)
    return ServiceResponse.model_validate(service)


@router.delete("/{service_id}", status_code=204)
def delete_service(
    service_id: str,
    db: Session = Depends(get_db),
    auth: dict = Depends(require_staff_or_admin),
):
    service = db.query(Service).filter(Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Услуга не найдена")
    db.delete(service)
    db.commit()
