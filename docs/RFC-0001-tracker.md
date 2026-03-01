# RFC-0001 Progress Tracker

## Scope
- RFC: [RFC-0001-backend-consolidation.md](/Users/ext.alarionenko/repos_my/diploma-1/docs/RFC-0001-backend-consolidation.md)

## Phase Status
1. Phase 0 - Reset и baseline: `pending`
2. Phase 1 - Shared platform layer: `in_progress`
3. Phase 2 - Новый `schedule-backend`: `completed`
4. Phase 3 - Перевод потребителей на schedule service: `completed`
5. Phase 4 - SSO provisioning API: `completed`
6. Phase 5 - Teacher sync redesign: `in_progress`
7. Phase 6 - Миграции и cleanup: `in_progress`

## Phase 1 Checklist
1. [x] Создан пакет `shared/python/poly_shared`.
2. [x] Добавлены shared auth helpers (`launch_token`, `sso_token`).
3. [x] Добавлен shared `SSOClient`.
4. [x] Добавлен skeleton `ScheduleClient`.
5. [x] `traffic-backend` переведен на shared auth + shared SSO client (частично).
6. [x] `services-backend` переведен на shared auth + shared SSO client (частично).
7. [x] Docker build обновлен для подключения shared кода в `services-backend` и `traffic-backend`.
8. [ ] Завершить перевод остальных точек на shared слой (если появятся новые прямые вызовы SSO/launch verify).
9. [ ] Выполнить runtime smoke-test в docker окружении.

## Notes
- Phase 1 считается завершённой после локального smoke-test через `docker compose up --build` и базовой проверки API:
  - `services /api/auth/verify-launch`
  - `traffic /api/auth/verify-launch`
  - `traffic /api/teachers/*`
  - `services /api/departments/*`, `/api/executors/*`

## Phase 2 Checklist
1. [x] Создан новый сервис `schedule/backend`.
2. [x] Объединены endpoint-ы группового и аудиторного расписания.
3. [x] Добавлен endpoint `/api/schedule/teachers`.
4. [x] Сервис подключен в `docker-compose`.

## Phase 3 Checklist
1. [x] `main-backend` больше не ходит в RUZ напрямую, только в `schedule-backend`.
2. [x] `traffic-backend` больше не ходит в RUZ напрямую, только в `schedule-backend`.
3. [x] `sso` teacher sync получает преподавателей через `schedule-backend`.
4. [ ] Выполнить e2e smoke-test после сборки контейнеров.

## Phase 4 Checklist
1. [x] В SSO добавлен namespace `/api/provision/*`.
2. [x] Добавлены provisioning endpoints для `services staff`, `services executor`, `traffic teacher`.
3. [x] `services-backend` переведен на provisioning endpoints.
4. [x] `traffic-backend` переведен на provisioning endpoint для teacher.
5. [ ] Выполнить smoke-test create/delete flows в админках services/traffic.

## Phase 5 Checklist
1. [x] Добавлен sync-job в `traffic-backend` (расписание -> local teachers -> SSO provision).
2. [x] В `traffic.teachers` добавлен `ruz_teacher_id`.
3. [x] Поле `traffic.teachers.ruz_teacher_id` заведено в схеме (дальше перенесено в Alembic в Phase 6).
4. [x] Teacher sync в `sso` переключен на источник через `schedule-backend`.
5. [x] Legacy sync в `sso` отключен, источник истины по sync — `traffic-backend`.
6. [ ] Выполнить smoke-test: после sync у teacher в SSO обязательно заполнен `entity_id`.

## Phase 6 Checklist
1. [x] Добавлен Alembic в `traffic-backend` (config, env, initial revision).
2. [x] Добавлен Alembic в `sso-backend` (config, env, initial revision).
3. [x] Добавлен Alembic в `services-backend` (config, env, initial revision).
4. [x] Удален `create_all` и runtime schema alter из `traffic-backend`.
5. [x] Удален `create_all` и runtime schema alter из `sso-backend`.
6. [x] Удален `create_all` из `services-backend`.
7. [x] Docker startup переключен на `alembic upgrade head && uvicorn ...`.
8. [ ] Выполнить runtime smoke-test на сервере (docker rebuild + health/API checks).
