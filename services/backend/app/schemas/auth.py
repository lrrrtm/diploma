from pydantic import BaseModel


class LoginRequest(BaseModel):
    login: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    role: str
    department_id: str | None = None
    department_name: str | None = None
    executor_id: str | None = None
    executor_name: str | None = None
