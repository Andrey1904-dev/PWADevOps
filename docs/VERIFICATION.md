# Проверки — 15.11.2026

Локальные наборы: 24 unit/database/outbox tests, 8 Edge tests с адаптером, 6 браузерных сценариев (3 × desktop/mobile). Полные команды и последние фактические результаты смотрите в итоговом отчёте и GitHub Actions.

PGlite выполняет реальные PostgreSQL DDL/RLS/RPC, но не имитирует Supabase Auth, Edge Runtime, Vault, pg_net или pg_cron. Cron migration пропускается в PGlite и проверяется на выделенном Supabase отдельно.

Проверяются: 2/2 до/после anchor, DST spring/fall, тихие часы, уникальность операций, rollback конфликта версий, изоляция пользователей, запрет прямой записи, one-time link, repeated webhook update, SQL seed повторно, outbox после сетевого сбоя, отдельное локальное состояние аккаунтов, schema validation backup, production offline shell, отсутствие JS errors и горизонтального переполнения на мобильном размере.

Аудит npm после обновления transitive glob/minimatch: 0 critical/high/moderate, 4 low (одна root-проблема deepmerge в цепочке инструментов Workbox). Автоматический предложенный downgrade PWA-plugin не применяется: безопасная совместимость не доказана. Повторять audit в CI; production-only audit проверяется отдельно.

Живая серверная проверка: 24 успешных assertions, включая Auth password login/logout двух временных аккаунтов, создание профиля, RLS, запрет прямой записи, idempotency, conflict, authenticated Edge linking, одноразовый код, RPC обмен PWA→bot→PWA, getMe, getWebhookInfo и getMyCommands. Временные аккаунты удалены. Cron/pg_net реально возвращают HTTP 200.

Не считать пройденными: доставку email подтверждения, Telegram sendMessage в настоящий пользовательский чат, opt-in реального пользователя, обмен через сообщения Telegram на настоящем устройстве и Safari/iPhone установку. Тестовые аккаунты и тестовые чат-ID не заменяют эти проверки.

Supabase advisors: остаются 2 предупреждения о намеренно callable SECURITY DEFINER RPC (`ensure_profile`, `apply_operation`). Проверены auth.uid ownership, пустой search_path, запрет anon, отсутствие входного user_id, ограничения и реальные RLS-тесты. Service-only RPC секретов закрыты от клиента. [Описание предупреждения](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Исправлено в ходе проверки: Supabase default grants дополнительно отозваны явной миграцией; ключ ежедневной доставки теперь включает локальную дату; поздний ACK сохраняет все новые поля/операции; локальные данные разделены по аккаунтам.
