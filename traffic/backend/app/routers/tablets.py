import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.dependencies import require_admin
from app.models.tablet import Tablet

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class RegisterTabletRequest(BaseModel):
    building_id: int
    building_name: str
    room_id: int
    room_name: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/init")
def init_tablet(db: DBSession = Depends(get_db)):
    """Called from display page on first load. Creates an unregistered tablet record."""
    tablet = Tablet(
        id=str(uuid.uuid4()),
        init_secret=secrets.token_hex(32),
    )
    db.add(tablet)
    db.commit()
    return {"device_id": tablet.id}


@router.get("/")
def list_tablets(db: DBSession = Depends(get_db), _: dict = Depends(require_admin)):
    tablets = db.query(Tablet).order_by(Tablet.created_at).all()
    return [_serialize(t) for t in tablets]


@router.get("/{tablet_id}")
def get_tablet(tablet_id: str, db: DBSession = Depends(get_db)):
    """Public — called by display page to check registration status."""
    tablet = db.get(Tablet, tablet_id)
    if not tablet:
        raise HTTPException(status_code=404, detail="Tablet not found")
    return _serialize(tablet)


@router.post("/{tablet_id}/register")
def register_tablet(
    tablet_id: str,
    data: RegisterTabletRequest,
    db: DBSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    tablet = db.get(Tablet, tablet_id)
    if not tablet:
        raise HTTPException(status_code=404, detail="Tablet not found")
    tablet.building_id = data.building_id
    tablet.building_name = data.building_name
    tablet.room_id = data.room_id
    tablet.room_name = data.room_name
    tablet.assigned_at = datetime.now(timezone.utc)
    db.commit()
    return _serialize(tablet)


@router.delete("/{tablet_id}")
def delete_tablet(
    tablet_id: str,
    db: DBSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    tablet = db.get(Tablet, tablet_id)
    if not tablet:
        raise HTTPException(status_code=404, detail="Tablet not found")
    db.delete(tablet)
    db.commit()
    return {"status": "deleted"}


def _serialize(t: Tablet) -> dict:
    return {
        "id": t.id,
        "is_registered": t.is_registered,
        "building_id": t.building_id,
        "building_name": t.building_name,
        "room_id": t.room_id,
        "room_name": t.room_name,
        "assigned_at": t.assigned_at.isoformat() if t.assigned_at else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }
