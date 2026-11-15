import React, { useEffect, useState, useRef } from "react";
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
import { dayType, elapsed, localParts } from "./domain";
import {
  readState,
  persist,
  acknowledge,
  sync,
  supabase,
  type State,
  type Progress,
} from "./store";
import "./style.css";
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
function App() {
  const [s, setS] = useState(() => readState());
  const [tab, setTab] = useState(0);
  const [message, setMessage] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState(1);
  const [calendarOffset, setCalendarOffset] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState("");
  const [userId, setUserId] = useState("local");
  const [busy, setBusy] = useState(false);
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
  const day = dayType(today, s.settings.anchor);
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
      const n = await sync(s);
      if (currentUser.current !== scope) return;
      setS((current) => acknowledge(s, current, n));
      setMessage(
        supabase
          ? "Синхронизировано"
          : "Локальный режим: Supabase не подключён",
      );
    } catch (e) {
      setMessage((e as Error).message);
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
    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        const scope = session?.user.id || "local";
        setUser(session?.user.email || "");
        if (currentUser.current !== scope) {
          currentUser.current = scope;
          setS(readState(scope));
        }
        setUserId(scope);
      });
      return () => data.subscription.unsubscribe();
    }
  }, []);
  useEffect(() => {
    if (online && user && !busy && s.queue.length) {
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
  async function auth(mode: "signup" | "login") {
    if (!supabase) {
      setMessage("Сначала подключите Supabase по README");
      return;
    }
    const { error } =
      mode === "signup"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
    setMessage(error?.message || "Проверьте почту или войдите в аккаунт");
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
  return (
    <div className="app">
      <aside>
        <a className="brand" onClick={() => setTab(0)}>
          <span className="brand-icon">
            <Terminal />
          </span>
          <span>
            DEVOPS<span className="cyan"> QUEST</span>
            <small>ENGINEER YOUR FUTURE</small>
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
              <b>{user || "Будущий DevOps"}</b>
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
          <button className="sync" onClick={synchronize}>
            <Wifi size={14} />
            {!online
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
              })}
            </span>
          </div>
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
                <div className="hero-main">
                  <div className="pill">
                    <span /> ГЛАВА {String(chapter.id).padStart(2, "0")} / 18{" "}
                    <span className="muted">· ВАШ ТЕКУЩИЙ ЭТАП</span>
                  </div>
                  <h2>{chapter.title}</h2>
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
                    Продолжить обучение <ArrowUpRight size={17} />
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
                <div className="terminal-art">
                  <div className="terminal-title">
                    <span>● ● ●</span> quest.py
                  </div>
                  <code>
                    <span className="purple">class</span>{" "}
                    <span className="cyan">DevOpsEngineer</span>:<br />
                    <br /> def <span className="green">__init__</span>(self):
                    <br /> self.curiosity = <span className="orange">True</span>
                    <br /> self.progress ={" "}
                    <span className="orange">"every day"</span>
                    <br />
                    <br />{" "}
                    <span className="muted">
                      # build. break. learn. repeat.
                    </span>
                    <br /> self.<span className="cyan">next_level</span>()
                    <br />
                    <br />
                    <span className="green">❯</span>{" "}
                    <span className="cursor">_</span>
                  </code>
                  <span className="terminal-footer">
                    ● SYSTEM READY <span>YOUR JOURNEY IS RUNNING</span>
                  </span>
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
                    <span className="tag">PYTHON / {mission.number}</span>
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
                      <b>Одна миссия, один шаг вперёд</b>
                      <p>
                        {s.restDate === today
                          ? "Сегодня отдых"
                          : s.settings.paused
                            ? "Обучение на паузе"
                            : s.heavyDate === today
                              ? `Лёгкий ориентир: ${s.settings.heavy} минут`
                              : day
                                ? `Ориентир: ${day === "work" ? s.settings.work : s.settings.rest} минут`
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
                  <div className="actions">
                    <button
                      onClick={() =>
                        change(
                          (v) => ({ ...v, heavyDate: today, restDate: "" }),
                          "settings",
                        )
                      }
                    >
                      Тяжёлый день
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
                <h2>{chapters[selected - 1].title}</h2>
                <details>
                  <summary>Изменить главу и даты</summary>
                  {(
                    ["title", "month", "criteria", "boss", "duration"] as const
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
                <p className="cyan">Босс: {chapters[selected - 1].boss}</p>
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
                      {statusLabels[s.progress[m.id]?.status || "not_started"]}
                    </small>
                  </button>
                ))}
              </section>
            </div>
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
                Пропуски не переносятся в долг. Рабочий цикл рассчитывается
                только после указания первой смены.
              </p>
              <div className="calendar">
                {Array.from({ length: 28 }, (_, i) => {
                  const d = new Date(today + "T12:00:00Z");
                  d.setUTCDate(d.getUTCDate() + i + calendarOffset);
                  const date = d.toISOString().slice(0, 10);
                  const kind = dayType(date, s.settings.anchor);
                  const planned =
                    s.plans?.[date] ??
                    (kind === "work"
                      ? s.settings.work
                      : kind === "rest"
                        ? s.settings.rest
                        : 0);
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
                <h3>Достижения</h3>
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
                    value={s.settings.anchor}
                    onChange={(e) => settings("anchor", e.target.value)}
                  />
                </label>
                <label>
                  Часовой пояс IANA
                  <input
                    placeholder="Например, Europe/Moscow"
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
                <p className="muted">
                  {supabase
                    ? "Supabase настроен"
                    : "Данные хранятся на этом устройстве. Для облака нужны параметры Supabase."}
                </p>
                {user ? (
                  <>
                    <p>{user}</p>
                    <button onClick={() => supabase?.auth.signOut()}>
                      Выйти
                    </button>
                  </>
                ) : (
                  <>
                    <label>
                      Email
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </label>
                    <label>
                      Пароль
                      <input
                        type="password"
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </label>
                    <div className="actions">
                      <button onClick={() => auth("login")}>Войти</button>
                      <button onClick={() => auth("signup")}>
                        Создать аккаунт
                      </button>
                    </div>
                  </>
                )}
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
                <p className="muted">
                  Уведомления выключены до привязки и отдельного согласия.
                </p>
                <button
                  onClick={async () => {
                    if (!supabase || !user) {
                      setMessage("Сначала подключите Supabase и войдите");
                      return;
                    }
                    const { data, error } =
                      await supabase.functions.invoke("link-telegram");
                    setMessage(
                      error?.message ||
                        `Откройте бота и отправьте /start ${data.token} (действует 10 минут)`,
                    );
                  }}
                >
                  Получить одноразовый код
                </button>
                <h3>Уведомления</h3>
                <label>
                  <input
                    type="checkbox"
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
    <App />
  </React.StrictMode>,
);
