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
