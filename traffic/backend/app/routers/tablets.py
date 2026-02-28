import random
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
# Helpers
# ---------------------------------------------------------------------------

def _unique_pin(db: DBSession, exclude_field: str | None = None) -> str:
    """Generate a unique 6-digit PIN not already used in the tablets table."""
    for _ in range(100):
        pin = f"{random.randint(0, 999999):06d}"
        q = db.query(Tablet).filter(
            (Tablet.reg_pin == pin) | (Tablet.display_pin == pin)
        )
        if not q.first():
            return pin
    raise RuntimeError("Could not generate unique PIN")


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
    reg_pin = _unique_pin(db)
    display_pin = _unique_pin(db)
    # Ensure both pins are different
    while display_pin == reg_pin:
        display_pin = _unique_pin(db)
    tablet = Tablet(
        id=str(uuid.uuid4()),
        reg_pin=reg_pin,
        display_pin=display_pin,
    )
    db.add(tablet)
    db.commit()
    return {"device_id": tablet.id, "reg_pin": tablet.reg_pin, "display_pin": tablet.display_pin}


@router.get("/by-reg-pin")
def find_by_reg_pin(pin: str, db: DBSession = Depends(get_db), _: dict = Depends(require_admin)):
    """Admin calls this after entering the PIN shown on an unregistered kiosk."""
    tablet = db.query(Tablet).filter(Tablet.reg_pin == pin).first()
    if not tablet:
        raise HTTPException(status_code=404, detail="Киоск с таким кодом не найден")
    return {"tablet_id": tablet.id}


@router.get("/by-display-pin")
def find_by_display_pin(pin: str, db: DBSession = Depends(get_db)):
    """Teacher calls this after entering the PIN shown on a registered waiting kiosk."""
    tablet = db.query(Tablet).filter(Tablet.display_pin == pin).first()
    if not tablet:
        raise HTTPException(status_code=404, detail="Киоск с таким кодом не найден")
    if not tablet.is_registered:
        raise HTTPException(status_code=400, detail="Киоск ещё не зарегистрирован")
    return {
        "tablet_id": tablet.id,
        "building_name": tablet.building_name,
        "room_name": tablet.room_name,
    }


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
