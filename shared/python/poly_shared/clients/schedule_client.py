from dataclasses import dataclass
from typing import Any

import httpx

from poly_shared.errors import UpstreamRejected, UpstreamUnavailable


@dataclass(slots=True)
class ScheduleClient:
    base_url: str
    timeout: float = 10.0

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
    ) -> httpx.Response:
        url = f"{self.base_url}{path}"
        try:
            response = httpx.request(
                method=method,
                url=url,
                params=params,
                timeout=self.timeout,
            )
        except httpx.RequestError as exc:
            raise UpstreamUnavailable(
                service="schedule",
                message="service unavailable",
            ) from exc
        return response

    @staticmethod
    def _response_json(response: httpx.Response, message: str) -> Any:
        try:
            return response.json()
        except ValueError as exc:
            raise UpstreamRejected(
                service="schedule",
                status_code=response.status_code,
                message=message,
                detail="Некорректный ответ schedule service",
            ) from exc

    def get_buildings(self) -> Any:
        response = self._request("GET", "/api/schedule/buildings")
        if response.status_code != 200:
            raise UpstreamRejected(
                service="schedule",
                status_code=response.status_code,
                message="failed to fetch buildings",
            )
        return self._response_json(response, "invalid buildings response")
