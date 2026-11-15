# Фактический статус — 15.11.2026

- Исходники опубликованы: https://github.com/Andrey1904-dev/PWADevOps
- Целевой PWA: https://andrey1904-dev.github.io/PWADevOps/ — **пока HTTP 404, не опубликован**.
- Причина: GitHub API и workflow configure-pages получают `403 Resource not accessible by integration` при первом создании Pages site. Проверки CI проходят, deploy блокируется внешними правами.
- Действие владельца: https://github.com/Andrey1904-dev/PWADevOps/settings/pages → **Source: GitHub Actions**, затем запустить workflow Quality and Pages повторно. Source и base path уже подготовлены.
- Supabase `okswmvxxoataxprjwzjv` подключён; 7 миграций, 18 глав, 360 миссий, RLS и серверные функции развёрнуты. Локальные имена миграций совпадают с фактической migration history.
- Бот: https://t.me/PwaDevOps_Bot ; getMe успешен.
- Webhook: https://okswmvxxoataxprjwzjv.supabase.co/functions/v1/telegram-webhook ; getWebhookInfo: pending=0, last_error отсутствует на момент проверки.
- Команды зарегистрированы: /start /today /plan /progress /missions /mission /done /boss /week /stats /schedule /reminders /settings /help /begin /stop /note /status /pause /resume. Inline-меню и callback handling проверены HTTP-адаптером.
- Cron `devops_quest_notifications` активен, каждую минуту; реальные HTTP-ответы worker — 200. Часы по умолчанию: 09:00, 13:00, 18:00, 21:30, пользовательский IANA timezone, opt-in, quiet hours, snooze, отдых и dedupe.
- Telegram token и webhook secret сохранены в **Supabase Vault**, не Edge Function Secrets: подключённый инструмент не умеет изменять Edge Secrets. Server-only fallback работает; Edge Secrets можно добавить позже, они будут иметь приоритет.
- Подтверждённых личных chat ID пока нет. Тестовая отправка пользователю и персональная доставка по расписанию не объявляются проверенными. Нужны вход в PWA, одноразовая привязка, дата первой смены, timezone и явное согласие.
- Проверки: 24 local unit/database/outbox, 9 Edge adapter, 6 desktop/mobile production browser; 24 live assertions Auth/RLS/linking/state sync/Telegram API. Реальные пользовательские сообщения и установка на iPhone остаются на финальную проверку.
- npm production audit: 0 vulnerabilities. Полный audit: 4 low в dev-зависимостях цепочки deepmerge/Workbox; critical/high/moderate=0.
- Security advisor: 2 ожидаемых предупреждения о SECURITY DEFINER публичных authenticated RPC, ограничения и ownership проверены. Подробности в VERIFICATION.md.

Система ещё не считается полностью опубликованной. Код и доступные серверные интеграции готовы; Pages требует изменения настройки владельцем, а пользовательская Telegram-доставка требует привязки и opt-in.
