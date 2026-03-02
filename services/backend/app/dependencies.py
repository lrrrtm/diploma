from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from poly_shared.auth.launch_token import verify_student_session_token
from poly_shared.auth.sso_token import decode_sso_token
from poly_shared.errors import TokenValidationError

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def get_current_auth(token: str | None = Depends(oauth2_scheme)) -> dict | None:
    """Returns decoded SSO JWT payload or None (for public/student endpoints)."""
    if token is None:
        return None
    try:
        payload = decode_sso_token(
            token=token,
            secret=settings.SSO_JWT_SECRET,
            algorithm=settings.ALGORITHM,
            expected_app=None,
        )
        return payload
    except TokenValidationError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный токен",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_student(student_token: str | None = Header(default=None, alias="X-Student-Token")) -> dict | None:
    if not student_token:
        return None
    try:
        identity = verify_student_session_token(
            token=student_token,
            secret=settings.STUDENT_SESSION_SECRET or settings.LAUNCH_TOKEN_SECRET,
            algorithms=[settings.ALGORITHM],
        )
        return identity
    except TokenValidationError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный токен студента",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _check_app(auth: dict) -> None:
    if auth.get("app") != "services":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Токен не предназначен для этого приложения",
        )


def _check_department_exists(auth: dict, db: Session) -> None:
    """Raises 401 if the department linked via entity_id no longer exists."""
    from app.models.department import Department
    if not db.get(Department, auth.get("entity_id")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Структура удалена",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _check_executor_exists(auth: dict, db: Session):
    """Raises 401 if the executor linked via entity_id no longer exists.
    Returns the Executor ORM object for department_id extraction."""
    from app.models.executor import Executor
    executor = db.get(Executor, auth.get("entity_id"))
    if not executor:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Исполнитель удалён",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return executor


def require_admin(auth: dict | None = Depends(get_current_auth)) -> dict:
    if not auth or auth.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Требуются права администратора")
    _check_app(auth)
    return auth


def require_staff(auth: dict | None = Depends(get_current_auth), db: Session = Depends(get_db)) -> dict:
    if not auth or auth.get("role") != "staff":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Требуются права сотрудника")
    _check_app(auth)
    _check_department_exists(auth, db)
    # Compat key: routers use auth["department_id"]
    return {**auth, "department_id": auth["entity_id"]}


def require_staff_or_admin(auth: dict | None = Depends(get_current_auth), db: Session = Depends(get_db)) -> dict:
    if not auth or auth.get("role") not in ("staff", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    _check_app(auth)
    if auth.get("role") == "staff":
        _check_department_exists(auth, db)
        return {**auth, "department_id": auth["entity_id"]}
    return auth


def require_executor(auth: dict | None = Depends(get_current_auth), db: Session = Depends(get_db)) -> dict:
    if not auth or auth.get("role") != "executor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Требуются права исполнителя")
    _check_app(auth)
    executor = _check_executor_exists(auth, db)
    # Compat keys: routers use auth["executor_id"] and auth["department_id"]
    return {**auth, "executor_id": auth["entity_id"], "department_id": executor.department_id}


def require_staff_executor_or_admin(auth: dict | None = Depends(get_current_auth), db: Session = Depends(get_db)) -> dict:
    if not auth or auth.get("role") not in ("staff", "executor", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    _check_app(auth)
    if auth.get("role") == "staff":
        _check_department_exists(auth, db)
        return {**auth, "department_id": auth["entity_id"]}
    elif auth.get("role") == "executor":
        executor = _check_executor_exists(auth, db)
        return {**auth, "executor_id": auth["entity_id"], "department_id": executor.department_id}
    return auth
