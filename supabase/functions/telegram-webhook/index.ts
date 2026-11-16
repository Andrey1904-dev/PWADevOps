import { chapters } from "../../../src/catalog.ts";
import {
  db,
  equal,
  hash,
  json,
  runtimeSecret,
  telegram,
} from "../_shared/platform.ts";
import {
  mainMenu,
  navigation,
  web,
  welcomeKeyboard,
} from "../_shared/bot-ui.ts";
import {
  callbackToken,
  linkCallback,
  linkDiagnostic,
  linkMessages,
} from "../_shared/link-flow.ts";
export const handler = async (req: Request): Promise<Response> => {
  const secret = await runtimeSecret("TELEGRAM_WEBHOOK_SECRET");
  if (
    !secret ||
    !equal(req.headers.get("X-Telegram-Bot-Api-Secret-Token") || "", secret)
  ) {
    return json({}, 401);
  }
  if (req.method !== "POST") return json({}, 405);
  try {
    const raw = await req.text();
    if (raw.length > 16000) return json({}, 413);
    const u = JSON.parse(raw);
    if (!Number.isSafeInteger(u.update_id)) return json({}, 400);
    const message = u.message || u.callback_query?.message;
    const chat = message?.chat;
    if (!chat || chat.type !== "private") return json({ ok: true });
    const sender = u.message?.from || u.callback_query?.from;
    if (
      !Number.isSafeInteger(chat.id) || chat.id <= 0 || sender?.id !== chat.id
    ) return json({}, 403);
    const callback = u.callback_query;
    let text = String(callback?.data || u.message?.text || "menu").slice(
      0,
      4096,
    );
    let action = "",
      argument = "",
      target = "";
    let stale = false;
    if (callback) {
      await telegram("answerCallbackQuery", { callback_query_id: callback.id });
      stale = (!text.startsWith("v2:") && !text.startsWith("v3:")) ||
        Date.now() / 1000 - (message.date || Date.now() / 1000) > 7 * 86400;
      const parts = text.split(":");
      action = stale ? "menu" : parts[1];
      target = parts[2] || "";
    } else {
      const aliases: Record<string, string> = {
        "🎯 Моя миссия": "mission",
        "🏠 Главное меню": "menu",
      };
      text = aliases[text] || text;
      const [command, ...args] = text.replace(/^\//, "").split(" ");
      action = (
        {
          missions: "mission",
          help: "menu",
          today: "mission",
          progress: "stats",
          week: "stats",
        } as Record<string, string>
      )[command] || command.split("@")[0];
      argument = args.join(" ");
      if (action === "start" && argument === "app") argument = "";
    }
    const client = db();
    let reply = "";
    let markup: unknown = mainMenu;
    const confirmation = callback ? callbackToken(text) : null;
    if (
      (action === "start" && argument) || confirmation ||
      (callback && text.startsWith("v3:"))
    ) {
      const rawToken = confirmation?.token || argument;
      const step = confirmation?.action || "prepare";
      if (
        !/^[a-f0-9]{64}$/.test(rawToken) ||
        (callback && (!confirmation || stale))
      ) {
        reply = linkMessages.LINK_INVALID_OR_EXPIRED;
        linkDiagnostic(
          step,
          "LINK_INVALID_OR_EXPIRED",
          "malformed or stale link capability",
        );
      } else {
        const { data, error } = await client.rpc("telegram_link_step", {
          hash: await hash(rawToken),
          telegram_chat: chat.id,
          step,
        });
        if (error) {
          linkDiagnostic(
            step,
            "DATABASE_UNAVAILABLE",
            error.code || "RPC transport failure",
          );
          return json({ error: "DATABASE_UNAVAILABLE" }, 503);
        }
        const code = data?.code || "UNKNOWN_RESULT";
        linkDiagnostic(step, code, "service-only transactional link handshake");
        reply = linkMessages[code] ||
          "Не удалось подтвердить Telegram. Повтори позже.";
        if (code === "CONFIRM_REQUIRED") {
          markup = {
            inline_keyboard: [[{
              text: "✅ Подтвердить привязку",
              callback_data: linkCallback(rawToken, "confirm"),
            }], [{
              text: "Отменить",
              callback_data: linkCallback(rawToken, "cancel"),
            }]],
          };
        } else {markup = {
            inline_keyboard: [[web("🚀 Открыть DevOps Quest")], ...navigation],
          };}
      }
    } else {
      const writes: Record<string, [string, string]> = {
        confirm_solved: ["status", "solved"],
        begin: ["begin", ""],
        stop: ["stop", ""],
        done: ["done", ""],
        snooze: ["snooze", ""],
        rest: ["rest", ""],
        pause: ["pause", ""],
        resume: ["resume", ""],
      };
      const mutation = writes[action];
      const { data: s, error } = mutation
        ? await client.rpc("bot_action_guarded", {
          chat: chat.id,
          update_number: u.update_id,
          action: mutation[0],
          argument: mutation[1],
          target_mission: target || null,
        })
        : await client.rpc("bot_action", {
          chat: chat.id,
          update_number: u.update_id,
          action: "menu",
          argument: "",
        });
      if (error) return json({ error: "DATABASE_UNAVAILABLE" }, 503);
      if (s.duplicate) return json({ ok: true });
      if (s.unlinked) {
        reply =
          "🚀 DEVOPS QUEST\n\nТвой путь от Python до DevOps-инженера.\n\nНажми «Начать», войди в свой аккаунт и свяжи Telegram в приложении. Миссии 1–17 не отмечаются автоматически.";
        markup = u.message && action === "start" ? welcomeKeyboard : mainMenu;
      } else if (s.stale_action) {
        reply =
          "Миссия уже изменилась. Открой актуальную миссию и повтори действие.";
      } else {
        const missionBase = chapters
          .flatMap((c) => c.missions)
          .find((m) => m.id === s.current);
        const mission = { ...missionBase, ...s.overrides?.[s.current] };
        const chapter = chapters.find((c) =>
          c.missions.some((m) => m.id === s.current)
        );
        const boss = s.overrides?.["chapter-" + chapter?.id]?.boss ||
          chapter?.boss;
        const complete = Object.values(s.progress || {}).filter(
          (p: any) => p.status === "verified",
        ).length;
        switch (action) {
          case "mission":
            reply = `🎯 ${chapter?.title || "Текущая глава"}\nМиссия №${
              mission.number || 18
            }: ${mission.title || ""}\n\n${mission.task || ""}`;
            markup = {
              inline_keyboard: [
                [
                  { text: "▶️ Продолжить", callback_data: "v2:begin" },
                  web("Открыть миссию"),
                ],
                [
                  {
                    text: "✅ Миссия решена",
                    callback_data: "v2:ask_solved:" + s.current,
                  },
                ],
                [{ text: "⏹ Завершить занятие", callback_data: "v2:done" }],
                ...navigation,
              ],
            };
            break;
          case "ask_solved":
            reply =
              "Подтвердить решение этой миссии?\nЭто отметка выполнения. Проверка знаний остаётся отдельным статусом в приложении.";
            markup = {
              inline_keyboard: [
                [
                  {
                    text: "✅ Подтвердить",
                    callback_data: "v2:confirm_solved:" + s.current,
                  },
                  { text: "Отменить", callback_data: "v2:mission" },
                ],
                ...navigation,
              ],
            };
            break;
          case "confirm_solved":
            reply =
              "✅ Решение отмечено. XP начисляется один раз. Проверку знаний добавь в приложении.";
            break;
          case "boss":
            reply = `🏆 Финальное испытание\n\n${
              boss || "Открой карту развития в приложении."
            }`;
            markup = {
              inline_keyboard: [
                [web("Открыть путь DevOps", "plan")],
                ...navigation,
              ],
            };
            break;
          case "begin":
            reply = s.active
              ? "▶️ Занятие идёт. Один шаг за раз."
              : "Обучение на паузе. Возобнови его в настройках.";
            markup = {
              inline_keyboard: [
                [
                  { text: "⏸ Остановить таймер", callback_data: "v2:stop" },
                  { text: "⏹ Завершить", callback_data: "v2:done" },
                ],
                [web("📱 Продолжить в приложении")],
                ...navigation,
              ],
            };
            break;
          case "stop":
            reply =
              "⏸ Таймер остановлен. Время сохранится при завершении занятия.";
            markup = {
              inline_keyboard: [
                [
                  { text: "▶️ Продолжить", callback_data: "v2:begin" },
                  { text: "✅ Завершить", callback_data: "v2:done" },
                ],
                ...navigation,
              ],
            };
            break;
          case "done":
            reply =
              "✅ Если таймер был запущен, занятие сохранено. Статус миссии и проверка знаний отмечаются отдельно.";
            break;
          case "snooze":
            reply =
              "⏰ Напомним через 30 минут, если уведомления включены и это не тихие часы.";
            break;
          case "rest":
            reply =
              "🌿 Сегодня отдыхаем. Никаких долгов. Завтра можно продолжить.";
            break;
          case "stats":
            reply =
              `📊 Проверено ${complete}/360 миссий. Подробная статистика — в приложении.`;
            markup = {
              inline_keyboard: [
                [web("Открыть статистику", "stats")],
                ...navigation,
              ],
            };
            break;
          default:
            reply = stale
              ? "Меню обновилось. Выбери действие ниже."
              : "🚀 DEVOPS QUEST\n\nМаленькие шаги. Настоящие навыки.\nВыбери миссию или открой приложение.";
            if (action === "start" && u.message) markup = welcomeKeyboard;
        }
      }
    }
    // Remove the legacy reply keyboard, otherwise existing Telegram clients keep the
    // old launch button which opens without initData. Delete the transient cleanup notice.
    let legacyNotice: number | undefined;
    if (u.message && action === "start") {
      const cleanup = await telegram("sendMessage", {
        chat_id: chat.id,
        text: "Обновляем меню DevOps Quest…",
        reply_markup: { remove_keyboard: true },
      });
      legacyNotice = cleanup.result?.message_id;
    }
    let result;
    if (callback) {
      result = await telegram("editMessageText", {
        chat_id: chat.id,
        message_id: message.message_id,
        text: reply,
        reply_markup: markup,
      });
      if (
        !result.ok &&
        result.error_code === 400 &&
        String(result.description).includes("message is not modified")
      ) {
        return json({ ok: true });
      }
      if (!result.ok && result.error_code === 400) {
        result = await telegram("sendMessage", {
          chat_id: chat.id,
          text: reply,
          reply_markup: markup,
        });
      }
    } else {
      result = await telegram("sendMessage", {
        chat_id: chat.id,
        text: reply,
        reply_markup: markup,
      });
    }
    if (legacyNotice) {
      try {
        await telegram("deleteMessage", {
          chat_id: chat.id,
          message_id: legacyNotice,
        });
      } catch { /* Cleanup must not retry a completed link. */ }
    }
    if (!result.ok) {
      linkDiagnostic(
        "reply",
        "TELEGRAM_REJECTED",
        `Telegram API error ${Number(result.error_code) || 0}`,
      );
    }
    if (!result.ok && result.error_code === 403) {
      await client
        .from("telegram_connections")
        .update({ blocked: true })
        .eq("chat_id", chat.id);
    }
    if (!result.ok && (result.error_code === 429 || result.error_code >= 500)) {
      linkDiagnostic(
        "reply",
        "TELEGRAM_RETRY",
        "Telegram delivery temporarily unavailable",
      );
      return json({ error: "TELEGRAM_UNAVAILABLE" }, 503);
    }
    return json({ ok: true });
  } catch {
    linkDiagnostic(
      "webhook",
      "TEMPORARY_FAILURE",
      "unexpected handler or transport failure",
    );
    return json({ error: "TEMPORARY_FAILURE" }, 503);
  }
};
if (import.meta.main) Deno.serve(handler);
