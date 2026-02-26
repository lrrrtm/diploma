from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from app.database import get_db
from app.models.executor import Executor
from app.schemas.executor import ExecutorCreate, ExecutorOut
from app.dependencies import require_staff

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.get("/", response_model=list[ExecutorOut])
def list_executors(
    db: Session = Depends(get_db),
    auth: dict = Depends(require_staff),
):
    return (
        db.query(Executor)
        .filter(Executor.department_id == auth["department_id"])
        .order_by(Executor.created_at.desc())
        .all()
    )


@router.post("/", response_model=ExecutorOut, status_code=201)
def create_executor(
    data: ExecutorCreate,
    db: Session = Depends(get_db),
    auth: dict = Depends(require_staff),
):
    if db.query(Executor).filter(Executor.login == data.login).first():
        raise HTTPException(status_code=400, detail="Логин уже занят")

    executor = Executor(
        department_id=auth["department_id"],
        name=data.name,
        login=data.login,
        password_hash=pwd_context.hash(data.password),
    )
    db.add(executor)
    db.commit()
    db.refresh(executor)
    return executor


@router.delete("/{executor_id}", status_code=204)
def delete_executor(
    executor_id: str,
    db: Session = Depends(get_db),
    auth: dict = Depends(require_staff),
):
    executor = (
        db.query(Executor)
        .filter(Executor.id == executor_id, Executor.department_id == auth["department_id"])
        .first()
    )
    if not executor:
        raise HTTPException(status_code=404, detail="Исполнитель не найден")
    db.delete(executor)
    db.commit()
