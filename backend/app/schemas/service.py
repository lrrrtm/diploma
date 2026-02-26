from pydantic import BaseModel
from datetime import datetime
from typing import Any


class FieldDefinition(BaseModel):
    name: str
    label: str
    type: str = "text"  # text, textarea, select, number, date
    required: bool = True
    options: list[str] | None = None  # for select fields


class ServiceCreate(BaseModel):
    department_id: int
    name: str
    description: str | None = None
    required_fields: list[FieldDefinition] = []
    requires_attachment: bool = False


class ServiceUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    required_fields: list[FieldDefinition] | None = None
    requires_attachment: bool | None = None
    is_active: bool | None = None


class ServiceResponse(BaseModel):
    id: int
    department_id: int
    name: str
    description: str | None = None
    required_fields: list[Any] = []
    requires_attachment: bool
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
