"""
Mini-apps registry.

Currently a static list. In the future this can be backed by a database
so admins can add/remove/reorder mini-apps without redeployment.

Each mini-app entry is a card shown on the student home screen.
The frontend appends student identity params when navigating:
  {url}?student_id=...&student_name=...&student_email=...
"""

from fastapi import APIRouter

from app.config import settings

router = APIRouter()


@router.get("/")
def list_miniapps():
    return [
        {
            "id": "services",
            "name": "Заявки",
            "description": "Подача заявок в административные подразделения университета",
            "icon": "file-text",
            "url": settings.SERVICES_URL,
            "color": "blue",
        },
    ]
