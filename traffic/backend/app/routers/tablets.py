import asyncio
import hmac
import json
import random
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from app.config import settings
from app.database import SessionLocal, get_db
from app.dependencies import require_admin
from app.models.attendance import Attendance
from app.models.session import Session
from app.models.tablet import Tablet
from app.realtime import hub

router = APIRouter()
SSE_HEARTBEAT_SECONDS = 8.0


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


@router.get("/stream/statuses")
async def stream_statuses(_: dict = Depends(require_admin)):
    async def event_generator():
        queue = await hub.subscribe_status()
        last_data = ""
        try:
            while True:
                payload = await _build_statuses_payload()
                data = json.dumps(payload, ensure_ascii=False)
                if data != last_data:
                    last_data = data
                    yield f"event: statuses\ndata: {data}\n\n"

                try:
                    await asyncio.wait_for(queue.get(), timeout=SSE_HEARTBEAT_SECONDS)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            await hub.unsubscribe_status(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{tablet_id}")
def get_tablet(tablet_id: str, db: DBSession = Depends(get_db)):
    """Public — called by display page to check registration status."""
    tablet = db.get(Tablet, tablet_id)
    if not tablet:
        raise HTTPException(status_code=404, detail="Tablet not found")
    return _serialize(tablet)


@router.get("/{tablet_id}/events")
async def tablet_events(tablet_id: str, tablet_secret: str | None = None):
    async def event_generator():
        queue = await hub.subscribe_tablet(tablet_id)
        await hub.set_online(tablet_id)
        last_data = ""
        try:
            while True:
                payload = _build_tablet_payload(tablet_id=tablet_id, tablet_secret=tablet_secret)
                data = json.dumps(payload, ensure_ascii=False)
                if data != last_data:
                    last_data = data
                    yield f"event: tablet\ndata: {data}\n\n"

                # If tablet no longer exists, close stream so client can re-init a new device.
                if payload.get("tablet") is None:
                    break

                try:
                    await asyncio.wait_for(queue.get(), timeout=SSE_HEARTBEAT_SECONDS)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            await hub.unsubscribe_tablet(tablet_id, queue)
            await hub.set_offline(tablet_id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{tablet_id}/register")
async def register_tablet(
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
    await hub.publish_tablet(tablet.id)
    return _serialize(tablet)


@router.delete("/{tablet_id}")
async def delete_tablet(
    tablet_id: str,
    db: DBSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    tablet = db.get(Tablet, tablet_id)
    if not tablet:
        raise HTTPException(status_code=404, detail="Tablet not found")
    db.delete(tablet)
    db.commit()
    await hub.publish_tablet(tablet_id)
    await hub.set_offline(tablet_id)
    return {"status": "deleted"}


def _serialize(t: Tablet) -> dict:
    d: dict = {
        "id": t.id,
        "is_registered": t.is_registered,
        "building_id": t.building_id,
        "building_name": t.building_name,
        "room_id": t.room_id,
        "room_name": t.room_name,
        "assigned_at": t.assigned_at.isoformat() if t.assigned_at else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }
    if not t.is_registered:
        d["reg_pin"] = t.reg_pin
    return d


def _serialize_session_state(session: Session, tablet: Tablet, db: DBSession, tablet_secret: str | None) -> dict:
    age_seconds = (datetime.now(timezone.utc) - session.started_at.replace(tzinfo=timezone.utc)).total_seconds()
    if age_seconds > settings.SESSION_MAX_MINUTES * 60:
        session.is_active = False
        session.ended_at = datetime.now(timezone.utc)
        db.commit()
        return {"active": False}

    attendance_count = db.query(Attendance).filter(Attendance.session_id == session.id).count()

    payload: dict = {
        "active": True,
        "session_id": session.id,
        "discipline": session.discipline,
        "teacher_name": session.teacher_name,
        "rotate_seconds": session.rotate_seconds,
        "attendance_count": attendance_count,
    }
    authenticated = tablet_secret is not None and hmac.compare_digest(tablet_secret, tablet.display_pin)
    if authenticated:
        payload["qr_secret"] = session.qr_secret
    return payload


def _build_tablet_payload(tablet_id: str, tablet_secret: str | None) -> dict:
    db = SessionLocal()
    try:
        tablet = db.get(Tablet, tablet_id)
        if not tablet:
            return {"tablet": None, "session": {"active": False}}

        tablet_payload = _serialize(tablet)

        session = (
            db.query(Session)
            .filter(Session.tablet_id == tablet_id, Session.is_active == True)  # noqa: E712
            .first()
        )
        if not session:
            session_payload = {"active": False}
        else:
            session_payload = _serialize_session_state(
                session=session,
                tablet=tablet,
                db=db,
                tablet_secret=tablet_secret,
            )

        return {
            "tablet": tablet_payload,
            "session": session_payload,
            "server_time": datetime.now(timezone.utc).isoformat(),
        }
    finally:
        db.close()


async def _build_statuses_payload() -> dict:
    online_tablets = await hub.get_online_tablets()
    db = SessionLocal()
    try:
        tablet_ids = [tablet_id for (tablet_id,) in db.query(Tablet.id).all()]
        statuses = [
            {"tablet_id": tablet_id, "online": tablet_id in online_tablets}
            for tablet_id in tablet_ids
        ]
        return {"statuses": statuses}
    finally:
        db.close()
