import { supabase } from "./store";
type TelegramApp = {
  initData: string;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string>;
  ready: () => void;
  expand: () => void;
  setHeaderColor: (s: string) => void;
  setBackgroundColor: (s: string) => void;
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (f: () => void) => void;
    offClick: (f: () => void) => void;
  };
  onEvent: (name: string, f: () => void) => void;
  offEvent: (name: string, f: () => void) => void;
};
declare global {
  interface Window {
    Telegram?: { WebApp: TelegramApp };
  }
}
export const telegramApp = () =>
  window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : undefined;
export async function telegramSession(
  action: "exchange" | "link" = "exchange",
) {
  const app = telegramApp();
  if (!app || !supabase) return "outside";
  const { data, error } = await supabase.functions.invoke("telegram-auth", {
    body: { initData: app.initData, action },
  });
  if (error) {
    let code = "TEMPORARY_FAILURE";
    try {
      code = (await error.context.json()).error;
    } catch {
      /* Offline / transport failure. */
    }
    if (code === "LINK_REQUIRED") {
      await checkMiniSession();
      return "link_required";
    }
    throw Error(
      (
        {
          REOPEN_MINI_APP: "Откройте приложение заново из меню бота.",
          ACCOUNT_ALREADY_LINKED:
            "Этот Telegram уже связан с другим аккаунтом.",
          INVALID_OR_EXPIRED_INIT_DATA:
            "Данные Telegram устарели. Откройте приложение заново.",
          LOGIN_REQUIRED: "Сначала войдите в существующий аккаунт.",
        } as Record<string, string>
      )[code] || "Не удалось подключиться к Telegram. Повторите позже.",
    );
  }
  if (data.session) {
    const { error: sessionError } = await supabase.auth.setSession(
      data.session,
    );
    if (sessionError)
      throw Error("Не удалось открыть сессию. Перезапустите Mini App.");
  }
  return action === "link" ? "linked" : "authenticated";
}

export async function checkMiniSession() {
  if (!telegramApp() || !supabase) return true;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return true;
  const { data, error } = await supabase.rpc("mini_session_status");
  if (error) return true;
  if (data?.allowed === false) {
    await supabase.auth.signOut({ scope: "local" });
    return false;
  }
  return true;
}
