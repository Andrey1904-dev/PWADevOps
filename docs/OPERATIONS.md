# Подключение и восстановление

## Существующая инфраструктура

Использовать только репозиторий Andrey1904-dev/PWADevOps и проект okswmvxxoataxprjwzjv. Не создавать новые проекты. Для CLI 3 сначала читать `npx supabase <command> --help`; hosted-команды требуют явного выбора проекта/linked режима. Не запускать `db reset` на hosted проекте.

1. Проверить текущую историю миграций и сделать backup перед обновлением существующей базы.
2. Применить только отсутствующие миграции, затем `supabase/seed.sql`. Каталог не перезаписывает существующие пользовательские записи.
3. Развернуть `link-telegram`, `telegram-webhook`, `notification-worker`. У них platform verify_jwt выключен, authentication реализован внутри handler: Auth getUser / webhook secret / cron Vault credential соответственно.
4. Задать серверные Telegram secrets и PWA_URL. В текущем проекте действующие Telegram credentials уже находятся в Vault. Edge Secrets имеют приоритет, поэтому их можно настроить через Dashboard без изменения кода.
5. Указать в Supabase Auth Site URL и разрешённый redirect URL `https://andrey1904-dev.github.io/PWADevOps/`; настроить почтовую доставку и подтверждение email. Проверить signup/login/logout реальным пользователем.
6. Убедиться, что `devops_quest_notifications` активен в cron.job и последний HTTP-ответ worker имеет 200.
7. Опубликовать main через workflow; в Pages выбрать GitHub Actions, если автоматическое включение не разрешено.
8. Реальная проверка: signup → login → session → link code → Telegram /start → /begin /done → PWA refresh → status → notification consent → test delivery → /reminders off.

## Восстановление

- Исходники: checkout известного рабочего commit, `npm ci`, проверки, build и повторный workflow deploy. Не заменять lockfile без причины.
- Личные данные: Settings → экспорт JSON регулярно; импорт проверяет структуру и не переносит чужие UUID outbox. Импорт локальной копии в аккаунт выполняется явно; он не включается автоматически при входе.
- База: восстановить backup в предназначенный проект; проверить Auth users и FK, историю миграций, RLS, каталог, Cron/Vault. Не сбрасывать рабочую БД ради повторного применения initial migration.
- Конфликт: экспорт локального JSON, загрузка облачной версии; вручную перенести нужные изменения. Автоматического merge заметок нет.
- Telegram compromise: отозвать bot token через BotFather, заменить серверный secret и webhook secret, повторно выполнить конфигурацию webhook. Значения не помещать в Git.
- Cron credential rotation: в защищённом SQL/Vault UI заменить `devops_quest_cron_secret`, обновить notification_worker_credentials новым SHA-256, удалить старый хэш. Cron читает Vault при каждом запуске. Не выводить decrypted_secret в запросах диагностики.
- Доставка: проверять notification_jobs и notification_delivery_log без текстов секретов. Failed после сетевой неопределённости не переотправлять вслепую. Зависшие sending после expires_at переводятся в failed.
- При отключении напоминаний / блокировке бота новые отправки прекращаются. Pause обучения отличается от отдыха на один день.

## iPhone

Safari → открыть HTTPS PWA → Поделиться → На экран «Домой». Проверить запуск standalone, иконку, офлайн-перезагрузку и сохранение после закрытия. Это ещё требует подтверждения на настоящем устройстве. Уведомления приходят через Telegram, Web Push не используется.
