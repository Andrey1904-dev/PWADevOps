# Архитектура

Статический PWA на GitHub Pages → Supabase Auth/Data API/RPC. Telegram webhook → те же профили и нормализованные записи. Постоянный сервер не требуется.

## Модель записи

`profiles.state` — атомарный снимок личного workspace. `mission_progress`, `study_sessions`, `schedule_settings`, `notification_settings` — нормализованные проекции для запросов и планировщика. Все записи frontend проходят через `apply_operation`: `auth.uid()`, блокировка профиля, проверка UUID операции и версии, ограничения данных, одна SQL-транзакция. Повтор UUID возвращает текущую версию без повторного начисления времени. `bot_action` блокирует тот же профиль; read-команды не увеличивают версию.

Конфликт не перезаписывает облако автоматически. Пользователь может экспортировать локальную копию и загрузить облачную. Offline outbox сохраняется вместе с данными в localStorage. Долгие перерывы не дают дополнительных XP или автоматического подтверждения знаний.

## Доступ

Все таблицы public имеют RLS. Каталог читается авторизованными пользователями; личные записи доступны только владельцу. Прямые клиентские записи запрещены grants; RPC `ensure_profile` и `apply_operation` являются намеренными SECURITY DEFINER endpoints, берут владельца исключительно из `auth.uid()`, проверяют authentication и используют пустой search_path. Они не принимают user_id. Сервисные RPC закрыты для anon/authenticated. Таблицы linking tokens, webhook dedupe и credentials не открыты клиенту; отсутствие allow-policy намеренно запрещает клиентский доступ.

`link-telegram` проверяет bearer через Auth getUser. Новые коды выдаются не чаще раза в минуту под блокировкой профиля; одноразовое потребление атомарно. Принимаются только личные Telegram чаты, sender ID должен соответствовать chat ID. Username не используется как доказательство личности. Webhook требует отдельный secret header. Дубликаты update_id отбрасываются в БД. Команды ограничены 30 действиями на пользователя в минуту.

## Уведомления

Postgres pg_cron → pg_net → Edge worker. Vault хранит случайный cron credential; в public credentials находится только хэш, без клиентского доступа. Worker сверяет его через service-only RPC. Уведомления требуют Telegram connection, consent и enabled. Вычисления ведутся в пользовательском IANA timezone. При повторяющемся часе DST уникальный ключ wall-date/time не создаёт второй job. Пропущенные минуты не догоняются пачкой. TTL — пять минут; claim атомарный; перед доставкой повторно проверяются pause, consent, quiet hours, отдых и выполненные занятия.

Категории имеют базовые правила: weekly — воскресенье, review — перерыв от трёх дней, return — от семи дней, checkpoint — начало месяца, boss/chapter — по проверенным миссиям. Они ориентировочные, не алгоритм оценки знаний и не персональный spaced-repetition engine.

## Проверенные рекомендации Supabase

15.11.2026 прочитаны актуальный changelog, RLS и Edge Function Auth docs; учтены CLI v3 (локальный режим по умолчанию), актуальные publishable keys, отказ от устаревших TLS ciphers, PostgreSQL 17.11. Зависимости закреплены lockfile.

- https://supabase.com/changelog.md
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/functions/auth
- https://supabase.com/changelog/supabase-cli-v3

Telegram token и webhook secret хранятся в Supabase Vault. Подключённый инструмент не поддерживает Management API Edge Secrets; `runtimeSecret` предпочитает Edge Secrets и использует service-only RPC Vault как fallback. Секреты не находятся в файлах, frontend или Git; provisioning принимает токен по HTTPS, затем одноразовая provisioning capability удаляется. Временные provisioning/diagnostic endpoints после проверки отключены ответом 410.
