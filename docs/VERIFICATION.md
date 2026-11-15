# Проверки — 15.11.2026

Локальные наборы: 23 unit/database/outbox tests, 6 Edge tests с адаптером, 6 браузерных сценариев (3 × desktop/mobile). Полные команды и последние фактические результаты смотрите в итоговом отчёте и GitHub Actions.

PGlite выполняет реальные PostgreSQL DDL/RLS/RPC, но не имитирует Supabase Auth, Edge Runtime, Vault, pg_net или pg_cron. Cron migration пропускается в PGlite и проверяется на выделенном Supabase отдельно.

Проверяются: 2/2 до/после anchor, DST spring/fall, тихие часы, уникальность операций, rollback конфликта версий, изоляция пользователей, запрет прямой записи, one-time link, repeated webhook update, SQL seed повторно, outbox после сетевого сбоя, отдельное локальное состояние аккаунтов, schema validation backup, production offline shell, отсутствие JS errors и горизонтального переполнения на мобильном размере.

Аудит npm после обновления transitive glob/minimatch: 0 critical/high/moderate, 4 low (одна root-проблема deepmerge в цепочке инструментов Workbox). Автоматический предложенный downgrade PWA-plugin не применяется: безопасная совместимость не доказана. Повторять audit в CI; production-only audit проверяется отдельно.

Не считать пройденными без живой проверки: реальная почтовая регистрация, Telegram API delivery, webhook secret из серверных Secrets, пользовательский opt-in уведомлений, PWA ↔ реальный Telegram, Safari/iPhone установка. Тестовые аккаунты и тестовые чат-ID не заменяют эти проверки.
