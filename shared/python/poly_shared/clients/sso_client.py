from dataclasses import dataclass
from typing import Any

import httpx

from poly_shared.errors import UpstreamRejected, UpstreamUnavailable


@dataclass(slots=True)
class SSOClient:
    base_url: str
    service_secret: str
    timeout: float = 10.0

    @property
    def _headers(self) -> dict[str, str]:
        return {"X-Service-Secret": self.service_secret}

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
    ) -> httpx.Response:
        url = f"{self.base_url}{path}"
        try:
            response = httpx.request(
                method=method,
                url=url,
                params=params,
                json=json,
                headers=self._headers,
                timeout=self.timeout,
            )
        except httpx.RequestError as exc:
            raise UpstreamUnavailable(
                service="sso",
                message="service unavailable",
            ) from exc
        return response

    @staticmethod
    def _detail_from_response(response: httpx.Response, fallback: str) -> str:
        try:
            data = response.json()
            detail = data.get("detail")
            if isinstance(detail, str) and detail:
                return detail
        except ValueError:
            pass
        return fallback

    def check_username(self, username: str) -> bool:
        response = self._request(
            "GET",
            "/api/users/check-username",
            params={"username": username},
        )
        if response.status_code != 200:
            raise UpstreamRejected(
                service="sso",
                status_code=response.status_code,
                message="failed to check username",
                detail=self._detail_from_response(response, "Ошибка проверки логина в SSO"),
            )
        return bool(response.json().get("available", False))

    def list_users(self, app_filter: str) -> list[dict[str, Any]]:
        response = self._request(
            "GET",
            "/api/users/",
            params={"app_filter": app_filter},
        )
        if response.status_code != 200:
            raise UpstreamRejected(
                service="sso",
                status_code=response.status_code,
                message="failed to list users",
                detail=self._detail_from_response(response, "Ошибка запроса списка пользователей в SSO"),
            )
        try:
            data = response.json()
        except ValueError:
            raise UpstreamRejected(
                service="sso",
                status_code=response.status_code,
                message="invalid json in users list response",
                detail="Некорректный ответ SSO",
            )
        if not isinstance(data, list):
            raise UpstreamRejected(
                service="sso",
                status_code=response.status_code,
                message="invalid users list shape",
                detail="Некорректный формат списка пользователей SSO",
            )
        return data

    def create_user(
        self,
        *,
        username: str,
        password: str,
        full_name: str,
        app: str,
        role: str,
        entity_id: str | None = None,
        ruz_teacher_id: int | None = None,
    ) -> dict[str, Any]:
        response = self._request(
            "POST",
            "/api/users/",
            json={
                "username": username,
                "password": password,
                "full_name": full_name,
                "app": app,
                "role": role,
                "entity_id": entity_id,
                "ruz_teacher_id": ruz_teacher_id,
            },
        )
        if response.status_code not in (200, 201):
            raise UpstreamRejected(
                service="sso",
                status_code=response.status_code,
                message="failed to create user",
                detail=self._detail_from_response(response, "Ошибка создания пользователя в SSO"),
            )
        try:
            payload = response.json()
        except ValueError:
            payload = {}
        if not isinstance(payload, dict):
            payload = {}
        return payload

    def provision_services_staff(
        self,
        *,
        username: str,
        password: str,
        full_name: str,
        entity_id: str,
    ) -> dict[str, Any]:
        response = self._request(
            "POST",
            "/api/provision/services/staff",
            json={
                "username": username,
                "password": password,
                "full_name": full_name,
                "entity_id": entity_id,
            },
        )
        if response.status_code not in (200, 201):
            raise UpstreamRejected(
                service="sso",
                status_code=response.status_code,
                message="failed to provision services staff",
                detail=self._detail_from_response(response, "Ошибка provisioning staff в SSO"),
            )
        payload = response.json()
        return payload if isinstance(payload, dict) else {}

    def provision_services_executor(
        self,
        *,
        username: str,
        password: str,
        full_name: str,
        entity_id: str,
    ) -> dict[str, Any]:
        response = self._request(
            "POST",
            "/api/provision/services/executor",
            json={
                "username": username,
                "password": password,
                "full_name": full_name,
                "entity_id": entity_id,
            },
        )
        if response.status_code not in (200, 201):
            raise UpstreamRejected(
                service="sso",
                status_code=response.status_code,
                message="failed to provision services executor",
                detail=self._detail_from_response(response, "Ошибка provisioning executor в SSO"),
            )
        payload = response.json()
        return payload if isinstance(payload, dict) else {}

    def provision_traffic_teacher(
        self,
        *,
        username: str,
        password: str,
        full_name: str,
        entity_id: str,
        ruz_teacher_id: int | None = None,
    ) -> dict[str, Any]:
        response = self._request(
            "POST",
            "/api/provision/traffic/teacher",
            json={
                "username": username,
                "password": password,
                "full_name": full_name,
                "entity_id": entity_id,
                "ruz_teacher_id": ruz_teacher_id,
            },
        )
        if response.status_code not in (200, 201):
            raise UpstreamRejected(
                service="sso",
                status_code=response.status_code,
                message="failed to provision traffic teacher",
                detail=self._detail_from_response(response, "Ошибка provisioning teacher в SSO"),
            )
        payload = response.json()
        return payload if isinstance(payload, dict) else {}

    def delete_user_by_entity(self, *, entity_id: str, app: str) -> None:
        response = self._request(
            "DELETE",
            f"/api/users/by-entity/{entity_id}",
            params={"app": app},
        )
        if response.status_code not in (200, 404):
            raise UpstreamRejected(
                service="sso",
                status_code=response.status_code,
                message="failed to delete user by entity",
                detail=self._detail_from_response(response, "Ошибка удаления пользователя в SSO"),
            )

    def get_user_by_telegram(self, *, telegram_id: int, app_filter: str) -> dict[str, Any] | None:
        response = self._request(
            "GET",
            f"/api/users/by-telegram/{telegram_id}",
            params={"app_filter": app_filter},
        )
        if response.status_code == 404:
            return None
        if response.status_code != 200:
            raise UpstreamRejected(
                service="sso",
                status_code=response.status_code,
                message="failed to get user by telegram",
                detail=self._detail_from_response(response, "Ошибка запроса пользователя в SSO"),
            )
        try:
            payload = response.json()
        except ValueError:
            raise UpstreamRejected(
                service="sso",
                status_code=response.status_code,
                message="invalid json in get user by telegram",
                detail="Некорректный ответ SSO",
            )
        if not isinstance(payload, dict):
            raise UpstreamRejected(
                service="sso",
                status_code=response.status_code,
                message="invalid user payload shape",
                detail="Некорректный формат пользователя SSO",
            )
        return payload

    def unlink_user_telegram(self, *, user_id: str) -> dict[str, Any]:
        response = self._request(
            "DELETE",
            f"/api/users/{user_id}/telegram-link",
        )
        if response.status_code != 200:
            raise UpstreamRejected(
                service="sso",
                status_code=response.status_code,
                message="failed to unlink telegram",
                detail=self._detail_from_response(response, "Ошибка отвязки Telegram в SSO"),
            )
        try:
            payload = response.json()
        except ValueError:
            payload = {}
        if not isinstance(payload, dict):
            payload = {}
        return payload
