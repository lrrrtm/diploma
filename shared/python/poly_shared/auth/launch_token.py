from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

from poly_shared.errors import TokenValidationError


def verify_launch_token(
    token: str,
    secret: str,
    algorithms: list[str] | None = None,
) -> dict:
    algo = algorithms or ["HS256"]
    try:
        payload = jwt.decode(token, secret, algorithms=algo)
    except JWTError as exc:
        raise TokenValidationError("Invalid or expired launch token") from exc

    student_id = payload.get("student_id")
    student_name = payload.get("student_name")
    if student_id is None or student_name is None:
        raise TokenValidationError("Launch token payload is incomplete")

    return {
        "student_external_id": str(student_id),
        "student_name": student_name,
        "student_email": payload.get("student_email", ""),
    }


def create_student_session_token(
    *,
    student_external_id: str,
    student_name: str,
    student_email: str,
    secret: str,
    algorithm: str = "HS256",
    ttl_minutes: int = 720,
) -> str:
    payload = {
        "student_id": student_external_id,
        "student_name": student_name,
        "student_email": student_email,
        "token_type": "student_session",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=max(1, ttl_minutes)),
    }
    return jwt.encode(payload, secret, algorithm=algorithm)


def verify_student_session_token(
    token: str,
    secret: str,
    algorithms: list[str] | None = None,
) -> dict:
    algo = algorithms or ["HS256"]
    try:
        payload = jwt.decode(token, secret, algorithms=algo)
    except JWTError as exc:
        raise TokenValidationError("Invalid or expired student session token") from exc

    if payload.get("token_type") != "student_session":
        raise TokenValidationError("Invalid student session token type")

    student_id = payload.get("student_id")
    student_name = payload.get("student_name")
    if student_id is None or student_name is None:
        raise TokenValidationError("Student session token payload is incomplete")

    return {
        "student_external_id": str(student_id),
        "student_name": student_name,
        "student_email": payload.get("student_email", ""),
    }
