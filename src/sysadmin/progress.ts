import { boss, missions, type Mission } from "./catalog";
export type Attempt = {
  id: string;
  mission: string;
  date: string;
  answers: string[];
  errors: number[];
  hints: number;
  journal: string;
  revealed: boolean;
  result: "passed" | "retry" | "pending-review";
  review?: { reviewer: string; notes: string; accepted: boolean; date: string };
};
export type CareerState = {
  schema: 1;
  attempts: Attempt[];
  drafts: Record<
    string,
    {
      answers: string[];
      journal: string;
      hints: number;
      tried: boolean;
      revealed: boolean;
    }
  >;
  deferred: Record<string, string>;
};
export const fresh = (): CareerState => ({
  schema: 1,
  attempts: [],
  drafts: {},
  deferred: {},
});
export const key = (user: string) => "artsofte-quest-v1:" + user;
export function validate(value: unknown): CareerState {
  const s = value as CareerState;
  const ids = new Set([...missions, boss].map((m) => m.id).concat("net-lab"));
  if (
    !s ||
    s.schema !== 1 ||
    !Array.isArray(s.attempts) ||
    !s.drafts ||
    !s.deferred
  )
    throw Error("Неверный формат резервной копии");
  const stringArray = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((x) => typeof x === "string");
  for (const a of s.attempts) {
    if (
      !a ||
      !ids.has(a.mission) ||
      typeof a.id !== "string" ||
      typeof a.date !== "string" ||
      !Array.isArray(a.errors) ||
      !a.errors.every((i) => Number.isInteger(i) && i >= 0 && i < 3) ||
      !stringArray(a.answers) ||
      typeof a.journal !== "string" ||
      typeof a.revealed !== "boolean" ||
      !Number.isInteger(a.hints) ||
      a.hints < 0 ||
      a.hints > 3 ||
      !["passed", "retry", "pending-review"].includes(a.result)
    )
      throw Error("Неверная попытка");
    if (
      a.review &&
      (typeof a.review.reviewer !== "string" ||
        typeof a.review.notes !== "string" ||
        typeof a.review.accepted !== "boolean" ||
        typeof a.review.date !== "string")
    )
      throw Error("Неверная ручная оценка");
  }
  for (const [id, d] of Object.entries(s.drafts))
    if (
      !ids.has(id) ||
      !d ||
      !stringArray(d.answers) ||
      typeof d.journal !== "string" ||
      !Number.isInteger(d.hints) ||
      d.hints < 0 ||
      d.hints > 3 ||
      typeof d.tried !== "boolean" ||
      typeof d.revealed !== "boolean"
    )
      throw Error("Неверный черновик");
  for (const [id, date] of Object.entries(s.deferred))
    if (
      !ids.has(id) ||
      typeof date !== "string" ||
      (date !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(date))
    )
      throw Error("Неверная дата");
  return s;
}
export function readCareer(storage: Storage, user: string) {
  const raw = storage.getItem(key(user));
  return raw ? validate(JSON.parse(raw)) : fresh();
}
export function saveCareer(storage: Storage, user: string, state: CareerState) {
  storage.setItem(key(user), JSON.stringify(state));
}
const normalize = (s: string) =>
  s.trim().toLocaleLowerCase().replace(/\.$/, "");
export function check(m: Mission, answers: string[]) {
  return m.answers.flatMap((expected, i) =>
    expected
      .split("|")
      .some((a) => normalize(a) === normalize(answers[i] || ""))
      ? []
      : [i],
  );
}
export function assess(
  m: Mission,
  answers: string[],
  journal: string,
  hints: number,
  revealed: boolean,
): Attempt {
  const errors = check(m, answers);
  return {
    id: crypto.randomUUID(),
    mission: m.id,
    date: new Date().toISOString(),
    answers,
    errors,
    hints,
    journal,
    revealed,
    result:
      errors.length || revealed
        ? "retry"
        : m.id === boss.id
          ? "pending-review"
          : "passed",
  };
}
export function confirmed(s: CareerState) {
  return s.attempts.filter(
    (a) =>
      a.mission === "net-lab" &&
      a.review?.accepted &&
      a.review.reviewer.trim() &&
      a.review.notes.trim(),
  );
}
export function markdown(s: CareerState) {
  return (
    "# JOB READY: SYSTEM ADMINISTRATOR\n\nУчебная практика, не коммерческий опыт. Оценка локальная; ручная проверка не является автоматической.\n\n" +
    s.attempts
      .map(
        (a) =>
          `## ${a.mission} — ${a.date}\nРезультат: ${a.result}; подсказки: ${a.hints}; решение открыто: ${a.revealed}\nОшибки: ${a.errors.map((i) => i + 1).join(", ") || "нет в автоматической проверке"}\nЖурнал:\n${a.journal}\nПроверка: ${a.review ? JSON.stringify(a.review) : "не выполнена"}\n`,
      )
      .join("\n")
  );
}
