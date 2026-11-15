import type { State } from "./store";
export type Reward = { event_key: string; xp: number; created_at?: string };
export function gameStats(s: State, today: string) {
  const earned = new Map(
    (s.rewardEvents || []).map((x) => [x.event_key, x.xp]),
  );
  for (const [id, p] of Object.entries(s.progress)) {
    if (
      ["solved", "verified"].includes(p.status) &&
      !earned.has(id + ":solved")
    )
      earned.set(id + ":solved", 50);
    if (p.status === "verified") {
      if (!earned.has(id + ":verified")) earned.set(id + ":verified", 50);
      if (id.endsWith("-20") && !earned.has(id + ":boss"))
        earned.set(id + ":boss", 200);
    }
  }
  const xp = [...earned.values()].reduce((n, x) => n + x, 0);
  const dates = new Set(
    s.sessions.filter((x) => x.seconds > 0).map((x) => x.date),
  );
  const d = new Date(today + "T12:00:00Z");
  if (!dates.has(today)) d.setUTCDate(d.getUTCDate() - 1);
  let streak = 0;
  while (dates.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  const weekStart = Date.parse(today + "T00:00:00Z") - 6 * 86400000;
  const weekMinutes = Math.round(
    s.sessions
      .filter(
        (x) =>
          Date.parse(x.date + "T00:00:00Z") >= weekStart && x.date <= today,
      )
      .reduce((n, x) => n + x.seconds, 0) / 60,
  );
  return {
    xp,
    level: Math.floor(xp / 500) + 1,
    next: 500 - (xp % 500),
    levelProgress: (xp % 500) / 5,
    streak,
    weekMinutes,
  };
}
