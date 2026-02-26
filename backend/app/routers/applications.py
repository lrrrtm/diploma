import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session, joinedload
from typing import Any

from app.config import settings
from app.database import get_db
from app.models import Application, ApplicationStatus, Attachment, ApplicationResponse as AppResponse
from app.models import User, UserRole, Service
from app.schemas.application import (
    ApplicationCreate,
    ApplicationResponse as ApplicationSchema,
    ApplicationBrief,
    ApplicationResponseOut,
    AttachmentResponse,
    ResponseCreate,
)
from app.dependencies import get_current_user

router = APIRouter()


def _build_application_response(app: Application) -> ApplicationSchema:
    return ApplicationSchema(
        id=app.id,
        student_id=app.student_id,
        student_name=app.student.full_name if app.student else None,
        service_id=app.service_id,
        service_name=app.service.name if app.service else None,
        department_name=app.service.department.name if app.service and app.service.department else None,
        form_data=app.form_data,
        status=app.status,
        created_at=app.created_at,
        updated_at=app.updated_at,
        attachments=[
            AttachmentResponse.model_validate(a)
            for a in app.attachments
            if a.response_id is None
        ],
        responses=[
            ApplicationResponseOut(
                id=r.id,
                staff_id=r.staff_id,
                staff_name=r.staff.full_name if r.staff else None,
                message=r.message,
                created_at=r.created_at,
                attachments=[AttachmentResponse.model_validate(a) for a in r.attachments],
            )
            for r in app.responses
        ],
    )


def _build_brief(app: Application) -> ApplicationBrief:
    return ApplicationBrief(
        id=app.id,
        student_name=app.student.full_name if app.student else None,
        service_name=app.service.name if app.service else None,
        department_name=app.service.department.name if app.service and app.service.department else None,
        status=app.status,
        created_at=app.created_at,
    )


def _save_file(upload: UploadFile) -> tuple[str, str]:
    ext = os.path.splitext(upload.filename)[1] if upload.filename else ""
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_name)
    with open(file_path, "wb") as f:
        content = upload.file.read()
        f.write(content)
    return upload.filename or unique_name, unique_name


@router.post("/", response_model=ApplicationSchema, status_code=201)
async def create_application(
    service_id: int = Form(...),
    form_data: str = Form("{}"),
    files: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="Только студенты могут подавать заявки")

    service = db.query(Service).filter(Service.id == service_id).first()
    if not service or not service.is_active:
        raise HTTPException(status_code=404, detail="Услуга не найдена или неактивна")

    import json
    try:
        parsed_form_data = json.loads(form_data)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Некорректные данные формы")

    application = Application(
        student_id=current_user.id,
        service_id=service_id,
        form_data=parsed_form_data,
        status=ApplicationStatus.PENDING,
    )
    db.add(application)
    db.flush()

    for upload in files:
        original_name, stored_name = _save_file(upload)
        attachment = Attachment(
            application_id=application.id,
            filename=original_name,
            file_path=stored_name,
            uploaded_by_id=current_user.id,
        )
        db.add(attachment)

    db.commit()

    app_full = (
        db.query(Application)
        .options(
            joinedload(Application.student),
            joinedload(Application.service).joinedload(Service.department),
            joinedload(Application.attachments),
            joinedload(Application.responses),
        )
        .filter(Application.id == application.id)
        .first()
    )
    return _build_application_response(app_full)


@router.get("/", response_model=list[ApplicationBrief])
def list_applications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        db.query(Application)
        .options(
            joinedload(Application.student),
            joinedload(Application.service).joinedload(Service.department),
        )
    )

    if current_user.role == UserRole.STUDENT:
        query = query.filter(Application.student_id == current_user.id)
    elif current_user.role == UserRole.STAFF:
        query = query.join(Service).filter(Service.department_id == current_user.department_id)
    # admin sees all

    applications = query.order_by(Application.created_at.desc()).all()
    return [_build_brief(a) for a in applications]


@router.get("/{application_id}", response_model=ApplicationSchema)
def get_application(
    application_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    application = (
        db.query(Application)
        .options(
            joinedload(Application.student),
            joinedload(Application.service).joinedload(Service.department),
            joinedload(Application.attachments).joinedload(Attachment.uploaded_by),
            joinedload(Application.responses).joinedload(AppResponse.staff),
            joinedload(Application.responses).joinedload(AppResponse.attachments),
        )
        .filter(Application.id == application_id)
        .first()
    )
    if not application:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    if current_user.role == UserRole.STUDENT and application.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Нет доступа к этой заявке")
    if current_user.role == UserRole.STAFF and application.service.department_id != current_user.department_id:
        raise HTTPException(status_code=403, detail="Нет доступа к этой заявке")

    return _build_application_response(application)


@router.patch("/{application_id}/status")
def update_application_status(
    application_id: int,
    status_update: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in (UserRole.STAFF, UserRole.ADMIN):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    application = db.query(Application).filter(Application.id == application_id).first()
    if not application:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    new_status = status_update.get("status")
    if new_status:
        application.status = ApplicationStatus(new_status)

    db.commit()
    return {"ok": True}


@router.post("/{application_id}/respond", response_model=ApplicationResponseOut)
async def respond_to_application(
    application_id: int,
    message: str = Form(...),
    new_status: str | None = Form(default=None),
    files: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in (UserRole.STAFF, UserRole.ADMIN):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    application = db.query(Application).filter(Application.id == application_id).first()
    if not application:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    response = AppResponse(
        application_id=application_id,
        staff_id=current_user.id,
        message=message,
    )
    db.add(response)
    db.flush()

    for upload in files:
        original_name, stored_name = _save_file(upload)
        attachment = Attachment(
            application_id=application_id,
            response_id=response.id,
            filename=original_name,
            file_path=stored_name,
            uploaded_by_id=current_user.id,
        )
        db.add(attachment)

    if new_status:
        application.status = ApplicationStatus(new_status)

    db.commit()
    db.refresh(response)

    resp = (
        db.query(AppResponse)
        .options(
            joinedload(AppResponse.staff),
            joinedload(AppResponse.attachments),
        )
        .filter(AppResponse.id == response.id)
        .first()
    )

    return ApplicationResponseOut(
        id=resp.id,
        staff_id=resp.staff_id,
        staff_name=resp.staff.full_name if resp.staff else None,
        message=resp.message,
        created_at=resp.created_at,
        attachments=[AttachmentResponse.model_validate(a) for a in resp.attachments],
    )
