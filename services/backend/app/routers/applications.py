import os
import uuid
import json
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
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
from app.dependencies import (
    get_current_auth,
    get_current_student,
    require_staff,
    require_staff_or_admin,
    require_staff_executor_or_admin,
)

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
    ext = (os.path.splitext(upload.filename)[1] if upload.filename else "").lower()
    allowed_extensions = {
        value.strip().lower()
        for value in settings.ALLOWED_UPLOAD_EXTENSIONS.split(",")
        if value.strip()
    }
    if allowed_extensions and ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Недопустимый формат файла")

    content = upload.file.read()
    if len(content) > settings.MAX_UPLOAD_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Файл превышает допустимый размер")

    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_name)
    with open(file_path, "wb") as f:
        f.write(content)
    return upload.filename or unique_name, unique_name


def _check_application_access(
    *,
    application: Application,
    db: Session,
    auth: dict | None,
    student: dict | None,
) -> None:
    if auth and auth.get("role") == "staff":
        from app.models.department import Department
        entity_id = auth.get("entity_id")
        if not db.get(Department, entity_id):
            raise HTTPException(status_code=401, detail="Структура удалена", headers={"WWW-Authenticate": "Bearer"})
        if not application.service or application.service.department_id != entity_id:
            raise HTTPException(status_code=403, detail="Нет доступа к этой заявке")
        return

    if auth and auth.get("role") == "executor":
        from app.models.executor import Executor
        entity_id = auth.get("entity_id")
        executor = db.get(Executor, entity_id)
        if not executor:
            raise HTTPException(status_code=401, detail="Исполнитель удалён", headers={"WWW-Authenticate": "Bearer"})
        if application.executor_id != entity_id:
            raise HTTPException(status_code=403, detail="Нет доступа к этой заявке")
        if not application.service or application.service.department_id != executor.department_id:
            raise HTTPException(status_code=403, detail="Нет доступа к этой заявке")
        return

    if auth and auth.get("role") == "admin":
        return

    if student:
        if application.student_external_id != student["student_external_id"]:
            raise HTTPException(status_code=403, detail="Нет доступа к этой заявке")
        return

    raise HTTPException(status_code=401, detail="Недостаточно прав")


@router.post("/", response_model=ApplicationSchema, status_code=201)
async def create_application(
    service_id: str = Form(...),
    form_data: str = Form("{}"),
    files: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    student: dict = Depends(get_current_student),
):
    if not student:
        raise HTTPException(status_code=401, detail="Необходима повторная авторизация студента")

    service = db.query(Service).filter(Service.id == service_id).first()
    if not service or not service.is_active:
        raise HTTPException(status_code=404, detail="Услуга не найдена или неактивна")

    try:
        parsed_form_data = json.loads(form_data)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Некорректные данные формы")

    application = Application(
        service_id=service_id,
        student_external_id=student["student_external_id"],
        student_name=student["student_name"],
        student_email=(student.get("student_email") or None),
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
    db: Session = Depends(get_db),
    auth: dict | None = Depends(get_current_auth),
    student: dict | None = Depends(get_current_student),
):
    query = (
        db.query(Application)
        .options(
            joinedload(Application.service).joinedload(Service.department),
            joinedload(Application.executor),
        )
    )

    if auth and auth.get("role") == "staff":
        from app.models.department import Department
        entity_id = auth.get("entity_id")
        if not db.get(Department, entity_id):
            raise HTTPException(status_code=401, detail="Структура удалена", headers={"WWW-Authenticate": "Bearer"})
        query = query.join(Service).filter(Service.department_id == entity_id)
    elif auth and auth.get("role") == "executor":
        from app.models.executor import Executor
        entity_id = auth.get("entity_id")
        if not db.get(Executor, entity_id):
            raise HTTPException(status_code=401, detail="Исполнитель удалён", headers={"WWW-Authenticate": "Bearer"})
        query = query.filter(Application.executor_id == entity_id)
    elif auth and auth.get("role") == "admin":
        pass
    elif student:
        query = query.filter(Application.student_external_id == student["student_external_id"])
    else:
        raise HTTPException(status_code=401, detail="Недостаточно прав")

    applications = query.order_by(Application.created_at.desc()).all()
    return [_build_brief(a) for a in applications]


@router.get("/{application_id}", response_model=ApplicationSchema)
def get_application(
    application_id: str,
    db: Session = Depends(get_db),
    auth: dict | None = Depends(get_current_auth),
    student: dict | None = Depends(get_current_student),
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

    _check_application_access(application=application, db=db, auth=auth, student=student)

    return _build_application_response(application)


@router.get("/attachments/{attachment_id}/download")
def download_attachment(
    attachment_id: str,
    db: Session = Depends(get_db),
    auth: dict | None = Depends(get_current_auth),
    student: dict | None = Depends(get_current_student),
):
    attachment = (
        db.query(Attachment)
        .options(joinedload(Attachment.application).joinedload(Application.service))
        .filter(Attachment.id == attachment_id)
        .first()
    )
    if not attachment or not attachment.application:
        raise HTTPException(status_code=404, detail="Файл не найден")

    _check_application_access(
        application=attachment.application,
        db=db,
        auth=auth,
        student=student,
    )

    safe_name = os.path.basename(attachment.file_path)
    file_path = os.path.join(settings.UPLOAD_DIR, safe_name)
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Файл не найден")

    return FileResponse(
        path=file_path,
        filename=attachment.filename,
        media_type="application/octet-stream",
    )


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
    if not application.service or application.service.department_id != auth["department_id"]:
        raise HTTPException(status_code=403, detail="Нет доступа к этой заявке")

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
    if auth.get("role") == "staff":
        service = db.query(Service).filter(Service.id == application.service_id).first()
        if not service or service.department_id != auth["department_id"]:
            raise HTTPException(status_code=403, detail="Нет доступа к этой заявке")

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
        if application.service.department_id != auth["department_id"]:
            raise HTTPException(status_code=403, detail="Нет доступа к этой заявке")
        department_id = auth["department_id"]
    elif auth["role"] == "staff":
        if application.service.department_id != auth["department_id"]:
            raise HTTPException(status_code=403, detail="Нет доступа к этой заявке")
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
