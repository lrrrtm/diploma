from pydantic import BaseModel
from datetime import datetime


class DepartmentCreate(BaseModel):
    name: str
    description: str | None = None
    login: str | None = None
    password: str | None = None


class DepartmentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    login: str | None = None
    password: str | None = None


class DepartmentResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    login: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DepartmentWithServicesResponse(DepartmentResponse):
    services: list["ServiceBrief"] = []


class ServiceBrief(BaseModel):
    id: str
    name: str
    description: str | None = None
    requires_attachment: bool
    is_active: bool

    model_config = {"from_attributes": True}


DepartmentWithServicesResponse.model_rebuild()
