import { useState } from "react";
import { missions, boss, plans, sharedSkills, type Mission } from "./catalog";
import {
  assess,
  confirmed,
  fresh,
  key,
  markdown,
  readCareer,
  saveCareer,
  validate,
  type Attempt,
  type CareerState,
} from "./progress";
import "./career.css";
export function Career({
  user,
  shared = false,
}: {
  user: string;
  shared?: boolean;
}) {
  const [state, setState] = useState<CareerState>(() => {
    try {
      return readCareer(localStorage, user);
    } catch {
      return fresh();
    }
  });
  const [notice, setNotice] = useState("");
  const [selected, select] = useState(shared ? "ready" : "map");
  const [reviewer, setReviewer] = useState("");
  const [notes, setNotes] = useState("");
  const update = (next: CareerState) => {
    try {
      const previous = localStorage.getItem(key(user));
      if (previous) {
        try {
          validate(JSON.parse(previous));
        } catch {
          localStorage.setItem(
            key(user) + ":unreadable:" + Date.now(),
            previous,
          );
        }
      }
      saveCareer(localStorage, user, next);
      setState(next);
      setNotice("Сохранено на этом устройстве.");
    } catch {
      setNotice("Ошибка сохранения. Экспортируйте данные перед закрытием.");
    }
  };
  const download = (text: string, name: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const all = [...missions, boss];
  const current = all.find((m) => m.id === selected);
  const passed = (id: string) =>
    state.attempts.some(
      (a) => a.mission === id && a.result === "passed" && !a.revealed,
    );
  const draft = current
    ? state.drafts[current.id] || {
        answers: [],
        journal: "",
        hints: 0,
        tried: false,
        revealed: false,
      }
    : null;
  const patch = (values: Partial<NonNullable<typeof draft>>) => {
    if (current && draft)
      update({
        ...state,
        drafts: { ...state.drafts, [current.id]: { ...draft, ...values } },
      });
  };
  const submit = (m: Mission) => {
    if (!draft) return;
    const a = assess(
      m,
      draft.answers,
      draft.journal,
      draft.hints,
      draft.revealed,
    );
    update({
      ...state,
      attempts: [...state.attempts, a],
      drafts: { ...state.drafts, [m.id]: { ...draft, tried: true } },
    });
  };
  const manual = (a: Attempt, accepted: boolean) => {
    if (!reviewer.trim() || !notes.trim()) {
      setNotice(
        "Нужны имя проверяющего и воспроизводимое обоснование. Самопроверка не подтверждает компетенцию.",
      );
      return;
    }
    update({
      ...state,
      attempts: state.attempts.map((x) =>
        x.id === a.id
          ? {
              ...x,
              result: accepted ? "passed" : "retry",
              review: {
                reviewer,
                notes,
                accepted,
                date: new Date().toISOString(),
              },
            }
          : x,
      ),
    });
  };
  return (
    <section className="career" aria-label="System Administrator Quest">
      <h1>System Administrator Quest</h1>
      <p>
        Цель: Junior System Administrator / IT Support → Middle DevOps. Учебный
        трек ориентирован на Artsofte и другие компании.
      </p>
      <p className="notice">
        Прогресс этого трека хранится отдельно по аккаунту только в этом
        браузере. Облачная синхронизация относится к старому DevOps RPG. Делайте
        резервные копии.
      </p>
      <nav aria-label="Разделы карьерного трека">
        {[
          ["map", "Карта глав"],
          ["net-lab", "Реальная лаборатория"],
          ["ready", "JOB READY"],
          ["interview", "Собеседование"],
        ].map(([id, title]) => (
          <button key={id} onClick={() => select(id)}>
            {title}
          </button>
        ))}
      </nav>
      <div role="status">{notice}</div>
      {selected === "map" && (
        <>
          <h2>Глава 1. Network Fundamentals</h2>
          <progress max={7} value={all.filter((m) => passed(m.id)).length} />
          <p>
            {all.filter((m) => passed(m.id)).length}/7 симуляций пройдено. Это
            не подтверждение реальной практики.
          </p>
          <p>
            Рабочий день: 15–30 минут теории/повторения. Выходной: 1,5–3 часа
            лаборатории. Ориентир 8–12 часов в неделю, без штрафов за перенос.
          </p>
          <div className="career-grid">
            {all.map((m) => (
              <article key={m.id}>
                <h3>{m.title}</h3>
                <p>
                  {m.id === boss.id
                    ? "Комплексная симуляция + ручная оценка объяснения"
                    : "Теория + симуляция"}{" "}
                  · {passed(m.id) ? "пройдено" : "требуется работа"}
                </p>
                <button
                  disabled={
                    m.id === boss.id && !missions.every((x) => passed(x.id))
                  }
                  onClick={() => select(m.id)}
                >
                  Открыть миссию
                </button>
                <label>
                  Перенести на{" "}
                  <input
                    type="date"
                    value={state.deferred[m.id] || ""}
                    onChange={(e) =>
                      update({
                        ...state,
                        deferred: { ...state.deferred, [m.id]: e.target.value },
                      })
                    }
                  />
                </label>
              </article>
            ))}
          </div>
          <h2>План следующих итераций — задания пока недоступны</h2>
          {plans.map(([title, theory, practice, platform]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{theory}</p>
              <p>{practice}</p>
              <p>{platform}</p>
              <strong>Не начато. Реализация по отдельному заданию.</strong>
            </article>
          ))}
        </>
      )}
      {current && draft && (
        <article>
          <h2>{current.title}</h2>
          <p>
            <strong>Цель:</strong> диагностировать проблему и объяснить
            следующий безопасный шаг.
          </p>
          <h3>Короткая теория</h3>
          <p>{current.theory}</p>
          <p>
            <strong>Термины:</strong> {current.terms}
          </p>
          <p>
            <strong>На работе:</strong> {current.example}
          </p>
          <h3>Симуляция — команды здесь не выполняются</h3>
          <p>{current.task}</p>
          {current.questions.map((q, i) => (
            <label key={q}>
              {q}
              <input
                value={draft.answers[i] || ""}
                onChange={(e) => {
                  const answers = [...draft.answers];
                  answers[i] = e.target.value;
                  patch({ answers });
                }}
              />
            </label>
          ))}
          <label>
            Журнал: наблюдения, причина, команды, ожидаемый и фактический
            результат, риски, контроль после исправления
            <textarea
              value={draft.journal}
              onChange={(e) => patch({ journal: e.target.value })}
            />
          </label>
          <button
            onClick={() => submit(current)}
            disabled={
              draft.answers.filter((x) => x.trim()).length <
                current.questions.length ||
              (current.id === boss.id && draft.journal.trim().length < 80)
            }
          >
            Проверить попытку
          </button>
          <button
            disabled={draft.hints >= 3}
            onClick={() => patch({ hints: draft.hints + 1 })}
          >
            Подсказка {Math.min(3, draft.hints + 1)}
          </button>
          {current.hints.slice(0, draft.hints).map((h, i) => (
            <p key={h}>
              Уровень {i + 1}: {h}
            </p>
          ))}
          {draft.tried && (
            <button onClick={() => patch({ revealed: true })}>
              Показать разбор (не подтверждает навык)
            </button>
          )}
          {draft.revealed && <p>{current.solution}</p>}
          <button
            onClick={() =>
              patch({
                answers: [],
                journal: "",
                hints: 0,
                tried: false,
                revealed: false,
              })
            }
          >
            Новая попытка
          </button>
          <p>{current.review}</p>
          {state.attempts
            .filter((a) => a.mission === current.id)
            .map((a) => (
              <article key={a.id}>
                <strong>
                  {a.date}: {a.result}
                </strong>
                <p>
                  Ошибки в вопросах:{" "}
                  {a.errors.map((i) => i + 1).join(", ") || "нет"}. Подсказки:{" "}
                  {a.hints}.{" "}
                  {a.revealed
                    ? "После просмотра решения — требуется повторение."
                    : ""}
                </p>
                <p>
                  {a.result === "pending-review"
                    ? "Короткие ответы верны. Причины, последовательность, безопасность и контроль требуют ручной оценки; босс ещё не зачтён."
                    : ""}
                </p>
                {a.result === "pending-review" && (
                  <>
                    <p>
                      Проверяющий оценивает все три причины, порядок безопасных
                      тестов, контроль восстановления и риски. Не принимать
                      пересказ симптомов. Самопроверка не считается независимой
                      оценкой.
                    </p>
                    <input
                      aria-label="Проверяющий"
                      placeholder="Имя наставника"
                      value={reviewer}
                      onChange={(e) => setReviewer(e.target.value)}
                    />
                    <textarea
                      aria-label="Обоснование оценки"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                    <button onClick={() => manual(a, true)}>
                      Записать ручной зачёт
                    </button>
                    <button onClick={() => manual(a, false)}>
                      На повторение
                    </button>
                  </>
                )}
              </article>
            ))}
        </article>
      )}
      {selected === "net-lab" && (
        <article>
          <h2>Реальная лаборатория: сеть Ubuntu ARM64</h2>
          <p>
            Среда: бесплатная UTM и Ubuntu Server ARM64 с официальных сайтов.
            Создайте VM с NAT/shared networking, без проброса портов. Не меняйте
            безопасность macOS. Все команды ниже выполняются внутри VM;
            неисправности на основной ОС не создавайте.
          </p>
          <ol>
            <li>
              Установите Ubuntu ARM64 в UTM. Если VM недоступна, используйте
              выданную наставником изолированную Linux-машину; симуляция не
              заменяет эту лабораторию.
            </li>
            <li>
              Внутри VM выполните <code>ip -4 addr; ip route</code>. Запишите
              IPv4, CIDR, default gateway; объясните различие интерфейса
              loopback и сетевого.
            </li>
            <li>
              Проверьте шлюз: <code>ping -c 3 АДРЕС_ШЛЮЗА</code>. Отсутствие
              ответа запишите как наблюдение, не как доказательство отказа.
            </li>
            <li>
              <code>resolvectl status</code>,{" "}
              <code>resolvectl query example.com</code>; если доступен dig:{" "}
              <code>dig example.com</code>. Сравните с запросом несуществующего
              имени <code>missing.invalid</code>.
            </li>
            <li>
              <code>ss -lnt</code>;{" "}
              <code>curl -I --connect-timeout 10 https://example.com</code>.
              Объясните, почему это отдельный тест от ping. Если curl
              отсутствует, согласуйте установку из официального репозитория
              Ubuntu или используйте готовый стенд.
            </li>
            <li>
              Зафиксируйте дату, версии ОС, выводы до/после, объяснение
              результатов. Скройте публичный IP, имена и секреты. Не сканируйте
              чужие сети.
            </li>
            <li>
              Наставник повторяет команды на стенде, сверяет
              адрес/маску/маршрут, DNS и HTTP, задаёт вопросы о DHCP/APIPA, VPN
              и портах. Результат фиксируется вручную.
            </li>
          </ol>
          <p>
            Windows-аналоги: ipconfig /all, route print, tracert, nslookup,
            Test-NetConnection. macOS: ifconfig, route -n get default,
            traceroute, dig, curl. Не выполняйте сброс сети и изменение
            маршрутов на Mac.
          </p>
          <label>
            Журнал лаборатории
            <textarea
              id="lab-journal"
              value={state.drafts["net-lab"]?.journal || ""}
              onChange={(e) =>
                update({
                  ...state,
                  drafts: {
                    ...state.drafts,
                    "net-lab": {
                      answers: [],
                      journal: e.target.value,
                      hints: 0,
                      tried: false,
                      revealed: false,
                    },
                  },
                })
              }
              placeholder="Среда, дата, команды, выводы, объяснение и процедура повторной проверки"
            />
          </label>
          <button
            onClick={() => {
              const journal = state.drafts["net-lab"]?.journal || "";
              if (journal.trim().length < 100) {
                setNotice(
                  "Добавьте воспроизводимый журнал, не менее 100 символов. Это не автоматическая проверка выполнения.",
                );
                return;
              }
              update({
                ...state,
                attempts: [
                  ...state.attempts,
                  {
                    id: crypto.randomUUID(),
                    mission: "net-lab",
                    date: new Date().toISOString(),
                    answers: [],
                    errors: [],
                    hints: 0,
                    journal,
                    revealed: false,
                    result: "pending-review",
                  },
                ],
              });
            }}
          >
            Отправить на ручную проверку
          </button>
          <label>
            Наставник
            <input
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
            />
          </label>
          <label>
            Результаты воспроизведения и контрольные вопросы
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          {state.attempts
            .filter((a) => a.mission === "net-lab")
            .map((a) => (
              <article key={a.id}>
                <p>
                  {a.date} · {a.result}
                </p>
                <pre>{a.journal}</pre>
                {a.result === "pending-review" && (
                  <>
                    <button onClick={() => manual(a, true)}>
                      Записать ручное подтверждение
                    </button>
                    <button onClick={() => manual(a, false)}>
                      Вернуть на доработку
                    </button>
                  </>
                )}
              </article>
            ))}
        </article>
      )}
      {selected === "ready" && (
        <article>
          <h2>JOB READY: SYSTEM ADMINISTRATOR</h2>
          <p>
            Готовность не вычисляется по просмотрам уроков. Нет подтверждённого
            коммерческого опыта.
          </p>
          <h3>Карта общих навыков</h3>
          {sharedSkills.map((skill) => (
            <p key={skill}>
              {skill}:{" "}
              {[
                "network.ip",
                "network.dns",
                "network.routing",
                "network.transport",
              ].includes(skill) && confirmed(state).length
                ? "ручная проверка лаборатории записана"
                : "реальная практика не подтверждена"}{" "}
              · симуляция:{" "}
              {all.some((m) => m.skill === skill && passed(m.id))
                ? "пройдена"
                : "нет"}
            </p>
          ))}
          <p>
            Свидетельства связываются через стабильные ID навыков. Миссии DevOps
            RPG автоматически не засчитываются. Существующие отметки старого
            трека не являются независимой проверкой.
          </p>
          <h3>Перед откликом</h3>
          <ul>
            <li>
              Резюме: образование, GitHub, учебные стенды и проверяемые
              результаты, без вымышленного опыта.
            </li>
            <li>
              Рассказ о себе: исходная проблема → ваши действия → результат →
              ограничения.
            </li>
            <li>Повторите ошибки из истории попыток и пройдите интервью.</li>
            <li>
              Не проверены: поддержка Windows, AD, Linux-администрирование,
              Service Desk, безопасность и автоматизация до следующих итераций.
            </li>
          </ul>
          <h3>История и отчёты</h3>
          {state.attempts.map((a) => (
            <p key={a.id}>
              {a.mission}: {a.result}; ошибки:{" "}
              {a.errors.map((i) => i + 1).join(", ") ||
                "нет в проверенных полях"}
              ; подсказки {a.hints};{" "}
              {a.review
                ? `проверяющий: ${a.review.reviewer}`
                : "ручная оценка отсутствует"}
            </p>
          ))}
          <button
            onClick={() =>
              download(markdown(state), "sysadmin-results.md", "text/markdown")
            }
          >
            Экспорт Markdown
          </button>
          <button
            onClick={() =>
              download(
                JSON.stringify(state, null, 2),
                "sysadmin-backup.json",
                "application/json",
              )
            }
          >
            Резервная копия JSON
          </button>
          <label>
            Восстановить копию JSON
            <input
              type="file"
              accept="application/json"
              onChange={async (e) => {
                try {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const incoming = validate(JSON.parse(await file.text()));
                  localStorage.setItem(
                    key(user) + ":before-restore",
                    JSON.stringify(state),
                  );
                  update(incoming);
                } catch {
                  setNotice("Копия не принята. Текущий прогресс сохранён.");
                }
              }}
            />
          </label>
          <button
            onClick={() => {
              try {
                const raw = localStorage.getItem(key(user) + ":before-restore");
                if (raw) update(validate(JSON.parse(raw)));
                else setNotice("Копии до восстановления нет.");
              } catch {
                setNotice("Не удалось восстановить.");
              }
            }}
          >
            Вернуть состояние до импорта
          </button>
        </article>
      )}
      {selected === "interview" && (
        <article>
          <h2>ARTSOFTE INTERVIEW SIMULATOR</h2>
          <p>
            Это авторские учебные вопросы, не настоящие вопросы интервьюеров
            Artsofte. Базовая подготовка первой итерации; полная оценка требует
            наставника.
          </p>
          {[
            "Junior: ПК получил 169.254.12.3. Как будете диагностировать?",
            "Junior+: VPN подключён, сайт по имени недоступен. Как разделить DNS, маршрут и порт?",
            "Junior/Middle SysAdmin: десять пользователей потеряли доступ после изменения VLAN. Как ограничить влияние, проверить гипотезу и эскалировать?",
          ].map((q) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>
                Ответьте вслух: факты → гипотезы → тесты → безопасное действие →
                контроль. Оценка наставником по пяти критериям: техническая
                правильность, логика, самостоятельность, объяснение, риски.
                Каждый 0–2: 0 — нет/ошибка, 1 — частично с помощью, 2 — верно с
                обоснованием. Угаданный термин без объяснения — 0 за логику и
                самостоятельность.
              </p>
            </details>
          ))}
          <p>
            Windows, Linux, диагностика ПК, поддержка пользователей,
            безопасность и инциденты — в плане следующих итераций; готовность по
            этим темам не заявляется.
          </p>
        </article>
      )}
    </section>
  );
}
