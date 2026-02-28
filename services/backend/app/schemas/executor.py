from pydantic import BaseModel
from datetime import datetime


class ExecutorCreate(BaseModel):
    name: str
    username: str
    password: str


class ExecutorOut(BaseModel):
    id: str
    department_id: str
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}
