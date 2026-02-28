from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from jose import jwt, JWTError

from app.config import settings

router = APIRouter()


class LaunchTokenRequest(BaseModel):
    token: str


@router.post("/verify-launch")
def verify_launch(body: LaunchTokenRequest):
    """
    Verify a launch token signed by the main app.
    Returns verified student identity.
    """
    try:
        payload = jwt.decode(
            body.token, settings.LAUNCH_TOKEN_SECRET, algorithms=["HS256"]
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired launch token",
        )
    return {
        "student_external_id": payload["student_id"],
        "student_name": payload["student_name"],
        "student_email": payload["student_email"],
    }
