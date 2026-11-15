import { chapters } from "./catalog";
import { dayType } from "./domain";
import type { State } from "./store";
export const confirmedAnchor = "2026-11-17";
export function addDays(date: string, count: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}
export function shift(s: State, date: string) {
  return (
    s.settings.shiftOverrides?.[date] ||
    dayType(date, s.settings.anchor || confirmedAnchor)
  );
}
export function recommendedMinutes(s: State, date: string) {
  const kind = shift(s, date);
  const base = kind === "work" ? s.settings.work : s.settings.rest;
  const mode = s.energy?.[date];
  if (mode === "low" || s.heavyDate === date)
    return Math.max(10, Math.min(15, s.settings.heavy));
  if (s.plans?.[date] !== undefined) return s.plans[date];
  let factor = 1;
  const recent = s.sessions
    .filter(
      (x) =>
        x.date < date &&
        x.date >= addDays(date, -14) &&
        x.seconds > 0 &&
        shift(s, x.date) === kind,
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  if (recent.length >= 3) {
    const average =
      recent.reduce((n, x) => n + x.seconds / 60, 0) / recent.length;
    if (average < base * 0.65) factor = 0.8;
    else if (average > base * 1.15) factor = 1.1;
  }
  if (mode === "more") factor *= 1.25;
  return Math.round(
    Math.max(
      kind === "work" ? 20 : 60,
      Math.min(kind === "work" ? 60 : 210, base * factor),
    ),
  );
}
export function adaptivePlan(s: State, today: string, length = 90) {
  const all = chapters.flatMap((c) => c.missions);
  const current = Math.max(
    0,
    all.findIndex((m) => m.id === s.current),
  );
  const carry = Object.entries(s.scheduledMissions || {})
    .filter(
      ([date, id]) =>
        date < today &&
        !["solved", "verified"].includes(s.progress[id]?.status),
    )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, id]) => id);
  const ids = [...new Set([...carry, ...all.slice(current).map((m) => m.id)])];
  const pending = ids
    .map((id) => all.find((m) => m.id === id))
    .filter(
      (m): m is (typeof all)[number] =>
        !!m && !["solved", "verified"].includes(s.progress[m.id]?.status),
    );
  let index = 0;
  return Array.from({ length }, (_, offset) => {
    const date = addDays(today, offset);
    const manual = s.scheduledMissions?.[date];
    const deferred = s.deferred?.[pending[index]?.id];
    const candidate = manual
      ? all.find((m) => m.id === manual)
      : pending[index];
    const m = candidate || all[current];
    const kind = shift(s, date);
    const low = s.energy?.[date] === "low" || s.heavyDate === date;
    const resting = s.restDate === date || s.plans?.[date] === 0;
    const moved = deferred && date < deferred;
    const boss = m.number === 20;
    const blockedBoss =
      boss && kind === "work" && !s.bossWorkdayConsent?.[date];
    const activity = resting
      ? "rest"
      : moved || blockedBoss
        ? "review"
        : low
          ? "short"
          : boss
            ? "boss"
            : kind === "work"
              ? "theory"
              : "lab";
    if (!manual && !resting && !moved && !blockedBoss && !low) index++;
    return {
      date,
      missionId: m.id,
      title: m.title,
      type: kind,
      minutes: resting ? 0 : recommendedMinutes(s, date),
      activity,
      carried:
        offset === 0 &&
        Object.entries(s.scheduledMissions || {}).some(
          ([d, id]) =>
            d < today &&
            id === m.id &&
            !["solved", "verified"].includes(s.progress[id]?.status),
        ),
    };
  });
}
export function nextShifts(s: State, today: string) {
  const dates = Array.from({ length: 32 }, (_, i) => addDays(today, i));
  return {
    work: dates.find((d) => shift(s, d) === "work"),
    rest: dates.find((d) => shift(s, d) === "rest"),
  };
}
