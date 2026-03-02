import asyncio
import logging
import secrets
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from collections.abc import Iterable
from typing import Any

import httpx

from app.config import settings
from app.database import SessionLocal
from app.models.session import Session as TrackingSession
from app.models.teacher import Teacher
from poly_shared.clients.sso_client import SSOClient
from poly_shared.errors import UpstreamRejected, UpstreamUnavailable

logger = logging.getLogger(__name__)


_SYNC_LOCK = asyncio.Lock()
_MANUAL_TASK: asyncio.Task | None = None
_SYNC_STATE: dict[str, Any] = {
    "running": False,
    "last_source": None,
    "last_started_at": None,
    "last_finished_at": None,
    "last_success_at": None,
    "last_error": None,
    "last_stats": None,
    "runs_total": 0,
    "runs_failed": 0,
}

_TRANS = {
    "а": "a",
    "б": "b",
    "в": "v",
    "г": "g",
    "д": "d",
    "е": "e",
    "ё": "e",
    "ж": "zh",
    "з": "z",
    "и": "i",
    "й": "y",
    "к": "k",
    "л": "l",
    "м": "m",
    "н": "n",
    "о": "o",
    "п": "p",
    "р": "r",
    "с": "s",
    "т": "t",
    "у": "u",
    "ф": "f",
    "х": "kh",
    "ц": "ts",
    "ч": "ch",
    "ш": "sh",
    "щ": "shch",
    "ъ": "",
    "ы": "y",
    "ь": "",
    "э": "e",
    "ю": "yu",
    "я": "ya",
}


def _translit(value: str) -> str:
    return "".join(_TRANS.get(char, char) for char in value.lower())


def _username_base(full_name: str, ruz_teacher_id: int) -> str:
    parts = [part for part in full_name.strip().split() if part]
    if not parts:
        return f"teacher{ruz_teacher_id}"

    last_name = "".join(ch for ch in _translit(parts[0]) if ch.isalnum())
    initials = ""
    for part in parts[1:]:
        if not part:
            continue
        first = "".join(ch for ch in _translit(part[0]) if "a" <= ch <= "z")
        initials += first

    base = f"{last_name}.{initials}" if initials else last_name
    base = base.strip(".")
    if not base:
        base = f"teacher{ruz_teacher_id}"
    return base[:100]


async def _fetch_teachers_from_schedule() -> list[dict]:
    url = f"{settings.SCHEDULE_API_URL}/api/schedule/teachers"
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            url,
            headers={"Accept": "application/json", "User-Agent": "Polytech-Traffic-Sync/1.0"},
        )
    response.raise_for_status()
    payload = response.json()
    teachers = payload.get("teachers", [])
    if not isinstance(teachers, list):
        return []
    return teachers


def _normalize(raw_teachers: Iterable[dict]) -> list[tuple[int, str]]:
    result: list[tuple[int, str]] = []
    seen: set[int] = set()
    for item in raw_teachers:
        if not isinstance(item, dict):
            continue
        ruz_teacher_id = item.get("id")
        full_name = item.get("full_name")
        if not isinstance(ruz_teacher_id, int) or ruz_teacher_id <= 0:
            continue
        if not isinstance(full_name, str) or not full_name.strip():
            continue
        if ruz_teacher_id in seen:
            continue
        seen.add(ruz_teacher_id)
        result.append((ruz_teacher_id, full_name.strip()))
    return result


def _pick_available_username(client: SSOClient, full_name: str, ruz_teacher_id: int) -> str:
    base = _username_base(full_name, ruz_teacher_id)
    for suffix in range(0, 10_000):
        candidate = base if suffix == 0 else f"{base[: max(1, 100 - len(str(suffix + 1)))]}{suffix + 1}"
        if client.check_username(candidate):
            return candidate
    raise RuntimeError(f"Could not pick username for teacher {ruz_teacher_id}")


