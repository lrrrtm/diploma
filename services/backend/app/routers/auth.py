from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.config import settings
from poly_shared.auth.launch_token import (
    create_student_session_token,
    verify_launch_token,
)
from poly_shared.errors import TokenValidationError

router = APIRouter()


class LaunchTokenRequest(BaseModel):
    token: str


class LaunchTokenResponse(BaseModel):
    student_external_id: str
    student_name: str
    student_email: str
    student_token: str


@router.post("/verify-launch")
def verify_launch(body: LaunchTokenRequest) -> LaunchTokenResponse:
    """
    Verify a launch token signed by the main app.
    Returns verified student identity.
    """
    try:
        identity = verify_launch_token(
            token=body.token,
            secret=settings.LAUNCH_TOKEN_SECRET,
            algorithms=["HS256"],
        )
        student_token = create_student_session_token(
            student_external_id=identity["student_external_id"],
            student_name=identity["student_name"],
            student_email=identity["student_email"],
            secret=settings.STUDENT_SESSION_SECRET or settings.LAUNCH_TOKEN_SECRET,
            algorithm=settings.ALGORITHM,
            ttl_minutes=settings.STUDENT_SESSION_TTL_MINUTES,
        )
        return LaunchTokenResponse(
            student_external_id=identity["student_external_id"],
            student_name=identity["student_name"],
            student_email=identity["student_email"],
            student_token=student_token,
        )
    except TokenValidationError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired launch token",
        )
