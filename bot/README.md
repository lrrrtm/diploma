# Traffic Telegram Bot

## Purpose

- Receives deep-link `/start register_<sso_user_id>`
- Links Telegram account to SSO user
- Opens Traffic teacher mini-app via Telegram WebApp button
- For plain `/start`:
  - if Telegram is linked to teacher account: sends WebApp button
  - if not linked: asks to scan registration QR first

## Required env vars

- `BOT_TOKEN`
- `SSO_SERVICE_SECRET`
- `SSO_API_URL` (default: `http://sso-backend:8000`)
- `TRAFFIC_TEACHER_URL` (default: `https://traffic.poly.hex8d.space/teacher`)

## BotFather mini-app URL

Set menu button URL (or WebApp URL) to:

- `https://traffic.poly.hex8d.space/teacher`
