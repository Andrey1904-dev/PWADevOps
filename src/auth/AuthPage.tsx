import { useEffect, useState, type FormEvent } from "react";
import {
  Terminal,
  ArrowUpRight,
  ArrowLeft,
  Mail,
  LockKeyhole,
  UserRound,
  CheckCircle2,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "../store";
import {
  authError,
  bounded,
  redirectUrl,
  validateEmail,
  validateRegistration,
} from "./validation";
import { telegramApp } from "../telegram";
import "./auth.css";
type Mode =
  "welcome" | "login" | "register" | "confirm" | "forgot" | "sent" | "update";
export function AuthPage({
  recovery = false,
  linkRequired = false,
  notice = "",
  onPasswordUpdated,
}: {
  recovery?: boolean;
  linkRequired?: boolean;
  notice?: string;
  onPasswordUpdated: () => void;
}) {
  const [mode, setMode] = useState<Mode>(recovery ? "update" : "welcome");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (recovery) setMode("update");
  }, [recovery]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setInterval(
      () => setCooldown((x) => Math.max(0, x - 1)),
      1000,
    );
    return () => clearInterval(timer);
  }, [cooldown]);
  useEffect(() => {
    document.documentElement.dataset.telegramTheme = "dark";
    const app = telegramApp();
    if (!app) return;
    app.setHeaderColor("#090d20");
    app.setBackgroundColor("#090d20");
    const back = () => setMode("welcome");
    if (mode !== "welcome" && !recovery) app.BackButton.show();
    else app.BackButton.hide();
    app.BackButton.onClick(back);
    return () => app.BackButton.offClick(back);
  }, [mode, recovery]);
  function navigate(next: Mode) {
    setMode(next);
    setError("");
    setInfo("");
    setPassword("");
    setRepeat("");
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      await action();
    } catch (e) {
      setError(authError(e as { code?: string; message?: string }));
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setError("Сервис авторизации не настроен.");
      return;
    }
    const client = supabase;
    const cleanEmail = email.trim().toLowerCase();
    if (mode === "register") {
      const issue = validateRegistration(name, cleanEmail, password, repeat);
      if (issue) {
        setError(issue);
        return;
      }
    } else if (mode === "update") {
      if (password.length < 8 || password.length > 128) {
        setError("Пароль должен содержать от 8 до 128 символов.");
        return;
      }
      if (password !== repeat) {
        setError("Пароли не совпадают.");
        return;
      }
    } else if (!validateEmail(cleanEmail)) {
      setError("Укажите корректный email.");
      return;
    }
    await run(async () => {
      if (mode === "register") {
        const { data, error } = await bounded(
          client.auth.signUp({
            email: cleanEmail,
            password,
            options: {
              data: { display_name: name.trim() },
              emailRedirectTo: redirectUrl(),
            },
          }),
        );
        if (error) throw error;
        setPassword("");
        setRepeat("");
        if (!data.session) {
          setMode("confirm");
          setCooldown(60);
        } else setInfo("Аккаунт создан. Проверяем вход…");
      } else if (mode === "login") {
        if (!password) {
          setError("Введите пароль.");
          return;
        }
        const { error } = await bounded(
          client.auth.signInWithPassword({ email: cleanEmail, password }),
        );
        if (error) throw error;
        setPassword("");
        setInfo("Вход выполнен. Проверяем сессию…");
      } else if (mode === "forgot") {
        const { error } = await bounded(
          client.auth.resetPasswordForEmail(cleanEmail, {
            redirectTo: redirectUrl(),
          }),
        );
        if (error) throw error;
        setMode("sent");
        setCooldown(60);
      } else if (mode === "update") {
        const { error } = await bounded(client.auth.updateUser({ password }));
        if (error) throw error;
        await bounded(client.auth.signOut({ scope: "local" }));
        setPassword("");
        setRepeat("");
        setMode("login");
        setInfo("Пароль изменён. Войдите с новым паролем.");
        onPasswordUpdated();
      }
    });
  }
  return (
    <div className="auth-scene">
      <div className="auth-art" aria-hidden="true" />
      <div className="auth-scan" aria-hidden="true" />
      <header className="auth-header">
        <a
          className="auth-logo"
          href={import.meta.env.BASE_URL}
          aria-label="DEVOPS QUEST — начало"
        >
          <span>
            <Terminal size={24} />
          </span>
          DEVOPS<span className="auth-logo-quest">QUEST</span>
        </a>
        <span className="auth-header-note">
          <span /> ТВОЯ ЛИЧНАЯ КАМПАНИЯ
        </span>
      </header>
      <main className="auth-layout">
        <section className="auth-story">
          <div className="auth-eyebrow">
            <span /> НОВЫЙ МИР. ТВОИ ПРАВИЛА.
          </div>
          <h1>
            Твой путь в <em>DevOps</em> начинается здесь
            <span className="auth-period">.</span>
          </h1>
          <p>
            Прокачивай навыки. Выполняй миссии.
            <br />
            Строй будущее, которым управляешь ты.
          </p>
          <div className="auth-story-footer">
            <span>01 / НАЧАЛО ПУТИ</span>
            <div />
            <span>ИЗ ИДЕИ — В ИНЖЕНЕРА</span>
          </div>
        </section>
        <section className="auth-panel" aria-label="Авторизация">
          <div className="auth-panel-top">
            <span className="auth-panel-id">QUEST ID</span>
            <ShieldCheck size={18} />
          </div>
          {mode !== "welcome" && !recovery && (
            <button
              className="auth-back"
              type="button"
              onClick={() => navigate("welcome")}
              disabled={busy}
            >
              <ArrowLeft size={14} /> Назад
            </button>
          )}
          {mode === "welcome" ? (
            <>
              <span className="auth-kicker">ГОТОВ К СЛЕДУЮЩЕМУ УРОВНЮ?</span>
              <h2>
                Твоя история
                <br />
                начинается сейчас.
              </h2>
              <p className="auth-description">
                Войди в свой аккаунт — и продолжи путь к настоящим навыкам
                DevOps.
              </p>
              {linkRequired && (
                <p className="auth-hint">
                  Войди в существующий аккаунт, чтобы связать Telegram. Новый
                  профиль автоматически не создаётся.
                </p>
              )}
              <button
                className="auth-primary"
                onClick={() => navigate("login")}
              >
                Войти <ArrowUpRight size={19} />
              </button>
              <button
                className="auth-secondary"
                onClick={() => navigate("register")}
              >
                Создать аккаунт
              </button>
              <button className="auth-link" onClick={() => navigate("forgot")}>
                Забыли пароль?
              </button>
            </>
          ) : mode === "confirm" ? (
            <div className="auth-confirm">
              <Mail size={38} />
              <h2>Проверь почту</h2>
              <p>
                Письмо подтверждения запрошено для{" "}
                <strong>{email.trim()}</strong>. Перейди по ссылке, затем
                вернись в приложение.
              </p>
              <p className="auth-hint">
                Проверь «Спам». Если письмо не приходит, почтовый сервис проекта
                может требовать настройки SMTP.
              </p>
              <button
                className="auth-primary"
                disabled={busy || cooldown > 0}
                onClick={() =>
                  run(async () => {
                    const { error } = await bounded(
                      supabase!.auth.resend({
                        type: "signup",
                        email: email.trim().toLowerCase(),
                        options: { emailRedirectTo: redirectUrl() },
                      }),
                    );
                    if (error) throw error;
                    setInfo("Письмо запрошено повторно.");
                    setCooldown(60);
                  })
                }
              >
                {busy ? (
                  <LoaderCircle className="auth-spinner" />
                ) : cooldown ? (
                  `Отправить повторно через ${cooldown} с`
                ) : (
                  "Отправить письмо повторно"
                )}
              </button>
              <button
                className="auth-secondary"
                onClick={() => navigate("login")}
              >
                Перейти ко входу
              </button>
              <button
                className="auth-link"
                onClick={() => navigate("register")}
              >
                Исправить email
              </button>
            </div>
          ) : mode === "sent" ? (
            <div className="auth-confirm">
              <CheckCircle2 size={38} />
              <h2>Проверь почту</h2>
              <p>
                Если аккаунт с этим адресом существует, на него запрошена ссылка
                для восстановления. Она откроет форму нового пароля.
              </p>
              <button
                className="auth-primary"
                disabled={cooldown > 0}
                onClick={() => navigate("forgot")}
              >
                {cooldown
                  ? `Повторить через ${cooldown} с`
                  : "Запросить новую ссылку"}
              </button>
              <button
                className="auth-secondary"
                onClick={() => navigate("login")}
              >
                Вернуться ко входу
              </button>
            </div>
          ) : (
            <>
              <span className="auth-kicker">
                {mode === "register"
                  ? "СОЗДАЙ СВОЙ QUEST ID"
                  : mode === "forgot"
                    ? "ВОССТАНОВЛЕНИЕ ДОСТУПА"
                    : mode === "update"
                      ? "ПОЧТИ ГОТОВО"
                      : "С ВОЗВРАЩЕНИЕМ"}
              </span>
              <h2>
                {mode === "register"
                  ? "Создать аккаунт"
                  : mode === "forgot"
                    ? "Забыли пароль?"
                    : mode === "update"
                      ? "Новый пароль"
                      : "Войти в аккаунт"}
              </h2>
              {mode === "forgot" && (
                <p className="auth-description">
                  Отправим ссылку для безопасного сброса пароля.
                </p>
              )}
              <form onSubmit={submit} noValidate>
                {mode === "register" && (
                  <label>
                    <span>
                      <UserRound size={14} />
                      Имя пользователя
                    </span>
                    <input
                      autoComplete="nickname"
                      maxLength={40}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={busy}
                      placeholder="Как к тебе обращаться"
                    />
                  </label>
                )}
                {mode !== "update" && (
                  <label>
                    <span>
                      <Mail size={14} />
                      Email
                    </span>
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={busy}
                      placeholder="you@example.com"
                    />
                  </label>
                )}
                {mode !== "forgot" && (
                  <label>
                    <span>
                      <LockKeyhole size={14} />
                      {mode === "update" ? "Новый пароль" : "Пароль"}
                    </span>
                    <input
                      type="password"
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      minLength={8}
                      maxLength={128}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={busy}
                      placeholder="Не менее 8 символов"
                    />
                  </label>
                )}
                {(mode === "register" || mode === "update") && (
                  <label>
                    <span>
                      <LockKeyhole size={14} />
                      Повтор пароля
                    </span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      maxLength={128}
                      value={repeat}
                      onChange={(e) => setRepeat(e.target.value)}
                      disabled={busy}
                      placeholder="Повтори пароль"
                    />
                  </label>
                )}
                <button className="auth-primary" type="submit" disabled={busy}>
                  {busy ? (
                    <>
                      <LoaderCircle size={18} className="auth-spinner" />{" "}
                      Подождите…
                    </>
                  ) : (
                    <>
                      {mode === "register"
                        ? "Создать аккаунт"
                        : mode === "forgot"
                          ? "Отправить ссылку"
                          : mode === "update"
                            ? "Сохранить пароль"
                            : "Войти"}
                      <ArrowUpRight size={18} />
                    </>
                  )}
                </button>
              </form>
              {mode === "login" && (
                <button
                  className="auth-link"
                  onClick={() => navigate("forgot")}
                  disabled={busy}
                >
                  Забыли пароль?
                </button>
              )}
              {mode === "login" && (
                <p className="auth-switch">
                  Ещё нет аккаунта?{" "}
                  <button onClick={() => navigate("register")}>
                    Создать аккаунт
                  </button>
                </p>
              )}
              {mode === "register" && (
                <p className="auth-switch">
                  Уже есть аккаунт?{" "}
                  <button onClick={() => navigate("login")}>Войти</button>
                </p>
              )}
            </>
          )}
          {(error || notice) && (
            <div
              className={
                notice.startsWith("Пароль изменён") && !error
                  ? "auth-info"
                  : "auth-error"
              }
              role={
                notice.startsWith("Пароль изменён") && !error
                  ? "status"
                  : "alert"
              }
            >
              {error || notice}
            </div>
          )}
          {info && (
            <div className="auth-info" role="status">
              {info}
            </div>
          )}
          <div className="auth-secure">
            <ShieldCheck size={13} /> Личный прогресс. Защищённый вход.
          </div>
        </section>
      </main>
      <footer className="auth-footer">
        <span>DEVOPS QUEST © {new Date().getFullYear()}</span>
        <span>ТВОЙ ПРОГРЕСС НАЧИНАЕТСЯ С ПЕРВОГО ШАГА</span>
      </footer>
    </div>
  );
}
