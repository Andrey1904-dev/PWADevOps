// Run only after deploying to the dedicated Supabase project. Secrets stay in environment.
const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
const projectUrl = Deno.env.get("SUPABASE_URL");
if (!token || !webhookSecret || !projectUrl)
  throw Error("Required secret environment bindings missing");
const result = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: projectUrl + "/functions/v1/telegram-webhook",
    secret_token: webhookSecret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  }),
});
const body = await result.json();
if (!body.ok) throw Error("Webhook setup failed; inspect Telegram securely");
const commands = [
  "start",
  "today",
  "plan",
  "progress",
  "mission",
  "done",
  "stats",
  "schedule",
  "reminders",
  "settings",
  "help",
  "begin",
  "note",
  "status",
  "pause",
  "resume",
];
const response = await fetch(
  `https://api.telegram.org/bot${token}/setMyCommands`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commands: commands.map((command) => ({
        command,
        description: (
          {
            start: "Привязка аккаунта",
            today: "План на сегодня",
            plan: "Учебный план",
            progress: "Прогресс",
            mission: "Текущая миссия",
            done: "Завершить занятие",
            stats: "Статистика",
            schedule: "График 2/2",
            reminders: "Уведомления",
            settings: "Настройки",
            help: "Справка",
            begin: "Начать занятие",
            note: "Добавить заметку",
            status: "Статус миссии",
            pause: "Пауза",
            resume: "Возобновить",
          } as Record<string, string>
        )[command],
      })),
    }),
  },
);
if (!(await response.json()).ok) throw Error("Command menu setup failed");
console.log(
  "Webhook and command menu configured. Live delivery still requires verification.",
);
