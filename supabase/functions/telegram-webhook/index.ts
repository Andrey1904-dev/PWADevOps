import { dayType, localParts } from "../../../src/domain.ts";
import { chapters } from "../../../src/catalog.ts";
import {
  db,
  json,
  hash,
  equal,
  telegram,
  menu,
  runtimeSecret,
} from "../_shared/platform.ts";
export const handler = async (req: Request): Promise<Response> => {
  const secret = await runtimeSecret("TELEGRAM_WEBHOOK_SECRET");
  if (
    !secret ||
    !equal(req.headers.get("X-Telegram-Bot-Api-Secret-Token") || "", secret)
  )
    return json({ error: "Unauthorized" }, 401);
  if (req.method !== "POST") return json({}, 405);
  try {
    const raw = await req.text();
    if (raw.length > 16000) return json({}, 413);
    const u = JSON.parse(raw);
    if (!Number.isSafeInteger(u.update_id)) return json({}, 400);
    const msg = u.message || u.callback_query?.message;
    const chat = msg?.chat;
    if (!chat || chat.type !== "private") return json({ ok: true });
    const sender = u.message?.from || u.callback_query?.from;
    if (sender?.id !== chat.id) return json({}, 403);
    const text = (u.callback_query?.data || u.message?.text || "help").slice(
      0,
      4096,
    );
    const [cmd, ...args] = text.replace(/^\//, "").split(" ");
    const rawAction = cmd.split("@")[0];
    const action =
        ({ missions: "mission" } as Record<string, string>)[rawAction] ||
        rawAction,
      arg = args.join(" ");
    const client = db();
    let reply = "";
    const validDate = (value: string) => {
      const stamp = Date.parse(value + "T00:00:00Z");
      return (
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Number.isFinite(stamp) &&
        new Date(stamp).toISOString().slice(0, 10) === value
      );
    };
    if (action === "schedule" && arg && !validDate(arg)) {
      reply =
        "Некорректная дата. Используйте /schedule YYYY-MM-DD, например /schedule 2026-11-15.";
    } else if (
      action === "status" &&
      !["not_started", "in_progress", "solved", "verified"].includes(arg)
    ) {
      reply =
        "Статус: /status not_started | in_progress | solved | verified. Проверка знаний отмечается отдельно.";
    } else if (action === "start" && arg) {
      const { data, error } = await client.rpc("consume_link", {
        hash: await hash(arg),
        telegram_chat: chat.id,
        update_number: u.update_id,
      });
      if (error) return json({}, 503);
      reply = data
        ? "Аккаунт привязан. Уведомления выключены. /reminders on — согласие на включение."
        : "Код истёк, уже использован или команда повторена.";
    } else {
      const { data: s, error } = await client.rpc("bot_action", {
        chat: chat.id,
        update_number: u.update_id,
        action,
        argument: arg,
      });
      if (error) return json({ error: "Temporary database failure" }, 503);
      if (s.duplicate) return json({ ok: true });
      if (s.unlinked)
        reply =
          "Откройте Настройки PWA, войдите и получите код. Затем /start КОД.";
      else {
        const count = Object.values(s.progress || {}).filter(
          (p: any) => p.status === "verified",
        ).length;
        const mins =
          (s.sessions || []).reduce((n: number, x: any) => n + x.seconds, 0) /
          60;
        const baseMission = chapters
          .flatMap((c) => c.missions)
          .find((m) => m.id === s.current);
        const current = { ...baseMission, ...s.overrides?.[s.current] };
        const baseChapter = chapters.find((c) =>
          c.missions.some((m) => m.id === s.current),
        );
        const chapter = {
          ...baseChapter,
          ...s.overrides?.["chapter-" + baseChapter?.id],
        };
        let dailyPlan = "Задайте дату первой смены и часовой пояс в PWA.";
        let calendar = "";
        if (s.settings?.timezone && s.settings?.anchor) {
          try {
            const local = localParts(new Date(), s.settings.timezone);
            dailyPlan =
              s.restDate === local.date
                ? "Сегодня отдых."
                : `Ориентир: ${s.plans?.[local.date] ?? (s.heavyDate === local.date ? s.settings.heavy : dayType(local.date, s.settings.anchor) === "work" ? s.settings.work : s.settings.rest)} минут.`;
            calendar = Array.from({ length: 7 }, (_, i) => {
              const d = new Date(local.date + "T12:00:00Z");
              d.setUTCDate(d.getUTCDate() + i);
              const date = d.toISOString().slice(0, 10);
              return `${date}: ${dayType(date, s.settings.anchor) === "work" ? "рабочий" : "выходной"}`;
            }).join("\n");
          } catch {
            dailyPlan = "Проверьте IANA timezone в PWA.";
          }
        }
        const answers: Record<string, string> = {
          start: "Добро пожаловать в DEVOPS QUEST!",
          today: `Миссия: ${s.current}. ${s.settings?.paused ? "Обучение на паузе." : dailyPlan}`,
          mission: `Текущая миссия: ${s.current} — ${current?.title || ""}\n${current?.task || ""}\nСтатус: ${s.progress?.[s.current]?.status || "not_started"}\n/status in_progress | solved | verified\n/note текст`,
          plan: chapters
            .map((base) => {
              const c = { ...base, ...s.overrides?.["chapter-" + base.id] };
              return `${c.month} · ${c.title}`;
            })
            .join("\n"),
          progress: `Проверено ${count}/360 миссий. Время само по себе не подтверждает знания.`,
          week: `За последние 7 дней: ${Math.round((s.sessions || []).filter((x: any) => Date.parse(x.date) > Date.now() - 7 * 86400000).reduce((n: number, x: any) => n + x.seconds, 0) / 60)} минут практики.`,
          stats: `Практика: ${Math.round(mins)} минут. Проверено: ${count}.`,
          schedule: `Первая смена: ${s.settings?.anchor || "не задана"}. Задать: /schedule YYYY-MM-DD. Часовой пояс задаётся в PWA.\n${calendar}`,
          settings:
            "/pause · /resume · /reminders on · /reminders off · /schedule YYYY-MM-DD",
          reminders: `Уведомления: ${s.settings?.reminders ? "включены" : "выключены"}. Управление: /reminders on — согласие; /reminders off — отключить. Для включения задайте дату смены и часовой пояс в PWA.`,
          stop: "Таймер остановлен. /begin — продолжить, /done — сохранить занятие.",
          begin: s.active
            ? "Занятие идёт. /done — завершить."
            : "Занятие не начато: проверьте паузу.",
          done: "Занятие завершено, если был запущен таймер. Знания отмечаются отдельно: /status solved",
          note: "Заметка сохранена.",
          status: "Статус обновлён, если значение допустимо.",
          snooze: "Напоминание отложено на 30 минут.",
          rest: "Сегодня отдыхаем. Завтра вернёмся к обычному ритму.",
          pause: "Обучение на паузе.",
          resume: "Обучение возобновлено.",
          boss: chapter?.boss || "Откройте план",
          achievements: `${s.sessions?.length ? "✓" : "○"} Первая практика · ${count ? "✓" : "○"} Первое подтверждение`,
          help: "/boss /achievements /today /plan /progress /mission /done /stats /schedule /reminders /settings /begin /note /status /pause /resume /help",
        };
        reply = answers[action] || answers.help;
      }
    }
    if (u.callback_query)
      await telegram("answerCallbackQuery", {
        callback_query_id: u.callback_query.id,
      });
    const result = await telegram("sendMessage", {
      chat_id: chat.id,
      text: reply,
      reply_markup:
        action === "mission"
          ? {
              inline_keyboard: [
                [
                  { text: "В процессе", callback_data: "status in_progress" },
                  { text: "Решено", callback_data: "status solved" },
                ],
                [
                  {
                    text: "Знания проверены",
                    callback_data: "status verified",
                  },
                ],
                ...menu.inline_keyboard,
              ],
            }
          : action === "settings" || action === "reminders"
            ? {
                inline_keyboard: [
                  [
                    {
                      text: "Включить уведомления (согласен)",
                      callback_data: "reminders on",
                    },
                  ],
                  [
                    {
                      text: "Выключить уведомления",
                      callback_data: "reminders off",
                    },
                  ],
                  [
                    { text: "Пауза", callback_data: "pause" },
                    { text: "Возобновить", callback_data: "resume" },
                  ],
                  ...menu.inline_keyboard,
                ],
              }
            : menu,
    });
    if (!result.ok && result.error_code === 403)
      await client
        .from("telegram_connections")
        .update({ blocked: true })
        .eq("chat_id", chat.id);
    return json({ ok: true });
  } catch {
    return json({ error: "Temporary failure" }, 503);
  }
};
if (import.meta.main) Deno.serve(handler);
