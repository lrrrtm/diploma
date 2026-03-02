# Security Hardening Tracker

Дата старта: 2026-03-02

## P0

- [x] `services`: заявки студента больше не доверяют `student_external_id` из query/body.
- [x] `services`: добавлен `X-Student-Token` (верифицированный server-side session token).
- [x] `services`: staff/executor операции по заявкам и услугам ограничены своим подразделением.
- [x] `sso`: сервисный секрет больше не может создавать/удалять пользователей через `/api/users/*`.
- [x] `traffic`: введён отдельный `tablet_secret` (вместо auth по `display_pin`).
- [x] `traffic`: добавлен basic rate-limit на lookup PIN.
- [x] `traffic`: стабилизирован online/offline индикатор через grace-period на disconnect.

## P1

- [x] Разделить inter-service secrets по приложениям + scope matrix.
- [x] Убрать JWT из query callback в `main` (перевод на URL fragment `#token=`).
- [x] CORS allowlist вместо wildcard.
- [x] Защита upload в `services` (валидация формата + лимит размера на backend).
- [x] Защита download в `services` (контролируемая выдача через авторизованный endpoint).
- [x] Внедрить `access + refresh` токены с ротацией.
- [x] Централизованный audit-log для критичных действий.

## P2

- [ ] Server-side pagination/search во всех тяжёлых списках (включая remaining endpoints).
- [ ] Набор интеграционных security тестов (RBAC + negative cases).
- [ ] Метрики безопасности и устойчивости (auth errors, rate-limit, sync failures).
