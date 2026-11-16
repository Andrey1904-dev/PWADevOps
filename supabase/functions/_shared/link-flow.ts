export function linkDiagnostic(stage: string, code: string, reason: string) {
  console.info(
    JSON.stringify({ component: "telegram_link", stage, code, reason }),
  );
}
// Telegram callback_data is limited to 64 bytes; compress the 64-char hex capability.
export function linkCallback(token: string, action: "confirm" | "cancel") {
  if (!/^[a-f0-9]{64}$/.test(token)) throw Error("INVALID_LINK_TOKEN");
  const bytes = token.match(/../g)!.map((x) => parseInt(x, 16));
  const short = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-")
    .replaceAll("/", "_").replace(/=+$/, "");
  return `v3:${action}:${short}`;
}
export function callbackToken(value: string) {
  const m = /^v3:(confirm|cancel):([A-Za-z0-9_-]{43})$/.exec(value);
  if (!m) return null;
  try {
    const bytes = atob(m[2].replaceAll("-", "+").replaceAll("_", "/") + "=");
    if (bytes.length !== 32) return null;
    const token = [...bytes].map((c) =>
      c.charCodeAt(0).toString(16).padStart(2, "0")
    ).join("");
    if (linkCallback(token, m[1] as "confirm" | "cancel") !== value) {
      return null;
    }
    return { token, action: m[1] };
  } catch {
    return null;
  }
}
export const linkMessages: Record<string, string> = {
  LINKED:
    "✅ Привязка успешно завершена. Telegram подключён к существующему аккаунту. Прогресс сохранён. Уведомления включаются отдельно.",
  ALREADY_LINKED:
    "✅ Telegram уже подключён к этому аккаунту. Можно открыть DevOps Quest.",
  CONFIRM_REQUIRED:
    "Связать этот Telegram с аккаунтом, в котором ты нажал «Привязать Telegram»?\n\nПодтверждай только свой запрос. Вход в Safari сохраняется, новый аккаунт не создаётся.",
  CANCELLED:
    "Привязка отменена. Аккаунт и прогресс не изменены. Новую ссылку можно получить в настройках PWA.",
  LINK_INVALID_OR_EXPIRED:
    "Срок подтверждения истёк или ссылка неверна. Вернись в PWA → Настройки → Привязать Telegram и создай новую ссылку.",
  LINK_USED:
    "Это подтверждение уже использовано или отменено. Получи новую ссылку в PWA.",
  LINK_CLAIMED:
    "Эта ссылка уже открыта другим Telegram-аккаунтом. Отмени запрос в PWA и создай новую ссылку.",
  ACCOUNT_ALREADY_LINKED:
    "Telegram уже связан с другим аккаунтом, либо в этом аккаунте подключён другой Telegram. Войди в нужный аккаунт и сначала отзови прежнюю привязку.",
};
