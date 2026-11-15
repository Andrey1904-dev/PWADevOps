import { it, expect } from "vitest";
import { initial } from "../src/store";
import {
  shift,
  adaptivePlan,
  recommendedMinutes,
  nextShifts,
} from "../src/adaptive";
import { gameStats } from "../src/game";
it("personal confirmed 17/18 work 19/20 rest repeats for future months", () => {
  expect(
    ["17", "18", "19", "20", "21", "22"].map((d) =>
      shift(initial, "2026-11-" + d),
    ),
  ).toEqual(["work", "work", "rest", "rest", "work", "work"]);
  expect(shift(initial, "2027-11-17")).toBe("work");
  expect(nextShifts(initial, "2026-11-17")).toEqual({
    work: "2026-11-17",
    rest: "2026-11-19",
  });
});
it("work theory and rest laboratories use personal norms", () => {
  const work = adaptivePlan(initial, "2026-11-17", 1)[0];
  expect(work.activity).toBe("theory");
  expect(work.minutes).toBe(35);
  expect(work.missionId).toBe("1-18");
  expect(adaptivePlan(initial, "2026-11-19", 1)[0].activity).toBe("lab");
  expect(recommendedMinutes(initial, "2026-11-19")).toBe(150);
});
it("boss is held for rest unless user explicitly chooses a workday", () => {
  const s = { ...initial, current: "1-20" };
  const plan = adaptivePlan(s, "2026-11-17", 3);
  expect(plan.map((p) => p.activity)).toEqual(["review", "review", "boss"]);
  expect(
    adaptivePlan(
      { ...s, bossWorkdayConsent: { "2026-11-17": true } },
      "2026-11-17",
      1,
    )[0].activity,
  ).toBe("boss");
});
it("low energy, more time, manual shifts and actual sessions adapt without penalty", () => {
  expect(
    recommendedMinutes(
      { ...initial, energy: { "2026-11-17": "low" } },
      "2026-11-17",
    ),
  ).toBe(12);
  expect(
    recommendedMinutes(
      { ...initial, energy: { "2026-11-17": "more" } },
      "2026-11-17",
    ),
  ).toBe(44);
  expect(
    shift(
      {
        ...initial,
        settings: {
          ...initial.settings,
          shiftOverrides: { "2026-11-17": "rest" },
        },
      },
      "2026-11-17",
    ),
  ).toBe("rest");
  const sessions = ["2026-11-09", "2026-11-10", "2026-11-13"].map(
    (date, i) => ({ id: String(i), date, seconds: 600, note: "" }),
  );
  expect(recommendedMinutes({ ...initial, sessions }, "2026-11-17")).toBe(28);
});
it("unfinished tasks carry forward and moves never remove XP", () => {
  const s = {
    ...initial,
    deferred: { "1-18": "2026-11-18" },
    scheduledMissions: { "2026-11-16": "1-18", "2026-11-18": "1-18" },
    rewardEvents: [{ event_key: "1-17:solved", xp: 50 }],
  };
  expect(adaptivePlan(s, "2026-11-17", 2).map((p) => p.activity)).toEqual([
    "review",
    "theory",
  ]);
  expect(adaptivePlan(s, "2026-11-18", 1)[0].missionId).toBe("1-18");
  expect(gameStats(s, "2026-11-17").xp).toBe(50);
  expect(s.current).toBe("1-18");
});