def _sync_to_traffic_and_sso(teachers: list[tuple[int, str]]) -> dict[str, int]:
    db = SessionLocal()
    created_local = 0
    updated_local = 0
    removed_local = 0
    created_or_linked_sso = 0
    skipped = 0
    failed = 0
    failed_sample: list[dict[str, Any]] = []

    client = SSOClient(
        base_url=settings.SSO_API_URL,
        service_secret=settings.SSO_SERVICE_SECRET,
    )

    try:
        local_by_ruz = {
            teacher.ruz_teacher_id: teacher
            for teacher in db.query(Teacher).filter(Teacher.ruz_teacher_id.isnot(None)).all()
            if isinstance(teacher.ruz_teacher_id, int)
        }

        sso_users = client.list_users(app_filter="traffic")
        sso_by_entity: dict[str, dict] = {}
        sso_by_ruz: dict[int, dict] = {}
        for user in sso_users:
            if user.get("role") != "teacher":
                continue
            entity_id = user.get("entity_id")
            ruz_teacher_id = user.get("ruz_teacher_id")
            if isinstance(entity_id, str):
                sso_by_entity[entity_id] = user
            if isinstance(ruz_teacher_id, int):
                sso_by_ruz[ruz_teacher_id] = user

        source_ids = {teacher_id for teacher_id, _ in teachers}

        for ruz_teacher_id, full_name in teachers:
            teacher = local_by_ruz.get(ruz_teacher_id)
            if teacher is None:
                teacher = Teacher(
                    id=str(uuid.uuid4()),
                    full_name=full_name,
                    ruz_teacher_id=ruz_teacher_id,
                )
                db.add(teacher)
                db.commit()
                db.refresh(teacher)
                local_by_ruz[ruz_teacher_id] = teacher
                created_local += 1
            elif teacher.full_name != full_name:
                teacher.full_name = full_name
                db.commit()
                updated_local += 1
            else:
                skipped += 1

            existing_sso = sso_by_entity.get(teacher.id)
            if existing_sso is not None:
                continue

            try:
                existing_by_ruz = sso_by_ruz.get(ruz_teacher_id)
                if existing_by_ruz and isinstance(existing_by_ruz.get("username"), str):
                    username = existing_by_ruz["username"]
                else:
                    username = _pick_available_username(client, full_name, ruz_teacher_id)

                client.provision_traffic_teacher(
                    username=username,
                    password=secrets.token_urlsafe(24),
                    full_name=full_name,
                    entity_id=teacher.id,
                    ruz_teacher_id=ruz_teacher_id,
                )
                created_or_linked_sso += 1
            except (UpstreamRejected, UpstreamUnavailable, RuntimeError) as exc:
                failed += 1
                if len(failed_sample) < 50:
                    failed_sample.append(
                        {
                            "ruz_teacher_id": ruz_teacher_id,
                            "full_name": full_name,
                            "reason": str(exc),
                        }
                    )
                logger.exception("Failed to provision SSO teacher for ruz_teacher_id=%s", ruz_teacher_id)

        stale_teachers = [
            teacher
            for teacher in db.query(Teacher).filter(Teacher.ruz_teacher_id.isnot(None)).all()
            if isinstance(teacher.ruz_teacher_id, int) and teacher.ruz_teacher_id not in source_ids
        ]
        for stale in stale_teachers:
            try:
                db.query(TrackingSession).filter(TrackingSession.teacher_id == stale.id).update(
                    {TrackingSession.teacher_id: None},
                    synchronize_session=False,
                )
                db.delete(stale)
                db.commit()
                removed_local += 1
                try:
                    client.delete_user_by_entity(entity_id=stale.id, app="traffic")
                except (UpstreamRejected, UpstreamUnavailable):
                    logger.warning("Failed to delete stale SSO user by entity %s", stale.id)
            except Exception:
                db.rollback()
                logger.exception("Failed to remove stale teacher id=%s ruz_teacher_id=%s", stale.id, stale.ruz_teacher_id)

        return {
            "fetched": len(teachers),
            "created_local": created_local,
            "updated_local": updated_local,
            "removed_local": removed_local,
            "created_or_linked_sso": created_or_linked_sso,
            "skipped": skipped,
            "failed": failed,
            "failed_sample": failed_sample,
        }
    finally:
        db.close()


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_teacher_sync_status() -> dict[str, Any]:
    payload = deepcopy(_SYNC_STATE)
    payload["running"] = _SYNC_LOCK.locked()
    payload["enabled"] = settings.TRAFFIC_TEACHER_SYNC_ENABLED
    payload["interval_seconds"] = settings.TRAFFIC_TEACHER_SYNC_INTERVAL_SECONDS
    payload["startup_delay_seconds"] = settings.TRAFFIC_TEACHER_SYNC_STARTUP_DELAY_SECONDS
    return payload


def is_teacher_sync_running() -> bool:
    return _SYNC_LOCK.locked()


async def run_teacher_sync_once(source: str = "scheduler") -> dict[str, Any]:
    async with _SYNC_LOCK:
        started_at = _iso_now()
        _SYNC_STATE["running"] = True
        _SYNC_STATE["last_source"] = source
        _SYNC_STATE["last_started_at"] = started_at
        _SYNC_STATE["last_error"] = None
        _SYNC_STATE["runs_total"] = int(_SYNC_STATE["runs_total"]) + 1

        try:
            raw = await _fetch_teachers_from_schedule()
            normalized = _normalize(raw)
            stats = await asyncio.to_thread(_sync_to_traffic_and_sso, normalized)
            _SYNC_STATE["last_stats"] = stats
            _SYNC_STATE["last_success_at"] = _iso_now()
            return stats
        except Exception as exc:
            _SYNC_STATE["last_error"] = str(exc)
            _SYNC_STATE["runs_failed"] = int(_SYNC_STATE["runs_failed"]) + 1
            raise
        finally:
            _SYNC_STATE["running"] = False
            _SYNC_STATE["last_finished_at"] = _iso_now()


def _manual_task_done(task: asyncio.Task) -> None:
    global _MANUAL_TASK
    _MANUAL_TASK = None
    try:
        task.result()
    except Exception:
        logger.exception("Manual teacher sync failed")


def trigger_teacher_sync_now() -> bool:
    global _MANUAL_TASK
    if _SYNC_LOCK.locked():
        return False
    if _MANUAL_TASK is not None and not _MANUAL_TASK.done():
        return False
    loop = asyncio.get_running_loop()
    _MANUAL_TASK = loop.create_task(run_teacher_sync_once(source="manual"), name="traffic-teacher-sync-manual")
    _MANUAL_TASK.add_done_callback(_manual_task_done)
    return True


async def run_teacher_sync_forever() -> None:
    startup_delay = max(0, settings.TRAFFIC_TEACHER_SYNC_STARTUP_DELAY_SECONDS)
    interval = max(60, settings.TRAFFIC_TEACHER_SYNC_INTERVAL_SECONDS)

    if startup_delay > 0:
        await asyncio.sleep(startup_delay)

    while True:
        try:
            stats = await run_teacher_sync_once(source="scheduler")
            logger.info(
                (
                    "Traffic teacher sync completed: fetched=%s created_local=%s "
                    "updated_local=%s removed_local=%s created_or_linked_sso=%s "
                    "skipped=%s failed=%s"
                ),
                stats["fetched"],
                stats["created_local"],
                stats["updated_local"],
                stats["removed_local"],
                stats["created_or_linked_sso"],
                stats["skipped"],
                stats["failed"],
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Traffic teacher sync failed")

        await asyncio.sleep(interval)
