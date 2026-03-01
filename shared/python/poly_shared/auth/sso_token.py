from jose import JWTError, jwt

from poly_shared.errors import TokenValidationError


def decode_sso_token(
    token: str,
    secret: str,
    algorithm: str,
    expected_app: str | None = None,
) -> dict:
    try:
        payload = jwt.decode(token, secret, algorithms=[algorithm])
    except JWTError as exc:
        raise TokenValidationError("Недействительный или просроченный токен") from exc

    if expected_app is not None and payload.get("app") != expected_app:
        raise TokenValidationError("Токен не предназначен для этого приложения")
    return payload
