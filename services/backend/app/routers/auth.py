from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.config import settings
from poly_shared.auth.launch_token import verify_launch_token
from poly_shared.errors import TokenValidationError

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
        return verify_launch_token(
            token=body.token,
            secret=settings.LAUNCH_TOKEN_SECRET,
            algorithms=["HS256"],
        )
    except TokenValidationError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired launch token",
        )
