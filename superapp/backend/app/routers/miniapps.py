"""
Mini-apps registry.

Currently a static list. In the future this can be backed by a database
so admins can add/remove/reorder mini-apps without redeployment.

Each mini-app entry is a card shown on the student home screen.
The superapp generates a signed launch token and passes it to the
mini-app iframe: {url}?launch_token=<jwt>
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import settings

router = APIRouter()
bearer = HTTPBearer()


def _get_student(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    """Decode superapp JWT and return student identity."""
    try:
        payload = jwt.decode(
            credentials.credentials, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return {
        "student_id": payload["sub"],
        "student_name": payload["name"],
        "student_email": payload["email"],
    }


@router.get("/")
def list_miniapps():
    return [
        {
            "id": "services",
            "name": "Услуги",
            "description": "Подача заявок в административные подразделения университета",
            "icon": "file-text",
            "url": settings.SERVICES_URL,
            "color": "blue",
        },
        {
            "id": "traffic",
            "name": "Посещаемость",
            "description": "Отметить присутствие на занятии по QR-коду",
            "icon": "qr-code",
            "url": settings.TRAFFIC_URL,
            "color": "green",
        },
    ]


@router.get("/launch-token")
def get_launch_token(student: dict = Depends(_get_student)):
    """
    Generate a short-lived JWT signed with LAUNCH_TOKEN_SECRET.
    The mini-app backend verifies this token to trust student identity.
    """
    payload = {
        **student,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
    }
    token = jwt.encode(payload, settings.LAUNCH_TOKEN_SECRET, algorithm="HS256")
    return {"launch_token": token}
