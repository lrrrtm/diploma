# RFC-0001: Консолидация backend-архитектуры (dev-first, без backward compatibility)

## Статус
- In Progress

## Дата
- 2026-03-02

## Автор
- Команда Traffic/SSO/Main/Services

## Текущий прогресс
- Трекер этапов: [RFC-0001-tracker.md](/Users/ext.alarionenko/repos_my/diploma-1/docs/RFC-0001-tracker.md)
- Активная фаза: `Phase 5 - Teacher sync redesign`

## Контекст
Сейчас в монорепозитории 4 backend-сервиса:
- `main/backend`
- `services/backend`
- `traffic/backend`
- `sso/backend`

Ключевые проблемы:
- Логика расписания (RUZ) размазана по сервисам.
- Межсервисные вызовы к SSO написаны прямо в роутерах и дублируются.
- Нет единого инфраструктурного слоя для client/retry/timeout/error mapping.
- Нет миграционной дисциплины (alembic), в ряде мест схема меняется при старте.

Важно: проект на этапе разработки, production отсутствует.  
Решение: можно делать **breaking changes**, **без обратной совместимости**, с полным ресетом данных.

---

## Цели
1. Единый backend расписания, который используют остальные сервисы.
2. Единая роль SSO как identity/provisioning сервиса для всех пользователей.
3. Убрать дублирование httpx-логики и auth-проверок.
4. Перейти на миграции БД (Alembic) во всех stateful сервисах.
5. Упростить архитектуру для дальнейшего развития Telegram flow и teacher sync.

## Не цели
1. Сохранение текущих API-контрактов для фронтов.
2. Миграция существующих данных.
3. Поддержка старых endpoint-ов и legacy маршрутов.

---

## Целевая архитектура

### Сервисы и ответственность
1. `sso-backend`
- Управление пользователями, ролями, связями с внешними идентификаторами.
- Выдача токенов SSO.
- Provisioning API для доменных сервисов.
- Telegram-link API.

2. `schedule-backend` (новый сервис)
- Единый gateway к RUZ.
- Нормализованные endpoint-ы по группам, аудиториям, преподавателям.
- Опциональный in-memory/Redis cache.

3. `traffic-backend`
- Домен посещаемости (kiosk, sessions, attendance).
- Не ходит в RUZ напрямую.
- Использует `schedule-backend` и `sso-backend` через shared clients.

4. `services-backend`
- Домен заявок/услуг.
- Использует `sso-backend` через shared clients.

5. `main-backend`
- Студенческий auth (CAS), miniapps launch token, gradebook.
- Для расписания ходит только в `schedule-backend`.

### Принцип границ домена
- Каждый сервис владеет только своей БД и таблицами.
- Связи между сервисами только через API-контракты.
- Запрещены прямые SQL-зависимости между сервисами.

---

## Новая структура репозитория

```text
.
├── shared/
│   └── python/
│       ├── clients/
│       │   ├── sso_client.py
│       │   └── schedule_client.py
│       ├── auth/
│       │   ├── launch_token.py
│       │   └── sso_token.py
│       └── observability/
│           └── request_context.py
├── schedule/
│   └── backend/
│       ├── app/
│       │   ├── routers/
│       │   ├── services/
│       │   └── main.py
│       ├── requirements.txt
│       └── Dockerfile
└── (main|services|traffic|sso)/backend
```

---

## API-контракты (v1, целевые)

### Schedule API
Базовый префикс: `/api/schedule`

1. `GET /groups/resolve?faculty_abbr=&group_name=`
- response:
```json
{ "faculty_id": 0, "group_id": 0 }
```

2. `GET /groups/{group_id}/week?date=YYYY-MM-DD`
- response: normalized weekly schedule.

3. `GET /buildings`

4. `GET /buildings/{building_id}/rooms`

5. `GET /rooms/{room_id}/day?date=YYYY-MM-DD`
- response: расписание аудитории на день.

6. `GET /teachers`
- response:
```json
{
  "teachers": [
    { "id": 15498, "oid": 33189, "full_name": "..." }
  ]
}
```

### SSO Provisioning API
Базовый префикс: `/api/provision`

1. `POST /traffic/teachers`
- upsert преподавателя в SSO по `ruz_teacher_id` и/или `entity_id`.

2. `POST /services/staff`

3. `POST /services/executors`

4. `POST /traffic/teacher-link-telegram`

Текущий `/api/users/*` оставляем как internal admin API, provisioning-операции переводим в отдельный namespace.

---

## Изменения в моделях

### SSO (`users`)
- Оставляем:
  - `id`, `username`, `password_hash`, `full_name`, `app`, `role`, `entity_id`, `is_active`, `created_at`.
