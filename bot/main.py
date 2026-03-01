import asyncio
import logging
import re
from dataclasses import dataclass

import httpx
from aiogram import Bot, Dispatcher
from aiogram.filters import CommandStart
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo
from pydantic_settings import BaseSettings, SettingsConfigDict


REGISTER_RE = re.compile(r"^register_([0-9a-fA-F-]{36})$")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    BOT_TOKEN: str
    SSO_API_URL: str = "http://sso-backend:8000"
    SSO_SERVICE_SECRET: str
    TRAFFIC_TEACHER_URL: str = "https://traffic.poly.hex8d.space/teacher"


@dataclass(slots=True)
class AppContext:
    settings: Settings


def teacher_webapp_markup(url: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Открыть кабинет преподавателя",
                    web_app=WebAppInfo(url=url),
                )
            ]
        ]
    )


async def link_telegram_to_sso_user(ctx: AppContext, user_id: str, message: Message) -> tuple[bool, str]:
    if not message.from_user:
        return False, "Не удалось определить Telegram-пользователя."

    payload = {
        "telegram_id": message.from_user.id,
        "telegram_username": message.from_user.username,
        "chat_id": message.chat.id,
    }
    headers = {"X-Service-Secret": ctx.settings.SSO_SERVICE_SECRET}

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(
            f"{ctx.settings.SSO_API_URL}/api/users/{user_id}/telegram-link",
            json=payload,
            headers=headers,
        )

    if response.status_code in (200, 201):
        return True, "Аккаунт преподавателя успешно привязан к Telegram."

    try:
        detail = response.json().get("detail", "")
    except ValueError:
        detail = ""
    if detail:
        return False, f"Не удалось привязать аккаунт: {detail}"
    return False, "Не удалось привязать аккаунт преподавателя."


def configure_handlers(dp: Dispatcher, ctx: AppContext) -> None:
    @dp.message(CommandStart(deep_link=True))
    async def start_with_payload(message: Message) -> None:
        command = (message.text or "").strip().split(maxsplit=1)
        payload = command[1] if len(command) > 1 else ""

        match = REGISTER_RE.match(payload)
        if not match:
            await message.answer(
                "Бот для преподавателей посещаемости СПбПУ.\n"
                "Используйте кнопку ниже, чтобы открыть кабинет.",
                reply_markup=teacher_webapp_markup(ctx.settings.TRAFFIC_TEACHER_URL),
            )
            return

        sso_user_id = match.group(1)
        linked, response_text = await link_telegram_to_sso_user(ctx, sso_user_id, message)

        if linked:
            await message.answer(
                f"{response_text}\nТеперь можно открыть кабинет преподавателя:",
                reply_markup=teacher_webapp_markup(ctx.settings.TRAFFIC_TEACHER_URL),
            )
        else:
            await message.answer(response_text)

    @dp.message(CommandStart())
    async def start_plain(message: Message) -> None:
        await message.answer(
            "Бот для преподавателей посещаемости СПбПУ.\n"
            "Откройте кабинет преподавателя кнопкой ниже.",
            reply_markup=teacher_webapp_markup(ctx.settings.TRAFFIC_TEACHER_URL),
        )


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    settings = Settings()
    ctx = AppContext(settings=settings)

    bot = Bot(token=settings.BOT_TOKEN)
    dp = Dispatcher()
    configure_handlers(dp, ctx)

    await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())


if __name__ == "__main__":
    asyncio.run(main())
