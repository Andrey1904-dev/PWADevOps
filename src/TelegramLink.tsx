import { useEffect, useState } from "react";
import { supabase } from "./store";
import { bounded } from "./auth/validation";
type Link = { token: string; url: string; expires_at: string };
const errors: Record<string, string> = {
  LINK_RATE_LIMITED:
    "Ссылка недавно создана. Подождите одну минуту и повторите. Если ссылка ещё показана ниже, откройте её.",
  Unauthorized: "Сессия завершена. Войдите в аккаунт заново.",
  DATABASE_UNAVAILABLE:
    "Сервер временно недоступен. Не удалось подтвердить Telegram. Повторите позже.",
  TEMPORARY_FAILURE: "Не удалось подтвердить Telegram. Повторите позже.",
  SESSION_REVOKED: "Сессия завершена. Войдите в аккаунт заново.",
  PROFILE_UNAVAILABLE: "Не удалось подготовить аккаунт. Повторите позже.",
  ACCOUNT_ALREADY_LINKED: "Telegram уже связан с другим аккаунтом.",
  INVALID_REQUEST: "Не удалось создать подтверждение. Повторите запрос.",
};
async function request(body: Record<string, string>) {
  if (!supabase) throw Error("Supabase недоступен.");
  let response;
  try {
    response = await bounded(
      supabase.functions.invoke("link-telegram", { body }),
    );
  } catch {
    throw Error("Сетевая ошибка. Сервер не ответил вовремя. Повторите позже.");
  }
  const { data, error } = response;
  if (error) {
    let code = "";
    try {
      code = (await error.context.json()).error;
    } catch {
      /* transport error */
    }
    throw Error(
      errors[code] ||
        "Сетевая ошибка. Не удалось подтвердить Telegram. Повторите позже.",
    );
  }
  return data;
}
export function TelegramLink({
  linked,
  userId,
}: {
  linked: boolean;
  userId: string;
}) {
  const storageKey = `devops-quest-telegram-link:${userId}`;
  const [link, setLink] = useState<Link | null>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      return saved &&
        /^[a-f0-9]{64}$/.test(saved.token) &&
        saved.url === `https://t.me/PwaDevOps_Bot?start=${saved.token}` &&
        Date.parse(saved.expires_at) > Date.now()
        ? saved
        : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      if (link) sessionStorage.setItem(storageKey, JSON.stringify(link));
      else sessionStorage.removeItem(storageKey);
    } catch {
      /* Private browsing can disallow sessionStorage; the current link remains usable. */
    }
  }, [link, storageKey]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (linked) {
      setLink(null);
      setError("");
      setExpired(false);
    }
  }, [linked]);
  useEffect(() => {
    if (!link) return;
    const check = () => setExpired(Date.parse(link.expires_at) <= Date.now());
    check();
    const timer = setInterval(check, 1000);
    return () => clearInterval(timer);
  }, [link]);
  async function create() {
    setBusy(true);
    setError("");
    try {
      const data = await request({ action: "create" });
      if (
        !data ||
        !/^[a-f0-9]{64}$/.test(data.token) ||
        data.url !== `https://t.me/PwaDevOps_Bot?start=${data.token}` ||
        !Number.isFinite(Date.parse(data.expires_at))
      )
        throw Error("Не удалось получить безопасную ссылку. Повторите позже.");
      setLink(data);
      setExpired(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!link) return;
    setBusy(true);
    setError("");
    try {
      const result = await request({ action: "cancel", token: link.token });
      if (!result?.cancelled)
        throw Error("Не удалось отменить запрос. Повторите позже.");
      setLink(null);
      setExpired(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="telegram-link" aria-label="Привязка Telegram">
      <p role="status">
        {linked ? "✅ Telegram подключён" : "Telegram пока не подключён"}
      </p>
      {!linked && (
        <>
          <p className="muted">
            Создайте ссылку, откройте бота и нажмите «Подтвердить привязку».
            Возвращаться в Safari для ввода кода не нужно. Этот аккаунт и
            прогресс сохранятся.
          </p>
          {!link && (
            <button className="primary" onClick={create} disabled={busy}>
              {busy ? "Создаём подтверждение…" : "Привязать Telegram"}
            </button>
          )}
          {link && (
            <div className="telegram-link-steps">
              {expired ? (
                <>
                  <p role="alert">
                    Срок подтверждения истёк. Создайте новую ссылку.
                  </p>
                  <button onClick={create} disabled={busy}>
                    Создать новую ссылку
                  </button>
                </>
              ) : (
                <>
                  <p>
                    1. Откройте бота по кнопке ниже.
                    <br />
                    2. Если Telegram показывает «Начать», нажмите её.
                    <br />
                    3. Нажмите «Подтвердить привязку» в сообщении бота.
                  </p>
                  <a
                    className="telegram-open"
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      setError("");
                      try {
                        if (!navigator.onLine)
                          setError(
                            "Сетевая ошибка. Проверьте интернет перед открытием Telegram.",
                          );
                      } catch {
                        setError(
                          "Не удалось открыть Telegram. Используйте ссылку ниже.",
                        );
                      }
                    }}
                  >
                    Открыть Telegram-бота ↗
                  </a>
                  <p className="muted">
                    Ссылка действует 10 минут. Если приложение Telegram не
                    открылось,{" "}
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      откройте эту же ссылку в браузере
                    </a>
                    , затем выберите Open in Telegram. Не пересылайте ссылку
                    другим людям.
                  </p>
                  <p className="muted">
                    После подтверждения вернитесь сюда: статус обновится
                    автоматически. Повторный запрос не нужен.
                  </p>
                </>
              )}
              <button
                onClick={() =>
                  setError(
                    "Не удалось открыть Telegram. Откройте ссылку выше в браузере и выберите Open in Telegram. Затем нажмите «Начать» и подтвердите привязку.",
                  )
                }
              >
                Telegram не открылся
              </button>
              <button onClick={cancel} disabled={busy}>
                Отменить привязку
              </button>
            </div>
          )}
          {error && <p role="alert">{error}</p>}
        </>
      )}
    </section>
  );
}
