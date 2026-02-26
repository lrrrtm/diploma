from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def get_current_auth(token: str | None = Depends(oauth2_scheme)) -> dict | None:
    """Returns decoded JWT payload or None (for public/student endpoints)."""
    if token is None:
        return None
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный токен",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _check_department_exists(auth: dict, db: Session) -> None:
    """Raises 401 if the department from the token no longer exists in DB."""
    from app.models.department import Department
    if not db.get(Department, auth.get("department_id")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Структура удалена",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _check_executor_exists(auth: dict, db: Session) -> None:
    """Raises 401 if the executor from the token no longer exists in DB."""
    from app.models.executor import Executor
    if not db.get(Executor, auth.get("executor_id")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Исполнитель удалён",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_admin(auth: dict | None = Depends(get_current_auth)) -> dict:
    if not auth or auth.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Требуются права администратора")
    return auth


def require_staff(auth: dict | None = Depends(get_current_auth), db: Session = Depends(get_db)) -> dict:
    if not auth or auth.get("role") != "staff":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Требуются права сотрудника")
    _check_department_exists(auth, db)
    return auth


def require_staff_or_admin(auth: dict | None = Depends(get_current_auth), db: Session = Depends(get_db)) -> dict:
    if not auth or auth.get("role") not in ("staff", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    if auth.get("role") == "staff":
        _check_department_exists(auth, db)
    return auth


def require_executor(auth: dict | None = Depends(get_current_auth), db: Session = Depends(get_db)) -> dict:
    if not auth or auth.get("role") != "executor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Требуются права исполнителя")
    _check_executor_exists(auth, db)
    return auth


def require_staff_executor_or_admin(auth: dict | None = Depends(get_current_auth), db: Session = Depends(get_db)) -> dict:
    if not auth or auth.get("role") not in ("staff", "executor", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
    if auth.get("role") == "staff":
        _check_department_exists(auth, db)
    elif auth.get("role") == "executor":
        _check_executor_exists(auth, db)
    return auth