- Для teacher sync:
  - `ruz_teacher_id` (nullable, unique).

### Traffic (`teachers`)
- Добавляем `ruz_teacher_id` (nullable, unique).
- Устанавливаем связь на уровне данных:
  - `traffic.teachers.id` <-> `sso.users.entity_id` для app=`traffic`, role=`teacher`.

---

## План реализации (без backward compatibility)

### Phase 0 — Reset и baseline
1. Останавливаем стек.
2. Удаляем volumes БД:
- `sso_db_data`
- `services_db_data`
- `traffic_db_data`
3. Удаляем legacy ветки кода, которые сохраняли совместимость.
4. Поднимаем чистый стек.

Результат: чистая схема и детерминированное состояние.

### Phase 1 — Shared platform layer
1. Создать `shared/python` с:
- `sso_client`
- `schedule_client`
- общими auth helpers (launch/sso token decode)
- общими исключениями (`UpstreamUnavailable`, `BadUpstreamResponse`, ...).
2. Подключить shared слой в `services` и `traffic`.
3. Удалить inline httpx helper-ы из роутеров.

### Phase 2 — Новый `schedule-backend`
1. Создать сервис `schedule/backend`.
2. Перенести и объединить RUZ-логику из:
- `main/backend/app/routers/schedule.py`
- `traffic/backend/app/routers/schedule.py`
3. Добавить единый нормализатор response.
4. Добавить в `docker-compose.yml` сервис `schedule-backend`.

### Phase 3 — Перевод потребителей на schedule service
1. `main-backend`:
- удалить локальный router `schedule`.
- заменить на проксирующий слой к `schedule_client` либо прямое использование из frontend.
2. `traffic-backend`:
- удалить прямые вызовы RUZ.
- использовать `schedule_client`.

### Phase 4 — SSO provisioning API
1. Добавить `/api/provision/*` в SSO.
2. Перевести создание staff/executor/teacher в `services` и `traffic` на provisioning endpoints.
3. Удалить дублирующие helper-ы в роутерах.

### Phase 5 — Teacher sync redesign
1. Sync-job переезжает из `sso` в `traffic` (domain ownership преподавателей в traffic) либо остаётся в `sso`, но использует provisioning flow:
- сначала upsert teacher в `traffic`,
- затем upsert user в `sso` с корректным `entity_id`.
2. Запретить создание `traffic`-teacher users с `entity_id = null`.

Рекомендуемый вариант: **sync в `traffic`**, потому что teacher — доменная сущность traffic.

### Phase 6 — Миграции и cleanup
1. Добавить Alembic в `sso/services/traffic`.
2. Убрать `create_all` и runtime schema-alter из lifespan.
3. Ввести единую команду старта dev:
- `alembic upgrade head && uvicorn ...`

---

## Последовательность PR-ов

1. PR-1: `shared/python` (clients + auth helpers + errors)
2. PR-2: `schedule/backend` skeleton + endpoints + tests
3. PR-3: `main` migration to schedule-client
4. PR-4: `traffic` migration to schedule-client
5. PR-5: SSO provisioning endpoints
6. PR-6: `services` migration to provisioning API
7. PR-7: `traffic` teacher provisioning migration
8. PR-8: teacher sync redesign
9. PR-9: Alembic adoption + remove runtime schema hacks
10. PR-10: dead code removal + doc refresh

---

## Технические правила после рефакторинга
1. Никакого `httpx.*` прямо в роутерах — только через shared clients.
2. Никакого доступа к внешним API (RUZ/CAS/SSO) из бизнес-роутов напрямую.
3. Никаких schema-изменений в runtime-коде приложения.
4. Все межсервисные вызовы имеют:
- timeout,
- retry policy,
- единый формат ошибок,
- request correlation id.

---

## Риски
1. Скачок объёма работ в одном спринте.
- Митигируем дроблением на PR-этапы.
2. Изменения контрактов фронтов.
- Митигируем обновлением frontend в тех же PR, без слоя совместимости.
3. Повторная деградация при sync.
- Митигируем domain ownership + rate limiting + batch processing.

---

## Критерии готовности (Definition of Done)
1. В проекте ровно один backend расписания.
2. `main` и `traffic` не имеют прямых вызовов к RUZ.
3. `services` и `traffic` не содержат inline SSO httpx helper-ов.
4. Все stateful сервисы запускаются через alembic migrations.
5. Teacher sync создаёт консистентные записи:
- `traffic.teacher` существует,
- `sso.user(entity_id=traffic.teacher.id)` существует.

---

## Операционный режим для разработки
Разрешён полный reset данных при каждом крупном этапе:
- `docker compose down -v`
- `docker compose up --build`

Обратная совместимость API не поддерживается до этапа стабилизации.
