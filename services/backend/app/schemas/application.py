from pydantic import BaseModel
from datetime import datetime
from typing import Any

from app.models.application import ApplicationStatus


class ApplicationCreate(BaseModel):
    service_id: str
    form_data: dict[str, Any] = {}


class ApplicationStatusUpdate(BaseModel):
    status: ApplicationStatus


class AttachmentResponse(BaseModel):
    id: str
    filename: str
    file_path: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ResponseCreate(BaseModel):
    message: str
    new_status: ApplicationStatus | None = None


class ApplicationResponseOut(BaseModel):
    id: str
    department_name: str | None = None
    message: str
    created_at: datetime
    attachments: list[AttachmentResponse] = []

    model_config = {"from_attributes": True}


class ApplicationSchema(BaseModel):
    id: str
    student_external_id: str
    student_name: str | None = None
    student_email: str | None = None
    service_id: str
    service_name: str | None = None
    department_name: str | None = None
    service_fields: list[Any] = []
    form_data: dict[str, Any] = {}
    status: ApplicationStatus
    executor_id: str | None = None
    executor_name: str | None = None
    created_at: datetime
    updated_at: datetime
    attachments: list[AttachmentResponse] = []
    responses: list[ApplicationResponseOut] = []

    model_config = {"from_attributes": True}


class ApplicationBrief(BaseModel):
    id: str
    student_name: str | None = None
    service_name: str | None = None
    department_name: str | None = None
    status: ApplicationStatus
    executor_id: str | None = None
    executor_name: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
