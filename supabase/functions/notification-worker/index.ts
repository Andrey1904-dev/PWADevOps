import {
  db,
  json,
  equal,
  telegram,
  hash,
  runtimeSecret,
} from "../_shared/platform.ts";
import { localParts, quiet, dayType } from "../../../src/domain.ts";
export const handler = async (req: Request): Promise<Response> => {
  const secret = Deno.env.get("NOTIFICATION_CRON_SECRET");
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ") || authorization.length > 512)
    return json({}, 401);
  if (secret) {
    if (!equal(authorization, `Bearer ${secret}`)) return json({}, 401);
  } else {
    const { data, error } = await db().rpc("authorize_notification_worker", {
      hashed_token: await hash(authorization.slice(7)),
    });
    if (error || !data) return json({}, 401);
  }
  if (req.method !== "POST") return json({}, 405);
  if (!(await runtimeSecret("TELEGRAM_BOT_TOKEN")))
    return json({ ok: true, delivery: "waiting_for_telegram_token" });
  const client = db();
  const now = new Date();
  const { data: settings, error } = await client
    .from("notification_settings")
    .select("*")
    .eq("enabled", true)
    .not("consent_at", "is", null);
  if (error) return json({}, 503);
  for (const n of settings || []) {
    const [{ data: s }, { data: c }, { data: p }] = await Promise.all([
      client
        .from("schedule_settings")
        .select("*")
        .eq("user_id", n.user_id)
        .single(),
      client
        .from("telegram_connections")
        .select("*")
        .eq("user_id", n.user_id)
        .eq("blocked", false)
        .maybeSingle(),
      client.from("profiles").select("state").eq("id", n.user_id).single(),
    ]);
    if (!s?.timezone || !s.first_shift || s.paused || !c) continue;
    let local;
    try {
      local = localParts(now, s.timezone);
    } catch {
      continue;
    }
    if (quiet(local.time, n.quiet_start.slice(0, 5), n.quiet_end.slice(0, 5)))
      continue;
    const kind = dayType(local.date, s.first_shift);
    const times = kind === "work" ? n.work_times : n.rest_times;
    const candidates: {
      category: string;
      key: string;
      text: string;
      kind?: string;
    }[] = [];
    if (times.includes(local.time) && n.categories.daily)
      candidates.push({
        category: "daily",
        key: `${local.date}:${local.time}`,
        kind: local.time === "21:30" ? "summary" : "reminder",
        text:
          local.time === "21:30"
            ? `Итоги дня: ${(p?.state.sessions || []).filter((x: any) => x.date === local.date).reduce((total: number, x: any) => total + Math.round(x.seconds / 60), 0)} минут практики. Завтра можно продолжить в удобном темпе.`
            : local.time === "09:00"
              ? `План дня: миссия ${p?.state.current || "1-18"}. Выбери посильный шаг.`
              : local.time === "13:00"
                ? `Текущая миссия: ${p?.state.current || "1-18"}. Небольшое напоминание о цели.`
                : `Время для практики. Миссия ${p?.state.current || "1-18"} ждёт, когда будет удобно.`,
      });
    if (local.time === times[0]) {
      if (local.weekday === "Sun" && n.categories.weekly)
        candidates.push({
          category: "weekly",
          key: local.date,
          text: `Итоги недели: ${p?.state.sessions?.filter((x: any) => Date.parse(x.date) > +now - 7 * 86400000).length || 0} занятий. Время не является оценкой знаний.`,
        });
      const sessions = p?.state.sessions || [];
      const last = sessions
        .map((x: any) => x.date)
        .sort()
        .at(-1);
      const gap = last
        ? Math.floor((Date.parse(local.date) - Date.parse(last)) / 86400000)
        : 0;
      if (gap >= 7 && n.categories.return)
        candidates.push({
          category: "return",
          key: local.date.slice(0, 7),
          text: "Можно вернуться с десяти минут практики. Пропуски не создают долг.",
        });
      if (gap >= 3 && n.categories.review)
        candidates.push({
          category: "review",
          key: local.date,
          text: "Повтори один ранее решённый материал и объясни решение без подсказок.",
        });
      const chapter = (p?.state.current || "1-18").split("-")[0];
      const verified = Object.entries(p?.state.progress || {}).filter(
        ([id, v]: [string, any]) =>
          id.startsWith(chapter + "-") && v.status === "verified",
      ).length;
      if (verified >= 19 && verified < 20 && n.categories.boss)
        candidates.push({
          category: "boss",
          key: chapter,
          text: "Доступно финальное испытание главы. Проверь практический результат.",
        });
      if (verified === 20 && n.categories.chapter)
        candidates.push({
          category: "chapter",
          key: chapter,
          text: "Поздравляем: все миссии главы проверены!",
        });
      if (local.date.endsWith("-01") && n.categories.checkpoint)
        candidates.push({
          category: "checkpoint",
          key: local.date,
          text: "Контрольная точка: пересмотри маршрут, результаты и плановые даты.",
        });
    }
    if (!candidates.length) continue;
    if (p?.state.restDate === local.date) continue;
    for (const candidate of candidates.filter(
      (candidate) =>
        !(
          candidate.category === "daily" &&
          candidate.kind !== "summary" &&
          p?.state.sessions?.some((x: any) => x.date === local.date)
        ),
    ))
      await client
        .from("notification_jobs")
        .upsert(
          {
            user_id: n.user_id,
            category: candidate.category,
            dedupe_key: `${n.user_id}:${candidate.category}:${candidate.key}`,
            due_at: now.toISOString(),
            expires_at: new Date(+now + 5 * 60000).toISOString(),
            payload: {
              chat_id: c.chat_id,
              kind: candidate.kind,
              text: `DEVOPS QUEST: ${candidate.text}`,
            },
          },
          { onConflict: "dedupe_key", ignoreDuplicates: true },
        );
  }
  const { data: jobs } = await client
    .from("notification_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("due_at", now.toISOString())
    .lte("next_attempt_at", now.toISOString())
    .gt("expires_at", now.toISOString())
    .limit(50);
  for (const job of jobs || []) {
    const { data: claim } = await client.rpc("claim_notification", {
      job: job.id,
    });
    if (!claim) continue;
    const [
      { data: connection },
      { data: pref },
      { data: schedule },
      { data: profile },
    ] = await Promise.all([
      client
        .from("telegram_connections")
        .select("*")
        .eq("user_id", job.user_id)
        .single(),
      client
        .from("notification_settings")
        .select("*")
        .eq("user_id", job.user_id)
        .single(),
      client
        .from("schedule_settings")
        .select("*")
        .eq("user_id", job.user_id)
        .single(),
      client.from("profiles").select("state").eq("id", job.user_id).single(),
    ]);
    const wall = schedule?.timezone ? localParts(now, schedule.timezone) : null;
    if (
      !connection ||
      connection.blocked ||
      !pref?.enabled ||
      !pref?.categories?.[job.category] ||
      schedule?.paused ||
      !wall ||
      quiet(
        wall.time,
        pref.quiet_start.slice(0, 5),
        pref.quiet_end.slice(0, 5),
      ) ||
      profile?.state.restDate === wall.date ||
      (job.payload.kind !== "summary" &&
        ["daily", "review", "checkpoint"].includes(job.category) &&
        profile?.state.sessions?.some((x: any) => x.date === wall.date))
    ) {
      await client
        .from("notification_jobs")
        .update({ status: "cancelled" })
        .eq("id", job.id);
      continue;
    }
    try {
      const result = await telegram("sendMessage", {
        chat_id: connection.chat_id,
        text: job.payload.text,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Начать", callback_data: "begin" },
              { text: "Выполнено", callback_data: "done" },
            ],
            [
              { text: "Отложить на 30 мин", callback_data: "snooze" },
              { text: "Сегодня отдыхаю", callback_data: "rest" },
            ],
          ],
        },
      });
      if (result.ok) {
        await client
          .from("notification_jobs")
          .update({ status: "sent" })
          .eq("id", job.id);
        await client
          .from("notification_delivery_log")
          .insert({ user_id: job.user_id, job_id: job.id, result: "sent" });
      } else if (result.error_code === 403) {
        await client
          .from("telegram_connections")
          .update({ blocked: true })
          .eq("user_id", job.user_id);
        await client
          .from("notification_jobs")
          .update({ status: "cancelled" })
          .eq("id", job.id);
      } else {
        await client
          .from("notification_jobs")
          .update({
            status: job.attempts >= 2 ? "failed" : "pending",
            next_attempt_at: new Date(
              Date.now() +
                Math.max(30, result.parameters?.retry_after || 0) * 1000,
            ).toISOString(),
          })
          .eq("id", job.id);
      }
    } catch {
      await client
        .from("notification_jobs")
        .update({ status: "failed" })
        .eq(
          "id",
          job.id,
        ); /* Unknown delivery result: do not retry blindly and duplicate a message. */
    }
  }
  await client
    .from("notification_jobs")
    .update({ status: "cancelled" })
    .eq("status", "pending")
    .lt("expires_at", now.toISOString());
  await client
    .from("notification_jobs")
    .update({ status: "failed" })
    .eq("status", "sending")
    .lt("expires_at", now.toISOString());
  await client
    .from("telegram_link_tokens")
    .delete()
    .lt("expires_at", now.toISOString());
  return json({ ok: true });
};
if (import.meta.main) Deno.serve(handler);
