import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { Terminal, LoaderCircle } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { supabase, initialRecovery, initialAuthError } from "../store";
import { telegramApp, telegramSession } from "../telegram";
import { AuthPage } from "./AuthPage";
import { authError, bounded } from "./validation";
export function AuthGate({
  children,
}: {
  children: (user: User, logout: () => void) => ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [notice, setNotice] = useState("");
  const [recovery, setRecovery] = useState(initialRecovery);
  const [linkRequired, setLinkRequired] = useState(false);
  const [candidate, setCandidate] = useState<User | null>(null);
  const [retry, setRetry] = useState(0);
  const epoch = useRef(0);
  const currentSession = useRef<Session | null>(null);
  const sessionId = (session: Session) => {
    try {
      return JSON.parse(
        atob(
          session.access_token
            .split(".")[1]
            .replaceAll("-", "+")
            .replaceAll("_", "/"),
        ),
      ).session_id as string;
    } catch {
      return "";
    }
  };
  const logout = () => {
    const session = currentSession.current;
    if (session) {
      try {
        const id = sessionId(session);
        if (id) {
          const old = JSON.parse(
            localStorage.getItem("devops-quest-signed-out") || "[]",
          ) as string[];
          localStorage.setItem(
            "devops-quest-signed-out",
            JSON.stringify([...old.filter((x) => x !== id), id].slice(-32)),
          );
        }
      } catch {
        /* Storage failure must never prevent closing the private UI. */
      }
    }
    ++epoch.current;
    setUser(null);
    setCandidate(null);
    setChecking(false);
    setRecovery(false);
    recoverRef.current = false;
    void bounded(supabase!.auth.signOut({ scope: "local" }))
      .then(({ error }) => {
        if (error) throw error;
      })
      .catch(() => {
        try {
          localStorage.removeItem("sb-okswmvxxoataxprjwzjv-auth-token");
        } catch {
          /* The gate remains closed even if browser storage is unavailable. */
        }
        setNotice(
          "Вы вышли на этом устройстве. Серверный выход не подтверждён из-за сети.",
        );
      });
  };
  const recoverRef = useRef(initialRecovery);
  const linkRef = useRef(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => {
    const client = supabase;
    if (!client) {
      setChecking(false);
      setNotice("Авторизация недоступна: Supabase не настроен.");
      return;
    }
    let alive = true;
    let initializing = true;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const validate = async (session: Session | null) => {
      const turn = ++epoch.current;
      setUser(null);
      setCandidate(null);
      setChecking(true);
      clearTimeout(expiry);
      try {
        if (!session) {
          recoverRef.current = false;
          setRecovery(false);
          if (initialAuthError)
            setNotice(authError({ code: initialAuthError }));
          if (alive && turn === epoch.current) setChecking(false);
          return;
        }
        const rejected = JSON.parse(
          localStorage.getItem("devops-quest-signed-out") || "[]",
        ) as string[];
        if (rejected.includes(sessionId(session)))
          throw { code: "session_revoked" };
        const verified = await bounded(
          client.auth.getUser(session.access_token),
        );
        if (verified.error) throw verified.error;
        const account = verified.data.user;
        if (!account || account.is_anonymous || !account.email_confirmed_at)
          throw { code: "email_not_confirmed" };
        const { data: status, error } = await bounded(
          client.rpc("mini_session_status"),
        );
        if (error) throw error;
        if (!status?.allowed) throw { code: "session_revoked" };
        if (!alive || turn !== epoch.current) return;
        currentSession.current = session;
        setNotice("");
        if (recoverRef.current) {
          setRecovery(true);
          setChecking(false);
          return;
        }
        if (linkRef.current) {
          setCandidate(account);
          setChecking(false);
          return;
        }
        setUser(account);
        setChecking(false);
        const left = Math.max(
          1000,
          (session.expires_at || 0) * 1000 - Date.now(),
        );
        expiry = setTimeout(
          () => {
            void bounded(client.auth.getSession())
              .then(({ data }) => validate(data.session))
              .catch(() => {
                setUser(null);
                setNotice("Сессия истекла. Войдите снова.");
                setChecking(false);
              });
          },
          Math.min(left, 2147483647),
        );
      } catch (error) {
        if (!alive || turn !== epoch.current) return;
        setUser(null);
        recoverRef.current = false;
        setRecovery(false);
        setChecking(false);
        setNotice(
          (error as { code?: string }).code === "session_revoked"
            ? "Сессия завершена или привязка отозвана. Войдите снова."
            : authError(error as { code?: string; message?: string }),
        );
      }
    };
    const { data: listener } = client.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT") {
          ++epoch.current;
          clearTimeout(expiry);
          setUser(null);
          setCandidate(null);
          setChecking(false);
          recoverRef.current = false;
          setRecovery(false);
          return;
        }
        if (event === "PASSWORD_RECOVERY") {
          recoverRef.current = true;
          setRecovery(true);
        }
        if (!initializing)
          queueMicrotask(() => {
            if (alive) void validate(session);
          });
      },
    );
    void (async () => {
      try {
        const app = telegramApp();
        if (app) {
          app.ready();
          app.expand();
          const result = await bounded(telegramSession());
          linkRef.current = result === "link_required";
          setLinkRequired(linkRef.current);
        }
        const { data, error } = await bounded(client.auth.getSession());
        if (error) throw error;
        initializing = false;
        await validate(data.session);
      } catch (error) {
        initializing = false;
        if (alive) {
          setUser(null);
          setChecking(false);
          setNotice(
            error instanceof Error
              ? error.message
              : authError(error as { code?: string }),
          );
        }
      }
    })();
    const focus = () => {
      if (document.visibilityState === "visible" && !initializing)
        void bounded(client.auth.getSession())
          .then(({ data }) => validate(data.session))
          .catch(() => {
            setUser(null);
            setChecking(false);
            setNotice("Не удалось подтвердить сессию. Проверьте соединение.");
          });
    };
    window.addEventListener("focus", focus);
    return () => {
      alive = false;
      ++epoch.current;
      clearTimeout(expiry);
      listener.subscription.unsubscribe();
      window.removeEventListener("focus", focus);
    };
  }, [retry]);
  if (checking)
    return (
      <div className="auth-loading" role="status">
        <Terminal size={34} />
        <b>DEVOPS QUEST</b>
        <LoaderCircle className="auth-spinner" size={22} />
        <p>Проверяем защищённую сессию…</p>
      </div>
    );
  if (candidate && linkRequired)
    return (
      <div className="auth-loading">
        <Terminal size={34} />
        <h1>Связать Telegram</h1>
        <p>Аккаунт: {candidate.email}</p>
        <p>Прогресс останется в существующем аккаунте.</p>
        {notice && <p role="alert">{notice}</p>}
        <button
          className="auth-primary"
          onClick={async () => {
            setChecking(true);
            try {
              await bounded(telegramSession("link"));
              linkRef.current = false;
              setLinkRequired(false);
              setCandidate(null);
              setRetry((x) => x + 1);
            } catch (error) {
              setChecking(false);
              setNotice(
                error instanceof Error
                  ? error.message
                  : "Не удалось связать аккаунт.",
              );
            }
          }}
        >
          Связать аккаунт и продолжить
        </button>
        <button onClick={logout}>Выйти</button>
      </div>
    );
  if (user && !recovery) return <>{children(user, logout)}</>;
  return (
    <>
      {needRefresh && (
        <div className="auth-update">
          <button onClick={() => updateServiceWorker(true)}>
            Обновить приложение
          </button>
        </div>
      )}
      <AuthPage
        key={recovery ? "recovery" : "auth"}
        recovery={recovery}
        linkRequired={linkRequired}
        notice={notice}
        onPasswordUpdated={() => {
          recoverRef.current = false;
          setRecovery(false);
          setUser(null);
          setNotice("Пароль изменён. Войдите с новым паролем.");
        }}
      />
      {notice && (
        <button className="auth-retry" onClick={() => setRetry((x) => x + 1)}>
          Повторить проверку сессии
        </button>
      )}
    </>
  );
}
