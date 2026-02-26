import os
import uuid
import json
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.models import Application, ApplicationStatus, Attachment, ApplicationResponse as AppResponse
from app.models import Service
from app.models.executor import Executor
from app.schemas.application import (
    ApplicationSchema,
    ApplicationBrief,
    ApplicationResponseOut,
    AttachmentResponse,
)
from app.dependencies import get_current_auth, require_staff, require_staff_or_admin, require_staff_executor_or_admin

router = APIRouter()


def _build_application_response(app: Application) -> ApplicationSchema:
    return ApplicationSchema(
        id=app.id,
        student_external_id=app.student_external_id,
        student_name=app.student_name,
        student_email=app.student_email,
        service_id=app.service_id,
        service_name=app.service.name if app.service else None,
        department_name=app.service.department.name if app.service and app.service.department else None,
        service_fields=app.service.required_fields if app.service else [],
        form_data=app.form_data,
        status=app.status,
        executor_id=app.executor_id,
        executor_name=app.executor.name if app.executor else None,
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
                department_name=r.department.name if r.department else None,
                message=r.message,
                created_at=r.created_at,
                attachments=[AttachmentResponse.model_validate(a) for a in r.attachments],
            )
            for r in sorted(app.responses, key=lambda r: r.created_at, reverse=True)
        ],
    )


def _build_brief(app: Application) -> ApplicationBrief:
    return ApplicationBrief(
        id=app.id,
        student_name=app.student_name,
        service_name=app.service.name if app.service else None,
        department_name=app.service.department.name if app.service and app.service.department else None,
        status=app.status,
        executor_id=app.executor_id,
        executor_name=app.executor.name if app.executor else None,
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
    service_id: str = Form(...),
    student_external_id: str = Form(...),
    student_name: str = Form(...),
    student_email: str = Form(default=""),
    form_data: str = Form("{}"),
    files: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
):
    service = db.query(Service).filter(Service.id == service_id).first()
    if not service or not service.is_active:
        raise HTTPException(status_code=404, detail="Услуга не найдена или неактивна")

    try:
        parsed_form_data = json.loads(form_data)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Некорректные данные формы")

    application = Application(
        service_id=service_id,
        student_external_id=student_external_id,
        student_name=student_name,
        student_email=student_email or None,
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
        )
        db.add(attachment)

    db.commit()

    app_full = (
        db.query(Application)
        .options(
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
    student_external_id: str | None = None,
    db: Session = Depends(get_db),
    auth: dict | None = Depends(get_current_auth),
):
    query = (
        db.query(Application)
        .options(
            joinedload(Application.service).joinedload(Service.department),
            joinedload(Application.executor),
        )
    )

    if student_external_id:
        query = query.filter(Application.student_external_id == student_external_id)
    elif auth and auth.get("role") == "staff":
        from app.models.department import Department
        if not db.get(Department, auth["department_id"]):
            raise HTTPException(status_code=401, detail="Структура удалена", headers={"WWW-Authenticate": "Bearer"})
        query = query.join(Service).filter(Service.department_id == auth["department_id"])
    elif auth and auth.get("role") == "executor":
        from app.models.executor import Executor
        if not db.get(Executor, auth["executor_id"]):
            raise HTTPException(status_code=401, detail="Исполнитель удалён", headers={"WWW-Authenticate": "Bearer"})
        query = query.filter(Application.executor_id == auth["executor_id"])
    elif auth and auth.get("role") == "admin":
        pass
    else:
        raise HTTPException(status_code=400, detail="Укажите student_external_id или авторизуйтесь")

    applications = query.order_by(Application.created_at.desc()).all()
    return [_build_brief(a) for a in applications]


@router.get("/{application_id}", response_model=ApplicationSchema)
def get_application(
    application_id: str,
    student_external_id: str | None = None,
    db: Session = Depends(get_db),
    auth: dict | None = Depends(get_current_auth),
):
    application = (
        db.query(Application)
        .options(
            joinedload(Application.service).joinedload(Service.department),
            joinedload(Application.attachments),
            joinedload(Application.responses).joinedload(AppResponse.department),
            joinedload(Application.responses).joinedload(AppResponse.attachments),
            joinedload(Application.executor),
        )
        .filter(Application.id == application_id)
        .first()
    )
    if not application:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    # Access control
    if student_external_id:
        if application.student_external_id != student_external_id:
            raise HTTPException(status_code=403, detail="Нет доступа к этой заявке")
    elif auth and auth.get("role") == "staff":
        from app.models.department import Department
        if not db.get(Department, auth["department_id"]):
            raise HTTPException(status_code=401, detail="Структура удалена", headers={"WWW-Authenticate": "Bearer"})
        if application.service.department_id != auth["department_id"]:
            raise HTTPException(status_code=403, detail="Нет доступа к этой заявке")
    elif auth and auth.get("role") == "executor":
        from app.models.executor import Executor
        if not db.get(Executor, auth["executor_id"]):
            raise HTTPException(status_code=401, detail="Испонитель удалён", headers={"WWW-Authenticate": "Bearer"})
        if application.executor_id != auth["executor_id"]:
            raise HTTPException(status_code=403, detail="Нет доступа к этой заявке")
    elif auth and auth.get("role") == "admin":
        pass
    else:
        raise HTTPException(status_code=400, detail="Укажите student_external_id или авторизуйтесь")

    return _build_application_response(application)


@router.patch("/{application_id}/assign")
def assign_executor(
    application_id: str,
    data: dict,
    db: Session = Depends(get_db),
    auth: dict = Depends(require_staff),
):
    application = db.query(Application).filter(Application.id == application_id).first()
    if not application:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    executor_id = data.get("executor_id")
    if executor_id:
        executor = (
            db.query(Executor)
            .filter(Executor.id == executor_id, Executor.department_id == auth["department_id"])
            .first()
        )
        if not executor:
            raise HTTPException(status_code=404, detail="Исполнитель не найден")
    application.executor_id = executor_id or None
    db.commit()
    return {"ok": True}


@router.patch("/{application_id}/status")
def update_application_status(
    application_id: str,
    status_update: dict,
    db: Session = Depends(get_db),
    auth: dict = Depends(require_staff_or_admin),
):
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
    application_id: str,
    message: str = Form(...),
    new_status: str | None = Form(default=None),
    files: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    auth: dict = Depends(require_staff_executor_or_admin),
):
    application = (
        db.query(Application)
        .options(joinedload(Application.service))
        .filter(Application.id == application_id)
        .first()
    )
    if not application:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    if auth["role"] == "executor":
        if application.executor_id != auth["executor_id"]:
            raise HTTPException(status_code=403, detail="Нет доступа к этой заявке")
        department_id = auth["department_id"]
    elif auth["role"] == "staff":
        department_id = auth["department_id"]
    else:
        department_id = application.service.department_id

    response = AppResponse(
        application_id=application_id,
        department_id=department_id,
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
        )
        db.add(attachment)

    if new_status:
        application.status = ApplicationStatus(new_status)

    db.commit()
    db.refresh(response)

    resp = (
        db.query(AppResponse)
        .options(
            joinedload(AppResponse.department),
            joinedload(AppResponse.attachments),
        )
        .filter(AppResponse.id == response.id)
        .first()
    )

    return ApplicationResponseOut(
        id=resp.id,
        department_name=resp.department.name if resp.department else None,
        message=resp.message,
        created_at=resp.created_at,
        attachments=[AttachmentResponse.model_validate(a) for a in resp.attachments],
    )
