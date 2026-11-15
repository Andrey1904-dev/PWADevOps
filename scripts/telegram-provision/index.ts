import { db, hash, json } from "../../supabase/functions/_shared/platform.ts";
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({}, 405);
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({}, 401);
  const client = db();
  const hashed = await hash(authorization.slice(7));
  const { data: authorized } = await client.rpc(
    "authorize_notification_worker",
    { hashed_token: hashed },
  );
  if (!authorized) return json({}, 401);
  try {
    const body = await req.json();
    if (
      typeof body.token !== "string" ||
      !/^\d+:[A-Za-z0-9_-]{30,60}$/.test(body.token)
    )
      return json({ error: "Invalid token format" }, 400);
    const call = async (method: string, payload: unknown = {}) => {
      const r = await fetch(
        `https://api.telegram.org/bot${body.token}/${method}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15000),
        },
      );
      const result = await r.json();
      if (!result.ok) throw Error(method);
      return result.result;
    };
    const me = await call("getMe");
    const secret =
      crypto.randomUUID().replaceAll("-", "") +
      crypto.randomUUID().replaceAll("-", "");
    const url = "https://andrey1904-dev.github.io/PWADevOps/";
    for (const [name, value] of Object.entries({
      telegram_bot_token: body.token,
      telegram_webhook_secret: secret,
      pwa_url: url,
    })) {
      const { error } = await client.rpc("store_runtime_secret", {
        secret_name: "devops_quest_" + name,
        secret_value: value,
      });
      if (error) throw Error("Secure storage");
    }
    await call("setWebhook", {
      url: Deno.env.get("SUPABASE_URL") + "/functions/v1/telegram-webhook",
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    });
    const commands: Record<string, string> = {
      start: "Приветствие и привязка",
      today: "План на сегодня",
      plan: "Учебный маршрут",
      progress: "Прогресс",
      missions: "Текущая миссия",
      mission: "Текущая миссия",
      done: "Завершить занятие",
      boss: "Следующий босс",
      week: "Статистика",
      stats: "Статистика",
      schedule: "График 2/2",
      reminders: "Уведомления",
      settings: "Настройки",
      help: "Справка",
      begin: "Начать занятие",
      stop: "Остановить таймер",
      note: "Заметка",
      status: "Статус миссии",
      pause: "Пауза",
      resume: "Продолжить",
    };
    await call("setMyCommands", {
      commands: Object.entries(commands).map(([command, description]) => ({
        command,
        description,
      })),
    });
    const webhook = await call("getWebhookInfo");
    await client
      .from("notification_worker_credentials")
      .delete()
      .eq("token_hash", hashed);
    return json({
      ok: true,
      bot: { id: me.id, username: me.username },
      webhook: {
        url: webhook.url,
        pending_update_count: webhook.pending_update_count,
        last_error_message: webhook.last_error_message || null,
      },
      commands: Object.keys(commands),
      storage: "Supabase Vault (Edge Secrets API unavailable)",
    });
  } catch {
    return json({ error: "Provisioning failed; no credentials logged" }, 503);
  }
});
