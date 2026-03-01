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

    def get_room_scheduler(self, *, building_id: int, room_id: int, date: str) -> Any:
        response = self._request(
            "GET",
            f"/api/schedule/buildings/{building_id}/rooms/{room_id}/scheduler",
            params={"date": date},
        )
        if response.status_code != 200:
            raise UpstreamRejected(
                service="schedule",
                status_code=response.status_code,
                message="failed to fetch room scheduler",
            )
        return self._response_json(response, "invalid room scheduler response")

    def get_teachers(self) -> Any:
        response = self._request("GET", "/api/schedule/teachers")
        if response.status_code != 200:
            raise UpstreamRejected(
                service="schedule",
                status_code=response.status_code,
                message="failed to fetch teachers",
            )
        return self._response_json(response, "invalid teachers response")
