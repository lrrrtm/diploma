from pydantic import BaseModel
from datetime import datetime
from typing import Any

from app.models.application import ApplicationStatus


class ApplicationCreate(BaseModel):
    service_id: int
    form_data: dict[str, Any] = {}


class ApplicationStatusUpdate(BaseModel):
    status: ApplicationStatus


class AttachmentResponse(BaseModel):
    id: int
    filename: str
    file_path: str
    uploaded_by_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ResponseCreate(BaseModel):
    message: str
    new_status: ApplicationStatus | None = None


class ApplicationResponseOut(BaseModel):
    id: int
    staff_id: int
    staff_name: str | None = None
    message: str
    created_at: datetime
    attachments: list[AttachmentResponse] = []

    model_config = {"from_attributes": True}


class ApplicationResponse(BaseModel):
    id: int
    student_id: int
    student_name: str | None = None
    service_id: int
    service_name: str | None = None
    department_name: str | None = None
    form_data: dict[str, Any] = {}
    status: ApplicationStatus
    created_at: datetime
    updated_at: datetime
    attachments: list[AttachmentResponse] = []
    responses: list[ApplicationResponseOut] = []

    model_config = {"from_attributes": True}


class ApplicationBrief(BaseModel):
    id: int
    student_name: str | None = None
    service_name: str | None = None
    department_name: str | None = None
    status: ApplicationStatus
    created_at: datetime

    model_config = {"from_attributes": True}
