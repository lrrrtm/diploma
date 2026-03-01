import asyncio
import logging
import secrets
from collections.abc import Iterable

import httpx
from passlib.context import CryptContext
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.database import SessionLocal
from app.models.user import User

logger = logging.getLogger(__name__)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

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

    last_name = _translit(parts[0])
    last_name = "".join(ch for ch in last_name if ch.isalnum())

    initials = ""
    for part in parts[1:]:
        if not part:
            continue
        letter = _translit(part[0])
        letter = "".join(ch for ch in letter if "a" <= ch <= "z")
        initials += letter

    base = f"{last_name}.{initials}" if initials else last_name
    base = base.strip(".")
    if not base:
        base = f"teacher{ruz_teacher_id}"
    return base[:100]


def _username_with_suffix(base: str, suffix: int) -> str:
    if suffix <= 1:
        return base
    suffix_str = str(suffix)
    max_base_len = max(1, 100 - len(suffix_str))
    return f"{base[:max_base_len]}{suffix_str}"


async def _fetch_ruz_teachers() -> list[dict]:
    url = f"{settings.RUZ_BASE_URL}/teachers"
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            url,
            headers={"Accept": "application/json", "User-Agent": "Polytech-SSO-Sync/1.0"},
        )
    response.raise_for_status()
    data = response.json()
    teachers = data.get("teachers", [])
    if not isinstance(teachers, list):
        return []
    return teachers


def _normalize_teachers(raw_teachers: Iterable[dict]) -> list[tuple[int, str]]:
    result: list[tuple[int, str]] = []
    seen_ids: set[int] = set()
    for item in raw_teachers:
        if not isinstance(item, dict):
            continue
        ruz_teacher_id = item.get("id")
        full_name = item.get("full_name")
        if not isinstance(ruz_teacher_id, int) or ruz_teacher_id <= 0:
            continue
        if not isinstance(full_name, str) or not full_name.strip():
            continue
        if ruz_teacher_id in seen_ids:
            continue
        seen_ids.add(ruz_teacher_id)
        result.append((ruz_teacher_id, full_name.strip()))
    return result


def _sync_teachers_to_sso(teachers: list[tuple[int, str]]) -> dict[str, int]:
    db = SessionLocal()
    created = 0
    updated = 0
    skipped_existing = 0
    failed = 0

    try:
        existing_any_ruz_ids = {
            value
            for (value,) in (
                db.query(User.ruz_teacher_id)
                .filter(User.ruz_teacher_id.isnot(None))
                .all()
            )
            if isinstance(value, int)
        }
        existing_users_by_ruz = {
            user.ruz_teacher_id: user
            for user in (
                db.query(User)
                .filter(
                    User.app == "traffic",
                    User.role == "teacher",
                    User.ruz_teacher_id.isnot(None),
                )
                .all()
            )
            if isinstance(user.ruz_teacher_id, int)
        }
        used_usernames = {
            username
            for (username,) in db.query(User.username).all()
            if isinstance(username, str) and username
        }
        # Auto-synced teachers don't use password login flow in expected scenario.
        # Generate one strong random hash per sync run to avoid expensive per-user hashing.
        auto_password_hash = pwd_context.hash(secrets.token_urlsafe(32))

        for ruz_teacher_id, full_name in teachers:
            existing_user = existing_users_by_ruz.get(ruz_teacher_id)
            if existing_user is not None:
                if existing_user.full_name != full_name:
                    existing_user.full_name = full_name
                    db.commit()
                    updated += 1
                else:
                    skipped_existing += 1
                continue

            if ruz_teacher_id in existing_any_ruz_ids:
                skipped_existing += 1
                continue

            base = _username_base(full_name, ruz_teacher_id)
            if not base:
                failed += 1
                continue

            created_this_teacher = False

            for suffix in range(1, 10_000):
                username = _username_with_suffix(base, suffix)
                if username in used_usernames:
                    continue

                user = User(
                    username=username,
                    password_hash=auto_password_hash,
                    full_name=full_name,
                    app="traffic",
                    role="teacher",
                    entity_id=None,
                    ruz_teacher_id=ruz_teacher_id,
                )
                db.add(user)
                try:
                    db.commit()
                except IntegrityError:
                    db.rollback()
                    existing = db.query(User.id).filter(User.ruz_teacher_id == ruz_teacher_id).first()
                    if existing:
                        existing_any_ruz_ids.add(ruz_teacher_id)
                        skipped_existing += 1
                        created_this_teacher = True
                        break
                    continue

                used_usernames.add(username)
                existing_any_ruz_ids.add(ruz_teacher_id)
                existing_users_by_ruz[ruz_teacher_id] = user
                created += 1
                created_this_teacher = True
                break

            if not created_this_teacher:
                failed += 1

        return {
            "fetched": len(teachers),
            "created": created,
            "updated": updated,
            "skipped_existing": skipped_existing,
            "failed": failed,
        }
    finally:
        db.close()


async def run_teacher_sync_once() -> dict[str, int]:
    raw_teachers = await _fetch_ruz_teachers()
    normalized = _normalize_teachers(raw_teachers)
    # Run blocking SQLAlchemy + bcrypt work in a worker thread
    # so FastAPI event loop remains responsive.
    return await asyncio.to_thread(_sync_teachers_to_sso, normalized)


async def run_teacher_sync_forever() -> None:
    startup_delay = max(0, settings.TEACHER_SYNC_STARTUP_DELAY_SECONDS)
    interval = max(60, settings.TEACHER_SYNC_INTERVAL_SECONDS)

    if startup_delay > 0:
        await asyncio.sleep(startup_delay)

    while True:
        try:
            stats = await run_teacher_sync_once()
            logger.info(
                "Teacher sync completed: fetched=%s created=%s updated=%s skipped=%s failed=%s",
                stats["fetched"],
                stats["created"],
                stats["updated"],
                stats["skipped_existing"],
                stats["failed"],
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Teacher sync failed")

        await asyncio.sleep(interval)
