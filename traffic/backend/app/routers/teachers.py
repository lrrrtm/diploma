import uuid

from fastapi import APIRouter, Depends, HTTPException
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.dependencies import require_admin
from app.models.teacher import Teacher

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CreateTeacherRequest(BaseModel):
    username: str
    password: str
    full_name: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/")
def list_teachers(db: DBSession = Depends(get_db), _: dict = Depends(require_admin)):
    teachers = db.query(Teacher).order_by(Teacher.created_at).all()
    return [_serialize(t) for t in teachers]


@router.post("/")
def create_teacher(
    data: CreateTeacherRequest,
    db: DBSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    if db.query(Teacher).filter(Teacher.username == data.username).first():
        raise HTTPException(status_code=400, detail="Пользователь с таким логином уже существует")
    teacher = Teacher(
        id=str(uuid.uuid4()),
        username=data.username,
        password_hash=pwd_context.hash(data.password),
        full_name=data.full_name,
    )
    db.add(teacher)
    db.commit()
    return _serialize(teacher)


@router.delete("/{teacher_id}")
def delete_teacher(
    teacher_id: str,
    db: DBSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    teacher = db.get(Teacher, teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Преподаватель не найден")
    db.delete(teacher)
    db.commit()
    return {"status": "deleted"}


def _serialize(t: Teacher) -> dict:
    return {
        "id": t.id,
        "username": t.username,
        "full_name": t.full_name,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }
