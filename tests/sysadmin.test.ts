import { describe, it, expect } from "vitest";
import { missions, boss } from "../src/sysadmin/catalog";
import {
  assess,
  check,
  fresh,
  readCareer,
  saveCareer,
  validate,
  confirmed,
  markdown,
} from "../src/sysadmin/progress";
describe("System Administrator evidence", () => {
  it("checks all required fields and accepts normalized alternatives", () => {
    for (const m of [...missions, boss]) {
      expect(
        check(
          m,
          m.answers.map((a) => a.split("|")[0].toLowerCase()),
        ),
      ).toEqual([]);
      expect(check(m, [])).toHaveLength(m.answers.length);
    }
    expect(check(missions[2], ["dns", "dig"])).toEqual([]);
  });
  it("never passes revealed solutions or an unreviewed boss", () => {
    expect(assess(missions[0], missions[0].answers, "", 0, true).result).toBe(
      "retry",
    );
    expect(assess(boss, boss.answers, "valid journal", 0, false).result).toBe(
      "pending-review",
    );
    expect(assess(missions[0], ["x"], "", 0, false).result).toBe("retry");
  });
  it("isolates users and never touches legacy progress", () => {
    const map = new Map<string, string>([["devops-quest-v1:a", "legacy"]]);
    const storage = {
      getItem: (k: string) => map.get(k) || null,
      setItem: (k: string, v: string) => map.set(k, v),
      length: 0,
      clear: () => map.clear(),
      key: () => null,
      removeItem: (k: string) => {
        map.delete(k);
      },
    } as Storage;
    const s = fresh();
    s.attempts.push(
      assess(missions[0], missions[0].answers, "report", 2, false),
    );
    saveCareer(storage, "a", s);
    expect(readCareer(storage, "a")).toEqual(s);
    expect(readCareer(storage, "b")).toEqual(fresh());
    expect(map.get("devops-quest-v1:a")).toBe("legacy");
    expect(confirmed(s)).toEqual([]);
    expect(markdown(s)).toContain("не коммерческий опыт");
  });
  it("rejects unknown schema and unknown missions", () => {
    expect(() => validate({ schema: 2 })).toThrow();
    expect(() =>
      validate({ ...fresh(), attempts: [{ mission: "unknown" }] }),
    ).toThrow();
  });
});
