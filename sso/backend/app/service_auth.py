from app.config import settings


def resolve_service_caller(x_service_secret: str | None) -> str | None:
    if not x_service_secret:
        return None
    if x_service_secret == settings.SERVICES_SSO_SERVICE_SECRET:
        return "services"
    if x_service_secret == settings.TRAFFIC_SSO_SERVICE_SECRET:
        return "traffic"
    if x_service_secret == settings.BOT_SSO_SERVICE_SECRET:
        return "bot"
    return None


def caller_allowed_apps(caller: str) -> set[str]:
    if caller == "services":
        return {"services"}
    if caller == "traffic":
        return {"traffic"}
    if caller == "bot":
        return {"traffic"}
    return set()
