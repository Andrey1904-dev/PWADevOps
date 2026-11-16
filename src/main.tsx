import type { User } from "@supabase/supabase-js";
import { TelegramLink } from "./TelegramLink";
import { AuthGate } from "./auth/AuthGate";
import { bounded } from "./auth/validation";
import React, { useEffect, useState, useRef, useMemo } from "react";
import { createRoot } from "react-dom/client";
import {
  Terminal,
  LayoutDashboard,
  Map,
  CalendarDays,
  ChartNoAxesCombined,
  Settings,
  Play,
  Square,
  ArrowUpRight,
  Check,
  Flame,
  Shield,
  Clock,
  ChevronRight,
  Wifi,
  Download,
} from "lucide-react";
import {
  chapters as baseChapters,
  statusLabels,
  type MissionStatus,
} from "./catalog";
import { elapsed, localParts } from "./domain";
import {
  readState,
  persist,
  acknowledge,
  sync,
  supabase,
  type State,
  type Progress,
} from "./store";
import { telegramApp, telegramSession, checkMiniSession } from "./telegram";
import { ErrorBoundary } from "./ErrorBoundary";
import {
  adaptivePlan,
  nextShifts,
  shift,
  recommendedMinutes,
  addDays,
} from "./adaptive";
import { gameStats } from "./game";
import { useRegisterSW } from "virtual:pwa-register/react";
import "./style.css";
import { Art, chapterArt, bossArt } from "./presentation/Art";
import { Profile } from "./presentation/Profile";
import { Victory } from "./presentation/Victory";
import "./presentation/cinema.css";
import { validateImport } from "./validation";
const tabs = [
  "Главная",
  "План обучения",
  "Календарь",
  "Статистика",
  "Настройки",
];
const icons = [
  LayoutDashboard,
  Map,
  CalendarDays,
  ChartNoAxesCombined,
  Settings,
];
function App({ account, onLogout }: { account: User; onLogout: () => void }) {
  const [s, setS] = useState(() => readState(account.id));
  const [tab, setTab] = useState(
    () =>
      (
        ({
          plan: 1,
          calendar: 2,
          stats: 3,
          settings: 4,
          reminders: 4,
          boss: 1,
        }) as Record<string, number>
      )[new URLSearchParams(location.search).get("screen") || ""] || 0,
  );
  const [miniStatus, setMiniStatus] = useState(
    telegramApp() ? "authenticated" : "",
  );
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const [message, setMessage] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState(1);
  const [calendarOffset, setCalendarOffset] = useState(0);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    // AuthGate revalidates on returning from Telegram and remounts the protected app.
    // Preserve the selected screen without retaining or bypassing a rejected session.
    const url = new URL(window.location.href);
    const screen = ["", "plan", "calendar", "stats", "settings"][tab];
    if (screen) url.searchParams.set("screen", screen);
    else url.searchParams.delete("screen");
    window.history.replaceState(null, "", url);
  }, [tab]);
  const user = account.email || "";
  const userId = account.id;
  const displayName =
    typeof account.user_metadata?.display_name === "string"
      ? account.user_metadata.display_name
      : "Инженер";
  const [busy, setBusy] = useState(false);
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramPresent, setTelegramPresent] = useState(false);
  useEffect(() => {
    if (!user || !supabase) {
      setTelegramLinked(false);
      setTelegramPresent(false);
      return;
    }
    const client = supabase;
    const check = () => {
      void client
        .from("telegram_connections")
        .select("chat_id,blocked")
        .eq("user_id", userId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!error) {
            setTelegramPresent(!!data);
            setTelegramLinked(!!data && !data.blocked);
          }
        });
    };
    check();
    const timer = setInterval(check, 5000);
    const visible = () => {
      if (document.visibilityState === "visible") check();
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [user, userId]);
  useEffect(() => {
    if (!telegramApp() || !user) return;
    const check = () => {
      if (document.visibilityState === "hidden" || !navigator.onLine) return;
      void checkMiniSession().then((valid) => {
        if (!valid) {
          setMiniStatus("link_required");
          setMessage("Привязка отозвана. Mini App-сессия завершена.");
        }
      });
    };
    const timer = setInterval(check, 5000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    check();
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [user, userId]);
  const [victory, setVictory] = useState<number | null>(null);
  const seenBossRewards = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (loadingAccount) return;
    const rewards = new Set(
      (s.rewardEvents || [])
        .filter((e) => e.event_key.endsWith(":boss"))
        .map((e) => e.event_key),
    );
    if (seenBossRewards.current) {
      const added = [...rewards].find(
        (key) => !seenBossRewards.current!.has(key),
      );
      if (added) setVictory(Number(added.split("-")[0]));
    }
    seenBossRewards.current = rewards;
  }, [s.rewardEvents, loadingAccount]);
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const chapters = baseChapters.map((c) => ({
    ...c,
    ...s.overrides?.["chapter-" + c.id],
    missions: c.missions.map((m) => ({ ...m, ...s.overrides?.[m.id] })),
  }));
  const chapter = chapters.find((c) =>
    c.missions.some((m) => m.id === s.current),
  )!;
  const mission = chapter.missions.find((m) => m.id === s.current)!;
  const progress: Progress = s.progress[s.current] || {
    status: "not_started",
    note: "",
    error: "",
    github: "",
    review: "",
  };
  const verified = Object.values(s.progress).filter(
    (p) => p.status === "verified",
  ).length;
  const solved = Object.values(s.progress).filter((p) =>
    ["solved", "verified"].includes(p.status),
  ).length;
  const seconds = s.sessions.reduce((n, x) => n + x.seconds, 0);
  const today = (() => {
    try {
      return s.settings.timezone
        ? localParts(new Date(), s.settings.timezone).date
        : new Date().toLocaleDateString("en-CA");
    } catch {
      return new Date().toLocaleDateString("en-CA");
    }
  })();
  const displayTimezone = (() => {
    try {
      new Intl.DateTimeFormat("ru", {
        timeZone: s.settings.timezone || undefined,
      });
      return s.settings.timezone || undefined;
    } catch {
      return undefined;
    }
  })();
  const game = gameStats(s, today);
  const day = shift(s, today);
  const personalPlan = useMemo(() => adaptivePlan(s, today, 560), [s, today]);
  const todayPlan = personalPlan[0];
  const nearest = nextShifts(s, today);
  useEffect(() => {
    const app = telegramApp();
    if (!app) return;
    setMiniStatus("authenticated");
    app.ready();
    app.expand();
    const theme = () => {
      document.documentElement.dataset.telegramTheme = app.colorScheme;
      app.setHeaderColor(app.colorScheme === "light" ? "#f2f5fa" : "#0b1016");
      app.setBackgroundColor(
        app.colorScheme === "light" ? "#f2f5fa" : "#0b1016",
      );
    };
    theme();
    app.onEvent("themeChanged", theme);
    return () => app.offEvent("themeChanged", theme);
  }, []);
  useEffect(() => {
    const app = telegramApp();
    if (!app) return;
    const back = () => setTab(0);
    if (tab) app.BackButton.show();
    else app.BackButton.hide();
    app.BackButton.onClick(back);
    return () => app.BackButton.offClick(back);
  }, [tab]);
  const pct = Math.round((verified / 360) * 100);
  const bosses = Object.entries(s.progress).filter(
    ([id, p]) => id.endsWith("-20") && p.status === "verified",
  ).length;
  function change(
    fn: (v: State) => State,
    kind: "progress" | "session" | "settings" = "progress",
  ) {
    setS((v) => {
      const next = fn(v);
      const payload = { state: { ...next, queue: [], version: undefined } };
      return {
        ...next,
        queue: [
          ...v.queue,
          { id: crypto.randomUUID(), kind, payload, baseVersion: v.version },
        ],
      };
    });
  }
  async function synchronize() {
    if (busy) return;
    setBusy(true);
    try {
      const scope = userId;
      const n = await bounded(sync(s));
      if (currentUser.current !== scope) return;
      setS((current) => acknowledge(s, current, n));
      setMessage(
        supabase
          ? "Синхронизировано"
          : "Локальный режим: Supabase не подключён",
      );
    } catch (e) {
      const reason = (e as Error).message;
      setMessage(
        /[а-я]/i.test(reason)
          ? reason
          : "Синхронизация временно недоступна. Проверьте соединение и настройки.",
      );
      if (telegramApp())
        void checkMiniSession().then((valid) => {
          if (!valid) setMiniStatus("link_required");
        });
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    try {
      persist(s, userId);
    } catch {
      setMessage(
        "Хранилище устройства заполнено. Экспортируйте данные; локальные изменения пока находятся в памяти.",
      );
    }
  }, [s, userId]);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      clearInterval(tick);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  useEffect(() => {
    if (loadingAccount && online && user && !busy) {
      void synchronize().finally(() => setLoadingAccount(false));
    }
  }, [loadingAccount, online, user, busy]);
  useEffect(() => {
    if (online && user && !busy && !loadingAccount && s.queue.length) {
      const t = setTimeout(synchronize, 1500);
      return () => clearTimeout(t);
    }
  }, [online, user, s.queue.length]);
  useEffect(() => {
    if (!user || !online) return;
    const t = setInterval(() => {
      if (!busy) synchronize();
    }, 15000);
    return () => clearInterval(t);
  }, [user, online, s, busy]);
  function finish() {
    if (!s.active && !s.timerSeconds) {
      setMessage("Сначала начните занятие");
      return;
    }
    const sec = Math.min(
      86400,
      (s.timerSeconds || 0) + (s.active ? elapsed(s.active, Date.now()) : 0),
    );
    change(
      (v) => ({
        ...v,
        active: null,
        timerSeconds: 0,
        sessions: [
          ...v.sessions,
          { id: crypto.randomUUID(), seconds: sec, date: today, note: "" },
        ],
      }),
      "session",
    );
    setMessage("Занятие сохранено. Статус знаний изменяется отдельно.");
  }
  function editProgress(key: keyof Progress, value: string) {
    change((v) => ({
      ...v,
      progress: { ...v.progress, [v.current]: { ...progress, [key]: value } },
    }));
  }
  function settings(key: string, value: unknown) {
    change(
      (v) => ({ ...v, settings: { ...v.settings, [key]: value } }),
      "settings",
    );
  }
  function exportData() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(s, null, 2)], { type: "application/json" }),
    );
    a.download = "devops-quest-backup.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const card = (
    title: string,
    value: React.ReactNode,
    sub: string,
    Icon = Clock,
  ) => (
    <article className="metric">
      <div className="muted">
        <Icon size={17} />
        {title}
      </div>
      <strong>{value}</strong>
      <small>{sub}</small>
    </article>
  );
  if (miniStatus === "loading" || (loadingAccount && online))
    return (
      <div className="connection-screen" role="status">
        <Terminal size={36} />
        <h1>DEVOPS QUEST</h1>
        <p>
          {miniStatus === "loading"
            ? "Подключаем защищённую сессию Telegram…"
            : "Загружаем ваш прогресс…"}
        </p>
      </div>
    );
  return (
    <div className="app">
      <aside>
        <a className="brand" onClick={() => setTab(0)}>
          <span className="brand-icon">
            <Terminal />
          </span>
          <span>
            DEVOPS<span className="cyan"> QUEST</span>
            <small>ПУТЬ К НОВОМУ УРОВНЮ</small>
          </span>
        </a>
        <div className="workspace">ЛИЧНОЕ ПРОСТРАНСТВО</div>
        <nav>
          {tabs.map((t, i) => {
            const Icon = icons[i];
            return (
              <button
                key={t}
                className={tab === i ? "active" : ""}
                onClick={() => setTab(i)}
              >
                <Icon size={19} />
                {t}
                {tab === i && <span className="nav-dot" />}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="journey">
            <Shield size={20} />
            <b>Путь инженера</b>
            <p>18 глав · от основ до Middle</p>
            <div className="bar">
              <i style={{ width: `${pct}%` }} />
            </div>
            <small>{pct}% пути подтверждено</small>
          </div>
          <div className="profile">
            <div className="avatar">DQ</div>
            <div>
              <b>{displayName}</b>
              <small>Уровень знаний: по проверкам</small>
            </div>
            <span className="green">●</span>
          </div>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            МОЙ ПУТЬ <ChevronRight size={13} /> {tabs[tab]}
          </div>
          <button className="sync" disabled={busy} onClick={synchronize}>
            <Wifi size={14} />
            {busy
              ? "Синхронизация…"
              : !online
                ? "Офлайн"
                : supabase
                  ? `${s.queue.length} в очереди`
                  : "Локальный режим"}
          </button>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">DEVOPS QUEST / СЕЗОН 01</div>
              <h1>{tab === 0 ? "Каждый шаг — ближе к цели." : tabs[tab]}</h1>
              <p className="muted">
                {tab === 0
                  ? "Твой следующий уровень начинается с одной миссии."
                  : "Учись в своём ритме. Подтверждай знания практикой."}
              </p>
            </div>
            <span className="date">
              {new Date().toLocaleDateString("ru", {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: displayTimezone,
              })}
            </span>
          </div>
          {needRefresh && (
            <div className="notice">
              Доступна новая версия.{" "}
              <button
                disabled={!!s.queue.length || !!s.active}
                onClick={() => updateServiceWorker(true)}
              >
                Обновить приложение
              </button>
              {s.queue.length > 0 && (
                <small>Сначала синхронизируйте изменения.</small>
              )}
            </div>
          )}
          {miniStatus === "link_required" && (
            <section className="mini-welcome panel">
              <span className="eyebrow">TELEGRAM MINI APP</span>
              <h2>Твой путь инженера — здесь.</h2>
              <p>
                Войди в существующий аккаунт в настройках и свяжи Telegram.
                Прогресс PWA сохранится.
              </p>
              <button className="primary" onClick={() => setTab(4)}>
                Войти и связать аккаунт
              </button>
            </section>
          )}
          {miniStatus &&
            !["link_required", "authenticated", "linked", "outside"].includes(
              miniStatus,
            ) && (
              <p role="alert" className="notice">
                {miniStatus}
              </p>
            )}
          {victory && (
            <Victory chapter={victory} onClose={() => setVictory(null)} />
          )}
          {message && (
            <div
              role="status"
              className="notice"
              onClick={() => setMessage("")}
            >
              {message} <span>×</span>
            </div>
          )}
          {tab === 0 && (
            <>
              <section className="hero">
                <Art name="hero" priority />
                <div className="hero-main">
                  <div className="pill">
                    <span /> ГЛАВА {String(chapter.id).padStart(2, "0")} / 18{" "}
                    <span className="muted">· ВАШ ТЕКУЩИЙ ЭТАП</span>
                  </div>
                  <h2>{chapter.title}</h2>
                  <p className="hero-mission">
                    МИССИЯ №{mission.number} · {mission.title}
                  </p>
                  <p>
                    Прочный фундамент для большой инфраструктуры.
                    <br />
                    Разбирайся, экспериментируй, автоматизируй.
                  </p>
                  <button
                    className="primary"
                    onClick={() =>
                      document
                        .getElementById("mission")
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                  >
                    Продолжить миссию <ArrowUpRight size={17} />
                  </button>
                  <div className="chapter-progress">
                    <div>
                      <span>Прогресс главы</span>
                      <b>
                        {
                          chapter.missions.filter(
                            (m) => s.progress[m.id]?.status === "verified",
                          ).length
                        }{" "}
                        / 20 миссий
                      </b>
                    </div>
                    <div className="bar">
                      <i
                        style={{
                          width: `${chapter.missions.filter((m) => s.progress[m.id]?.status === "verified").length * 5}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </section>
              <section className="player-card">
                <div className="level-orb">
                  {game.level}
                  <small>УРОВЕНЬ</small>
                </div>
                <div className="player-xp">
                  <div>
                    <h3>Инженер в развитии</h3>
                    <b>{game.xp} XP</b>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${game.levelProgress}%` }} />
                  </div>
                  <small>
                    Ещё {game.next} XP до уровня {game.level + 1} · награды за
                    выполненные миссии
                  </small>
                </div>
                <div className="streak">
                  <Flame size={21} />
                  <b>{game.streak}</b>
                  <small>дней практики</small>
                </div>
              </section>
              <div className="metrics">
                {card(
                  "Миссии решены",
                  solved,
                  `${verified} подтверждено проверкой`,
                  Check,
                )}
                {card(
                  "Боссы побеждены",
                  bosses,
                  "Из 18 финальных испытаний",
                  Shield,
                )}
                {card(
                  "Время практики",
                  `${Math.floor(seconds / 3600)}ч ${Math.floor((seconds % 3600) / 60)}м`,
                  "Фактически записанное время",
                  Clock,
                )}
                {card(
                  "Общий прогресс",
                  `${pct}%`,
                  "По проверенным миссиям",
                  ChartNoAxesCombined,
                )}
              </div>
              <div className="two-cols">
                <section className="panel" id="mission">
                  <div className="section-title">
                    <h3>Текущая миссия</h3>
                    <span className="tag">
                      {chapter.title.split(":")[0].toUpperCase()} /{" "}
                      {mission.number}
                    </span>
                  </div>
                  <h2 className="mission-title">{mission.title}</h2>
                  <p className="muted">{mission.task}</p>
                  <div className="field-row">
                    <label>
                      Статус
                      <select
                        value={progress.status}
                        onChange={(e) =>
                          editProgress(
                            "status",
                            e.target.value as MissionStatus,
                          )
                        }
                      >
                        {Object.entries(statusLabels).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="timer">
                      <Clock size={17} />
                      {new Date(
                        ((s.timerSeconds || 0) +
                          (s.active ? elapsed(s.active, now) : 0)) *
                          1000,
                      )
                        .toISOString()
                        .slice(11, 19)}
                    </div>
                  </div>
                  <div className="actions">
                    <button
                      className="primary"
                      disabled={!!s.active || s.settings.paused}
                      onClick={() =>
                        change((v) => ({ ...v, active: Date.now() }), "session")
                      }
                    >
                      <Play size={15} />
                      Начать занятие
                    </button>
                    <button
                      disabled={!s.active}
                      onClick={() =>
                        change(
                          (v) => ({
                            ...v,
                            timerSeconds: Math.min(
                              86400,
                              (v.timerSeconds || 0) +
                                (v.active ? elapsed(v.active, Date.now()) : 0),
                            ),
                            active: null,
                          }),
                          "session",
                        )
                      }
                    >
                      Остановить таймер
                    </button>
                    <button onClick={finish}>
                      <Square size={14} />
                      Завершить
                    </button>
                  </div>
                  <details>
                    <summary>Заметки и результат проверки</summary>
                    <label>
                      Название миссии
                      <input
                        value={mission.title}
                        onChange={(e) =>
                          change((v) => ({
                            ...v,
                            overrides: {
                              ...v.overrides,
                              [v.current]: {
                                ...v.overrides?.[v.current],
                                title: e.target.value,
                              },
                            },
                          }))
                        }
                      />
                    </label>
                    <label>
                      Задание
                      <textarea
                        value={mission.task}
                        onChange={(e) =>
                          change((v) => ({
                            ...v,
                            overrides: {
                              ...v.overrides,
                              [v.current]: {
                                ...v.overrides?.[v.current],
                                task: e.target.value,
                              },
                            },
                          }))
                        }
                      />
                    </label>
                    {(["note", "error", "github", "review"] as const).map(
                      (k, i) => (
                        <label key={k}>
                          {
                            [
                              "Заметка",
                              "Ошибка и исправление",
                              "Ссылка на GitHub",
                              "Результат проверки",
                            ][i]
                          }
                          <textarea
                            value={progress[k]}
                            onChange={(e) => editProgress(k, e.target.value)}
                          />
                        </label>
                      ),
                    )}
                  </details>
                </section>
                <section className="panel">
                  <div className="section-title">
                    <h3>Сегодняшний план</h3>
                    <CalendarDays size={17} />
                  </div>
                  <div className="day-label">
                    <span className="green">●</span>
                    {day === null
                      ? "График ещё не настроен"
                      : day === "work"
                        ? "Рабочий день · короткая практика"
                        : "Выходной · глубокая практика"}
                  </div>
                  <div className="plan-item">
                    <span className="step">01</span>
                    <div>
                      <b>Следующее занятие · миссия {todayPlan.missionId}</b>
                      <p>
                        {s.restDate === today
                          ? "Сегодня отдых"
                          : s.settings.paused
                            ? "Обучение на паузе"
                            : s.heavyDate === today
                              ? `Лёгкий ориентир: ${recommendedMinutes(s, today)} минут`
                              : day
                                ? `Ориентир: ${todayPlan.minutes} минут · ${todayPlan.activity === "theory" ? "теория и короткие задачи" : todayPlan.activity === "review" ? "повторение; босс ждёт выходного" : "практика и лаборатории"}`
                                : "Укажите первую рабочую смену в настройках"}
                      </p>
                    </div>
                  </div>
                  <div className="plan-item">
                    <span className="step">02</span>
                    <div>
                      <b>Закрепи результат</b>
                      <p>Запиши выводы и проверь решение</p>
                    </div>
                  </div>
                  <p className="muted">
                    Ближайшая смена: {nearest.work} · выходной: {nearest.rest}.
                    Цель 10–12 часов в неделю — ориентир, а не долг.
                  </p>
                  <div className="actions">
                    <button
                      onClick={() =>
                        change(
                          (v) => ({
                            ...v,
                            energy: { ...v.energy, [today]: "low" },
                            heavyDate: today,
                            restDate: "",
                          }),
                          "settings",
                        )
                      }
                    >
                      Сегодня мало сил
                    </button>
                    <button
                      onClick={() => {
                        const target =
                          mission.number === 20
                            ? personalPlan
                                .slice(1)
                                .find((p) => p.type === "rest")?.date ||
                              addDays(today, 1)
                            : addDays(today, 1);
                        change(
                          (v) => ({
                            ...v,
                            deferred: { ...v.deferred, [v.current]: target },
                            scheduledMissions: {
                              ...v.scheduledMissions,
                              [target]: v.current,
                            },
                          }),
                          "settings",
                        );
                        setMessage("Миссия перенесена. XP сохранён.");
                      }}
                    >
                      Перенести
                    </button>
                    <button
                      onClick={() =>
                        change(
                          (v) => ({
                            ...v,
                            energy: { ...v.energy, [today]: "more" },
                            heavyDate: "",
                            restDate: "",
                          }),
                          "settings",
                        )
                      }
                    >
                      Есть время на большее
                    </button>
                    <button
                      onClick={() =>
                        change((v) => ({ ...v, restDate: today }), "settings")
                      }
                    >
                      Сегодня отдыхаю
                    </button>
                  </div>
                  <div className="checkpoint">
                    <Shield size={23} />
                    <div>
                      <small>СЛЕДУЮЩАЯ КОНТРОЛЬНАЯ ТОЧКА</small>
                      <b>{chapter.boss}</b>
                    </div>
                    <ChevronRight size={16} />
                  </div>
                </section>
              </div>
              <section className="roadmap-strip">
                <div>
                  <span className="eyebrow">БОЛЬШАЯ ЦЕЛЬ</span>
                  <h3>От первой строки кода до Middle DevOps</h3>
                  <p className="muted">
                    18 месяцев практики. Даты — ориентир, темп выбираешь ты.
                  </p>
                </div>
                <button onClick={() => setTab(1)}>
                  Смотреть маршрут <ArrowUpRight size={16} />
                </button>
              </section>
            </>
          )}
          {tab === 1 && (
            <>
              <section className="skill-map" aria-label="Карта развития DevOps">
                {chapters.map((c) => {
                  const done = c.missions.filter(
                    (m) => s.progress[m.id]?.status === "verified",
                  ).length;
                  return (
                    <button
                      key={c.id}
                      className={selected === c.id ? "selected" : ""}
                      onClick={() => setSelected(c.id)}
                    >
                      <Art name={chapterArt[c.id - 1]} />
                      <span className="location-status">
                        {done === 20
                          ? "ГЛАВА ПРОЙДЕНА"
                          : c.id === chapter.id
                            ? "ТЕКУЩАЯ ЛОКАЦИЯ"
                            : "ОТКРЫТА ДЛЯ ИЗУЧЕНИЯ"}
                      </span>
                      <span className="map-node">
                        {done === 20 ? "✓" : String(c.id).padStart(2, "0")}
                      </span>
                      <b>{c.title}</b>
                      <small>
                        {done}/20 проверено · {c.month}
                      </small>
                      <span className="bar">
                        <i style={{ width: `${done * 5}%` }} />
                      </span>
                    </button>
                  );
                })}
              </section>
              <div className="two-cols curriculum">
                <section className="panel">
                  {chapters.map((c) => (
                    <button
                      className={`chapter-row ${selected === c.id ? "chosen" : ""}`}
                      key={c.id}
                      onClick={() => setSelected(c.id)}
                    >
                      <span className="step">
                        {String(c.id).padStart(2, "0")}
                      </span>
                      <div>
                        <b>{c.title}</b>
                        <small>{c.month} · 20 миссий</small>
                      </div>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </section>
                <section className="panel">
                  <div className="chapter-cover">
                    <Art name={chapterArt[selected - 1]} />
                  </div>
                  <h2>{chapters[selected - 1].title}</h2>
                  {[3, 4, 11].includes(selected) && (
                    <div className="skill-slices">
                      {(selected === 3
                        ? [
                            ["Linux", "world-a-3"],
                            ["Bash", "extras-5"],
                          ]
                        : selected === 4
                          ? [
                              ["Networking", "world-a-4"],
                              ["Git", "extras-7"],
                            ]
                          : [
                              ["Terraform", "world-b-5"],
                              ["Cloud", "extras-8"],
                            ]
                      ).map(([title, art]) => (
                        <figure key={title}>
                          <Art name={art} />
                          <figcaption>{title}</figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                  <details>
                    <summary>Изменить главу и даты</summary>
                    {(
                      [
                        "title",
                        "month",
                        "criteria",
                        "boss",
                        "duration",
                      ] as const
                    ).map((k) => (
                      <label key={k}>
                        {
                          {
                            title: "Название",
                            month: "Плановый месяц",
                            criteria: "Критерии освоения",
                            boss: "Финальный босс",
                            duration: "Продолжительность в днях",
                          }[k]
                        }
                        <input
                          type={
                            k === "month"
                              ? "month"
                              : k === "duration"
                                ? "number"
                                : "text"
                          }
                          value={
                            s.overrides?.["chapter-" + selected]?.[k] ??
                            (k === "duration" ? 30 : chapters[selected - 1][k])
                          }
                          onChange={(e) =>
                            change((v) => ({
                              ...v,
                              overrides: {
                                ...v.overrides,
                                ["chapter-" + selected]: {
                                  ...v.overrides?.["chapter-" + selected],
                                  [k]:
                                    k === "duration"
                                      ? Number(e.target.value)
                                      : e.target.value,
                                },
                              },
                            }))
                          }
                        />
                      </label>
                    ))}
                  </details>
                  <p className="muted">
                    Критерии: {chapters[selected - 1].criteria}. Объясните
                    решение, продемонстрируйте работу и восстановление после
                    ошибки.
                  </p>
                  <section className="boss-cover">
                    <Art name={bossArt[selected - 1]} />
                    <small>ФИНАЛЬНОЕ ИСПЫТАНИЕ · ГЛАВА {selected}</small>
                    <h3>Босс: {chapters[selected - 1].title}</h3>
                    <p>{chapters[selected - 1].boss}</p>
                    <p>
                      Сложность:{" "}
                      {selected < 7
                        ? "Базовая"
                        : selected < 13
                          ? "Продвинутая"
                          : "Комплексная"}
                      . Проверяются навыки всех предыдущих глав.
                    </p>
                    <small>
                      Награда: до 300 XP суммарно за решение и подтверждение.
                      Повторно не начисляется.
                    </small>
                    <p>
                      Статус:{" "}
                      {
                        statusLabels[
                          s.progress[`${selected}-20`]?.status || "not_started"
                        ]
                      }
                    </p>
                    <button
                      onClick={() => {
                        change((v) => ({ ...v, current: `${selected}-20` }));
                        setTab(0);
                      }}
                    >
                      Открыть испытание
                    </button>
                  </section>
                  <details className="boss-history">
                    <summary>История испытания</summary>
                    {(s.missionHistory || []).filter(
                      (h) => h.mission_id === `${selected}-20`,
                    ).length ? (
                      (s.missionHistory || [])
                        .filter((h) => h.mission_id === `${selected}-20`)
                        .map((h) => (
                          <p key={h.id}>
                            {new Date(h.changed_at).toLocaleString("ru", {
                              timeZone: displayTimezone,
                            })}{" "}
                            · {statusLabels[h.new_status]}
                          </p>
                        ))
                    ) : (
                      <p className="muted">
                        Сохранённых изменений статуса пока нет. История появится
                        после синхронизации испытания.
                      </p>
                    )}
                    <p className="muted">
                      Результат проверки:{" "}
                      {s.progress[`${selected}-20`]?.review ||
                        "Пока не записан"}
                    </p>
                  </details>
                  {chapters[selected - 1].missions.map((m) => (
                    <button
                      className="mission-row"
                      key={m.id}
                      onClick={() => {
                        change((v) => ({ ...v, current: m.id }));
                        setTab(0);
                      }}
                    >
                      <span>
                        {m.number}. {m.title}
                      </span>
                      <small>
                        {
                          statusLabels[
                            s.progress[m.id]?.status || "not_started"
                          ]
                        }
                      </small>
                    </button>
                  ))}
                </section>
              </div>
            </>
          )}
          {tab === 2 && (
            <section className="panel">
              <div className="section-title">
                <h2>Календарь · 28 дней</h2>
                <div className="actions">
                  <button
                    aria-label="Предыдущие 28 дней"
                    onClick={() => setCalendarOffset((v) => v - 28)}
                  >
                    ←
                  </button>
                  <button onClick={() => setCalendarOffset(0)}>Сегодня</button>
                  <button
                    aria-label="Следующие 28 дней"
                    onClick={() => setCalendarOffset((v) => v + 28)}
                  >
                    →
                  </button>
                </div>
              </div>
              <p className="muted">
                Пропуски не переносятся в долг. Подтверждённый цикл начинается
                17.11.2026. Невыполненная текущая миссия остаётся первым
                следующим шагом без потери XP.
              </p>
              <div className="calendar">
                {Array.from({ length: 28 }, (_, i) => {
                  const d = new Date(today + "T12:00:00Z");
                  d.setUTCDate(d.getUTCDate() + i + calendarOffset);
                  const date = d.toISOString().slice(0, 10);
                  const kind = shift(s, date);
                  const plannedTask = personalPlan.find((p) => p.date === date);
                  const planned = recommendedMinutes(s, date);
                  const total = s.sessions
                    .filter((x) => x.date === date)
                    .reduce((n, x) => n + x.seconds, 0);
                  return (
                    <article className={kind || ""} key={date}>
                      <small>
                        {d.toLocaleDateString("ru", {
                          weekday: "short",
                          timeZone: "UTC",
                        })}
                      </small>
                      <h2>{d.getUTCDate()}</h2>
                      <span>
                        {kind === "work"
                          ? "Рабочий"
                          : kind === "rest"
                            ? "Выходной"
                            : "Не задан"}
                      </span>
                      <small>
                        {total
                          ? `${Math.round(total / 60)} мин выполнено`
                          : date === s.restDate
                            ? "Отдых"
                            : date < today && planned
                              ? "Пропуск · без долга"
                              : planned
                                ? `${planned} мин · план`
                                : "—"}
                      </small>
                      {plannedTask && (
                        <small>
                          {
                            (
                              {
                                theory: "Теория",
                                lab: "Лаборатория",
                                boss: "Босс",
                                review: "Повторение",
                                short: "Короткая задача",
                                rest: "Отдых",
                              } as Record<string, string>
                            )[plannedTask.activity]
                          }{" "}
                          · {plannedTask.missionId}
                        </small>
                      )}
                      <label>
                        Тип дня
                        <select
                          aria-label={`Тип дня ${date}`}
                          value={kind || "rest"}
                          onChange={(e) =>
                            settings("shiftOverrides", {
                              ...s.settings.shiftOverrides,
                              [date]: e.target.value,
                            })
                          }
                        >
                          <option value="work">Рабочий</option>
                          <option value="rest">Выходной</option>
                        </select>
                      </label>
                      <label>
                        Миссия
                        <select
                          aria-label={`Миссия ${date}`}
                          value={
                            s.scheduledMissions?.[date] ||
                            plannedTask?.missionId ||
                            s.current
                          }
                          onChange={(e) =>
                            change(
                              (v) => ({
                                ...v,
                                scheduledMissions: {
                                  ...v.scheduledMissions,
                                  [date]: e.target.value,
                                },
                                ...(e.target.value.endsWith("-20") &&
                                kind === "work"
                                  ? {
                                      bossWorkdayConsent: {
                                        ...v.bossWorkdayConsent,
                                        [date]: true,
                                      },
                                    }
                                  : {}),
                              }),
                              "settings",
                            )
                          }
                        >
                          {chapters
                            .filter(
                              (c) =>
                                c.id ===
                                  Number(
                                    (plannedTask?.missionId || s.current).split(
                                      "-",
                                    )[0],
                                  ) || c.id === chapter.id,
                            )
                            .flatMap((c) => c.missions)
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.id} · {m.title}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        План, мин
                        <input
                          aria-label={`План ${date}`}
                          type="number"
                          min="0"
                          max="720"
                          value={planned}
                          onChange={(e) =>
                            change(
                              (v) => ({
                                ...v,
                                plans: {
                                  ...v.plans,
                                  [date]: Math.max(
                                    0,
                                    Math.min(720, Number(e.target.value)),
                                  ),
                                },
                              }),
                              "settings",
                            )
                          }
                        />
                      </label>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
          {tab === 3 && (
            <>
              <Profile state={s} today={today} name={displayName} />
              <div className="metrics">
                {card("Решено", solved, "Миссий", Check)}
                {card(
                  "Проверено",
                  verified,
                  "Подтверждённый результат",
                  Shield,
                )}
                {card(
                  "Практика",
                  `${Math.round(seconds / 60)} мин`,
                  "Не эквивалент знаний",
                  Clock,
                )}
                {card("Боссы", bosses, "Проверенные испытания", Flame)}
              </div>
              <section className="panel">
                <h3>Достижения и нагрузка</h3>
                <p>
                  {game.xp} XP · Уровень {game.level} · Серия {game.streak} дней
                </p>
                <p className="muted">
                  За 7 дней: {game.weekMinutes} / {s.settings.weeklyGoal || 660}{" "}
                  минут. Пропуски не создают долг.
                </p>
                <div className="bar">
                  <i
                    style={{
                      width: `${Math.min(100, (game.weekMinutes / (s.settings.weeklyGoal || 660)) * 100)}%`,
                    }}
                  />
                </div>
                <p className="muted">
                  {s.sessions.length
                    ? "✓ Первая практика"
                    : "○ Первая практика"}{" "}
                  ·{" "}
                  {verified
                    ? "✓ Первое подтверждение"
                    : "○ Первое подтверждение"}{" "}
                  · {bosses ? "✓ Победитель босса" : "○ Победитель босса"}
                </p>
                <h3>История прогресса</h3>
                {s.missionHistory?.length ? (
                  <div className="progress-history">
                    {[...s.missionHistory]
                      .sort((a, b) => b.changed_at.localeCompare(a.changed_at))
                      .slice(0, 12)
                      .map((h) => (
                        <p key={h.id}>
                          <span>{h.mission_id}</span>{" "}
                          {statusLabels[h.new_status]}{" "}
                          <small>
                            {new Date(h.changed_at).toLocaleDateString("ru", {
                              timeZone: displayTimezone,
                            })}
                          </small>
                        </p>
                      ))}
                  </div>
                ) : (
                  <p className="muted">
                    История проверенных сервером изменений появится после
                    синхронизации.
                  </p>
                )}
                <h3>Журнал занятий</h3>
                {s.sessions.length ? (
                  s.sessions.map((x) => (
                    <div className="session" key={x.id}>
                      <label>
                        Дата
                        <input
                          type="date"
                          value={x.date}
                          onChange={(e) => {
                            if (e.target.value)
                              change(
                                (v) => ({
                                  ...v,
                                  sessions: v.sessions.map((a) =>
                                    a.id === x.id
                                      ? { ...a, date: e.target.value }
                                      : a,
                                  ),
                                }),
                                "session",
                              );
                          }}
                        />
                      </label>
                      <label>
                        Минуты
                        <input
                          type="number"
                          min="0"
                          max="1440"
                          value={Math.round(x.seconds / 60)}
                          onChange={(e) =>
                            change(
                              (v) => ({
                                ...v,
                                sessions: v.sessions.map((a) =>
                                  a.id === x.id
                                    ? {
                                        ...a,
                                        seconds:
                                          Math.max(
                                            0,
                                            Math.min(
                                              1440,
                                              Number(e.target.value),
                                            ),
                                          ) * 60,
                                      }
                                    : a,
                                ),
                              }),
                              "session",
                            )
                          }
                        />
                      </label>
                      <input
                        aria-label="Заметка занятия"
                        placeholder="Заметка"
                        value={x.note}
                        onChange={(e) =>
                          change(
                            (v) => ({
                              ...v,
                              sessions: v.sessions.map((a) =>
                                a.id === x.id
                                  ? { ...a, note: e.target.value }
                                  : a,
                              ),
                            }),
                            "session",
                          )
                        }
                      />
                    </div>
                  ))
                ) : (
                  <p className="muted">
                    Пока нет занятий. Начни с небольшой практики.
                  </p>
                )}
                <button
                  onClick={() =>
                    change(
                      (v) => ({
                        ...v,
                        sessions: [
                          ...v.sessions,
                          {
                            id: crypto.randomUUID(),
                            seconds: 600,
                            date: today,
                            note: "Добавлено вручную",
                          },
                        ],
                      }),
                      "session",
                    )
                  }
                >
                  Добавить 10 минут вручную
                </button>
              </section>
            </>
          )}
          {tab === 4 && (
            <div className="two-cols">
              <section className="panel">
                <h3>Ритм обучения</h3>
                <label>
                  Первая рабочая смена цикла 2/2
                  <input
                    type="date"
                    value={s.settings.anchor || "2026-11-17"}
                    onChange={(e) => settings("anchor", e.target.value)}
                  />
                </label>
                <label>
                  Часовой пояс IANA
                  <input
                    placeholder="Например, Asia/Yekaterinburg"
                    list="timezones"
                    value={s.settings.timezone}
                    onChange={(e) => {
                      settings("timezone", e.target.value);
                    }}
                    onBlur={() => {
                      try {
                        new Intl.DateTimeFormat("ru", {
                          timeZone: s.settings.timezone,
                        });
                      } catch {
                        setMessage("Проверьте часовой пояс IANA");
                      }
                    }}
                  />
                </label>
                <datalist id="timezones">
                  <option value="Asia/Yekaterinburg">
                    Екатеринбург (UTC+5)
                  </option>
                  <option value="Europe/Moscow">Москва (UTC+3)</option>
                  <option value="UTC">UTC</option>
                </datalist>
                {(["work", "rest", "heavy"] as const).map((k, i) => (
                  <label key={k}>
                    {
                      [
                        "Рабочий день, минут",
                        "Выходной, минут",
                        "Тяжёлый день, минут",
                      ][i]
                    }
                    <input
                      type="number"
                      min="1"
                      max="720"
                      value={s.settings[k]}
                      onChange={(e) =>
                        settings(
                          k,
                          Math.max(1, Math.min(720, Number(e.target.value))),
                        )
                      }
                    />
                  </label>
                ))}
                <label>
                  Недельная цель, минут
                  <input
                    type="number"
                    min="60"
                    max="2520"
                    value={s.settings.weeklyGoal || 660}
                    onChange={(e) =>
                      settings(
                        "weeklyGoal",
                        Math.max(60, Math.min(2520, Number(e.target.value))),
                      )
                    }
                  />
                </label>
                <label>
                  Тихие часы: начало
                  <input
                    type="time"
                    value={s.settings.quietStart}
                    onChange={(e) => settings("quietStart", e.target.value)}
                  />
                </label>
                <label>
                  Тихие часы: конец
                  <input
                    type="time"
                    value={s.settings.quietEnd}
                    onChange={(e) => settings("quietEnd", e.target.value)}
                  />
                </label>
                <button onClick={() => settings("paused", !s.settings.paused)}>
                  {s.settings.paused
                    ? "Возобновить обучение"
                    : "Пауза обучения"}
                </button>
              </section>
              <section className="panel">
                <h3>Аккаунт и синхронизация</h3>
                {localStorage.getItem("devops-quest-v1:local") &&
                  !s.legacyImported && (
                    <details className="legacy-progress">
                      <summary>На устройстве есть прежний прогресс</summary>
                      <p className="muted">
                        Можно объединить его с этим аккаунтом. Существующие
                        записи аккаунта имеют приоритет; дата цикла и текущая
                        миссия сохранятся.
                      </p>
                      <button
                        onClick={() => {
                          const a = document.createElement("a");
                          a.href = URL.createObjectURL(
                            new Blob(
                              [
                                localStorage.getItem("devops-quest-v1:local") ||
                                  "{}",
                              ],
                              { type: "application/json" },
                            ),
                          );
                          a.download = "devops-quest-legacy.json";
                          a.click();
                          URL.revokeObjectURL(a.href);
                        }}
                      >
                        Скачать прежнюю копию
                      </button>
                      <button
                        onClick={() => {
                          try {
                            const legacy = validateImport(
                              JSON.parse(
                                localStorage.getItem("devops-quest-v1:local") ||
                                  "null",
                              ),
                            );
                            change((v) => ({
                              ...v,
                              legacyImported: true,
                              progress: { ...legacy.progress, ...v.progress },
                              sessions: [
                                ...new globalThis.Map(
                                  [...legacy.sessions, ...v.sessions].map(
                                    (session) => [session.id, session],
                                  ),
                                ).values(),
                              ],
                              overrides: {
                                ...legacy.overrides,
                                ...v.overrides,
                              },
                            }));
                            setMessage(
                              "Прежний прогресс объединён. Исходная копия сохранена на устройстве.",
                            );
                          } catch {
                            setMessage(
                              "Не удалось прочитать прежний прогресс. Скачайте исходную копию для восстановления.",
                            );
                          }
                        }}
                      >
                        Объединить с моим аккаунтом
                      </button>
                    </details>
                  )}
                <p className="muted">
                  {supabase
                    ? "Supabase настроен"
                    : "Данные хранятся на этом устройстве. Для облака нужны параметры Supabase."}
                </p>
                <p>{displayName}</p>
                <p>{user}</p>
                <button onClick={onLogout}>Выйти</button>
                <button onClick={synchronize}>Синхронизировать</button>
                <button
                  onClick={async () => {
                    if (!supabase || !user) return;
                    exportData();
                    setBusy(true);
                    try {
                      setS(await sync({ ...s, queue: [] }));
                      setMessage(
                        "Загружена облачная версия. Локальная копия экспортирована.",
                      );
                    } catch (e) {
                      setMessage((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Разрешить конфликт: загрузить облако и сохранить локальный
                  JSON
                </button>
                <h3>Telegram</h3>
                {telegramApp() && (
                  <>
                    <p className="muted">
                      {miniStatus === "authenticated" || miniStatus === "linked"
                        ? "Telegram связан с этим аккаунтом."
                        : "После входа свяжите этот аккаунт с Telegram. Дубликат профиля не создаётся."}
                    </p>
                    <button
                      disabled={!user || busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          setMiniStatus(await telegramSession("link"));
                          setMessage(
                            "Аккаунт связан. При следующем запуске Mini App войдёт автоматически.",
                          );
                        } catch (e) {
                          setMessage((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Связать текущий аккаунт с Telegram
                    </button>
                  </>
                )}
                <p className="muted">
                  Уведомления выключены до привязки и отдельного согласия.
                </p>
                <TelegramLink linked={telegramLinked} userId={userId} />
                {telegramPresent && (
                  <button
                    onClick={async () => {
                      if (!supabase) return;
                      const { error } = await supabase.rpc(
                        "revoke_telegram_link",
                      );
                      if (error) {
                        setMessage("Не удалось отозвать привязку.");
                        return;
                      }
                      setTelegramLinked(false);
                      setTelegramPresent(false);
                      await checkMiniSession();
                      setMiniStatus(telegramApp() ? "link_required" : "");
                      setMessage(
                        "Привязка отозвана. Новые автоматические входы запрещены.",
                      );
                    }}
                  >
                    Отозвать привязку Telegram
                  </button>
                )}
                <h3>Уведомления</h3>
                <p className="muted">
                  В рабочие дни напоминания молчат, пока не указаны часы смены.
                  В выходные используется полное расписание.
                </p>
                <label>
                  Начало рабочей смены
                  <input
                    type="time"
                    value={s.settings.workWindowStart || ""}
                    onChange={(e) =>
                      settings("workWindowStart", e.target.value)
                    }
                  />
                </label>
                <label>
                  Конец рабочей смены
                  <input
                    type="time"
                    value={s.settings.workWindowEnd || ""}
                    onChange={(e) => settings("workWindowEnd", e.target.value)}
                  />
                </label>
                {!telegramLinked && (
                  <p className="muted">
                    Сначала свяжите Telegram с аккаунтом. Уведомления требуют
                    отдельного согласия.
                  </p>
                )}
                <div className="weekday-picker">
                  {["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"].map(
                    (label, i) => (
                      <button
                        key={i}
                        aria-pressed={(
                          s.settings.weekdays || [0, 1, 2, 3, 4, 5, 6]
                        ).includes(i)}
                        onClick={() => {
                          const days = s.settings.weekdays || [
                            0, 1, 2, 3, 4, 5, 6,
                          ];
                          settings(
                            "weekdays",
                            days.includes(i)
                              ? days.filter((d) => d !== i)
                              : [...days, i],
                          );
                        }}
                      >
                        {label}
                      </button>
                    ),
                  )}
                </div>
                <label>
                  <input
                    type="checkbox"
                    disabled={!telegramLinked && !s.settings.reminders}
                    checked={s.settings.reminders}
                    onChange={(e) => settings("reminders", e.target.checked)}
                  />{" "}
                  Я согласен получать уведомления после привязки Telegram
                </label>
                <label>
                  Рабочие дни: часы через запятую
                  <input
                    value={s.settings.workTimes || ""}
                    onChange={(e) => settings("workTimes", e.target.value)}
                  />
                </label>
                <label>
                  Выходные: часы через запятую
                  <input
                    value={s.settings.restTimes || ""}
                    onChange={(e) => settings("restTimes", e.target.value)}
                  />
                </label>
                {Object.entries({
                  daily: "Ежедневные",
                  weekly: "Еженедельный отчёт",
                  review: "Повторение",
                  checkpoint: "Контрольные точки",
                  return: "Возвращение",
                  boss: "Финальный босс",
                  chapter: "Завершение главы",
                }).map(([k, label]) => (
                  <label key={k}>
                    <input
                      type="checkbox"
                      checked={s.settings.categories?.[k] ?? true}
                      onChange={(e) =>
                        settings("categories", {
                          ...s.settings.categories,
                          [k]: e.target.checked,
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
                <h3>Данные и восстановление</h3>
                <button onClick={exportData}>
                  <Download size={16} />
                  Экспорт JSON
                </button>
                <label>
                  Импорт фактического прогресса
                  <input
                    type="file"
                    accept="application/json"
                    onChange={async (e) => {
                      try {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const imported = validateImport(
                          JSON.parse(await file.text()),
                        );
                        change((v) => ({
                          ...v,
                          progress: imported.progress,
                          sessions: imported.sessions,
                          settings: { ...v.settings, ...imported.settings },
                        }));
                        setMessage("Прогресс импортирован");
                      } catch {
                        setMessage("Не удалось прочитать резервную копию");
                      }
                    }}
                  />
                </label>
                <p className="muted">
                  Миссии 1–17 не зачтены. Подтвердите фактический прогресс в
                  плане обучения.
                </p>
              </section>
            </div>
          )}
          <footer>
            <span>DEVOPS QUEST</span> Маленькие шаги. Настоящие навыки.{" "}
            <span className="green">● {online ? "В сети" : "Офлайн"}</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthGate>
        {(account, onLogout) => (
          <ErrorBoundary privateData scope={account.id}>
            <App key={account.id} account={account} onLogout={onLogout} />
          </ErrorBoundary>
        )}
      </AuthGate>
    </ErrorBoundary>
  </React.StrictMode>,
);
