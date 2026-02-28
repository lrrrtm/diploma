from fastapi import APIRouter, HTTPException
from jose import JWTError, jwt
from pydantic import BaseModel

from app.config import settings

router = APIRouter()


class LaunchTokenRequest(BaseModel):
    token: str


@router.post("/verify-launch")
def verify_launch(body: LaunchTokenRequest):
    try:
        payload = jwt.decode(
            body.token, settings.LAUNCH_TOKEN_SECRET, algorithms=[settings.ALGORITHM]
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired launch token")
    return {
        "student_external_id": str(payload["student_id"]),
        "student_name": payload["student_name"],
        "student_email": payload.get("student_email", ""),
    }
