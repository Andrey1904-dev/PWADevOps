import { it, expect } from "vitest";
import { gameStats } from "../src/game";
import { initial } from "../src/store";
it("awards only solved/verified work and never duplicates server rewards", () => {
  const progress = {
    "1-18": {
      status: "solved" as const,
      note: "",
      error: "",
      github: "",
      review: "",
    },
  };
  expect(gameStats(initial, "2026-11-15").xp).toBe(0);
  expect(gameStats({ ...initial, progress }, "2026-11-15").xp).toBe(50);
  expect(
    gameStats(
      {
        ...initial,
        progress,
        rewardEvents: [{ event_key: "1-18:solved", xp: 50 }],
      },
      "2026-11-15",
    ).xp,
  ).toBe(50);
  expect(
    gameStats(
      {
        ...initial,
        progress: { "1-20": { ...progress["1-18"], status: "verified" } },
      },
      "2026-11-15",
    ).xp,
  ).toBe(300);
});
it("streak counts positive sessions and allows continuing yesterday", () => {
  const sessions = ["2026-11-13", "2026-11-14"].map((date, i) => ({
    id: String(i),
    date,
    seconds: 600,
    note: "",
  }));
  const stats = gameStats({ ...initial, sessions }, "2026-11-15");
  expect(stats.streak).toBe(2);
  expect(stats.weekMinutes).toBe(20);
  expect(gameStats({ ...initial, sessions }, "2026-11-16").streak).toBe(0);
});
