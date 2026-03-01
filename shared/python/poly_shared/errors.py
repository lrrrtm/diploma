from dataclasses import dataclass


@dataclass(slots=True)
class UpstreamError(Exception):
    service: str
    message: str
    status_code: int | None = None
    detail: str | None = None

    def __str__(self) -> str:
        if self.status_code is None:
            return f"{self.service}: {self.message}"
        return f"{self.service}: {self.message} (status={self.status_code})"


class UpstreamUnavailable(UpstreamError):
    pass


class UpstreamRejected(UpstreamError):
    pass


class TokenValidationError(Exception):
    pass
