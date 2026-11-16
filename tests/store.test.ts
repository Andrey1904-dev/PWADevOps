import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "public-test-key");
  return { rpc: vi.fn(), single: vi.fn(), getUser: vi.fn() };
});
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: () => ({ select: () => ({ eq: () => ({ single: mocks.single }) }) }),
  }),
}));
import {
  initial,
  persist,
  readState,
  sync,
  acknowledge,
  type State,
} from "../src/store";
import { validateImport } from "../src/validation";
beforeEach(() => {
  vi.clearAllMocks();
  const local = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => local.get(k) || null,
    setItem: (k: string, v: string) => local.set(k, v),
  });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "u" } } });
  mocks.rpc.mockResolvedValue({ data: { version: 1 }, error: null });
  mocks.single.mockResolvedValue({
    data: { state: initial, version: 1 },
    error: null,
  });
});
describe("outbox and local user boundaries", () => {
  it("separates local state by authenticated user", () => {
    persist({ ...initial, current: "1-2" }, "alice");
    persist({ ...initial, current: "1-3" }, "bob");
    expect(readState("alice").current).toBe("1-2");
    expect(readState("bob").current).toBe("1-3");
    expect(readState().current).toBe("1-18");
  });
  it("sends stable ids and clears only acknowledged queue", async () => {
    const s: State = {
      ...initial,
      queue: [
        {
          id: "op-1",
          kind: "session",
          payload: { state: initial },
          baseVersion: 0,
        },
      ],
    };
    const next = await sync(s);
    expect(next.queue).toEqual([]);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "apply_operation",
      expect.objectContaining({ operation_id: "op-1", expected_version: 0 }),
    );
    expect(s.queue).toHaveLength(1);
  });
  it("database errors leave original queue available for retry", async () => {
    mocks.rpc.mockResolvedValueOnce({ error: Error("offline") });
    const s: State = {
      ...initial,
      queue: [{ id: "op-1", kind: "session", payload: {}, baseVersion: 0 }],
    };
    await expect(sync(s)).rejects.toThrow("offline");
    expect(s.queue[0].id).toBe("op-1");
  });
  it("conflicts require explicit resolution", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { conflict: true, version: 10 } });
    await expect(
      sync({
        ...initial,
        queue: [{ id: "op-1", kind: "settings", payload: {}, baseVersion: 0 }],
      }),
    ).rejects.toThrow("Конфликт");
  });
  it("rejects synchronization without a user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    await expect(sync(initial)).rejects.toThrow("Войдите");
  });
  it("validates backups and does not replay foreign operations", () => {
    expect(
      validateImport({ ...initial, queue: [{ id: "foreign" }] }).queue,
    ).toEqual([]);
    expect(() => validateImport({ ...initial, current: "evil" })).toThrow();
    expect(() =>
      validateImport({
        ...initial,
        sessions: [{ id: "invalid", seconds: -1 }],
      }),
    ).toThrow();
  });
});

it("keeps edits made while an operation is in flight", () => {
  const sent = {
    id: "sent",
    kind: "progress" as const,
    payload: {},
    baseVersion: 0,
  };
  const pending = { ...sent, id: "new" };
  const snapshot = { ...initial, queue: [sent] };
  const current = {
    ...initial,
    current: "2-1",
    active: 123,
    timerSeconds: 40,
    restDate: "2026-11-15",
    overrides: { "chapter-2": { title: "Custom" } },
    plans: { "2026-11-16": 20 },
    queue: [sent, pending],
  };
  const result = acknowledge(snapshot, current, { ...initial, version: 2 });
  expect(result).toEqual({ ...current, version: 2, queue: [pending] });
});
it("skips intermediate invalid timezone drafts but sends final valid snapshot", async () => {
  const invalid = {
    ...initial,
    settings: { ...initial.settings, timezone: "Europ" },
  };
  const valid = {
    ...initial,
    settings: { ...initial.settings, timezone: "Europe/Moscow" },
    queue: [
      {
        id: "draft",
        kind: "settings" as const,
        payload: { state: invalid },
        baseVersion: 0,
      },
      {
        id: "final",
        kind: "settings" as const,
        payload: {
          state: {
            ...initial,
            settings: { ...initial.settings, timezone: "Europe/Moscow" },
          },
        },
        baseVersion: 0,
      },
    ],
  };
  await sync(valid);
  expect(mocks.rpc).not.toHaveBeenCalledWith(
    "apply_operation",
    expect.objectContaining({ operation_id: "draft" }),
  );
  expect(mocks.rpc).toHaveBeenCalledWith(
    "apply_operation",
    expect.objectContaining({ operation_id: "final" }),
  );
});

it("defaults new users to Yekaterinburg while preserving existing choices and dates", () => {
  expect(readState("new-user").settings.timezone).toBe("Asia/Yekaterinburg");
  for (const timezone of ["Europe/Moscow", "", "Asia/Yekaterinburg"]) {
    const saved = {
      ...initial,
      settings: { ...initial.settings, timezone },
      sessions: [{ id: "session", seconds: 60, date: "2026-11-15", note: "" }],
    };
    persist(saved, "existing");
    expect(readState("existing").settings.timezone).toBe(timezone);
    expect(readState("existing").sessions).toEqual(saved.sessions);
  }
});
it("keeps a legacy cloud profile without timezone unset", async () => {
  mocks.single.mockResolvedValue({
    data: { state: {}, version: 0 },
    error: null,
  });
  expect((await sync(initial)).settings.timezone).toBe("");
});
