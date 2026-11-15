import { handler as webhook } from "../telegram-webhook/index.ts";
import { handler as worker } from "../notification-worker/index.ts";
import { handler as link } from "../link-telegram/index.ts";
Deno.env.set("TELEGRAM_WEBHOOK_SECRET", "test-only-webhook-secret");
Deno.env.set("NOTIFICATION_CRON_SECRET", "test-only-cron-secret");
Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-only");
function assert(value: unknown) {
  if (!value) throw Error("Assertion failed");
}
const request = (body: unknown) =>
  new Request("https://local/webhook", {
    method: "POST",
    headers: { "X-Telegram-Bot-Api-Secret-Token": "test-only-webhook-secret" },
    body: JSON.stringify(body),
  });
Deno.test("webhook rejects missing or incorrect secret", async () => {
  assert((await webhook(new Request("https://local"))).status === 401);
  assert(
    (
      await webhook(
        new Request("https://local", {
          headers: { "X-Telegram-Bot-Api-Secret-Token": "wrong" },
        }),
      )
    ).status === 401,
  );
});
Deno.test("scheduler rejects unauthorized caller", async () =>
  assert((await worker(new Request("https://local"))).status === 401),
);
Deno.test("link preflight succeeds without exposing secrets", async () => {
  const r = await link(new Request("https://local", { method: "OPTIONS" }));
  assert(r.status === 200);
  assert(!(await r.text()).includes("test-only"));
});
Deno.test("webhook validates update id and private sender", async () => {
  assert((await webhook(request({ update_id: "wrong" }))).status === 400);
  assert(
    (
      await webhook(
        request({ update_id: 1, message: { chat: { id: 42, type: "group" } } }),
      )
    ).status === 200,
  );
  assert(
    (
      await webhook(
        request({
          update_id: 1,
          message: { chat: { id: 42, type: "private" }, from: { id: 99 } },
        }),
      )
    ).status === 403,
  );
});
Deno.test("duplicate bot update has no Telegram side effect", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ duplicate: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    assert(
      (
        await webhook(
          request({
            update_id: 1,
            message: {
              chat: { id: 42, type: "private" },
              from: { id: 42 },
              text: "/done",
            },
          }),
        )
      ).status === 200,
    );
    assert(calls === 1);
  } finally {
    globalThis.fetch = original;
  }
});
Deno.test(
  "database failure returns retryable status without a false success",
  async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: "temporarily unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    try {
      assert(
        (
          await webhook(
            request({
              update_id: 2,
              message: {
                chat: { id: 42, type: "private" },
                from: { id: 42 },
                text: "/done",
              },
            }),
          )
        ).status === 503,
      );
    } finally {
      globalThis.fetch = original;
    }
  },
);
Deno.test(
  "all requested commands and inline callback dispatch through one state adapter",
  async () => {
    Deno.env.set("TELEGRAM_BOT_TOKEN", "test-only-token");
    const original = globalThis.fetch;
    let sends = 0;
    let callbacks = 0;
    const state = {
      current: "1-18",
      progress: {},
      sessions: [],
      active: null,
      settings: { anchor: "2026-11-15", timezone: "UTC" },
    };
    globalThis.fetch = async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("api.telegram.org")) {
        if (url.endsWith("/sendMessage")) sends++;
        if (url.endsWith("/answerCallbackQuery")) callbacks++;
        return new Response(JSON.stringify({ ok: true, result: {} }), {
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(state), {
        headers: { "content-type": "application/json" },
      });
    };
    try {
      const commands = [
        "start",
        "today",
        "plan",
        "progress",
        "missions",
        "done",
        "boss",
        "week",
        "schedule",
        "reminders",
        "settings",
        "help",
      ];
      for (const [i, c] of commands.entries()) {
        const response = await webhook(
          request({
            update_id: 100 + i,
            message: {
              chat: { id: 42, type: "private" },
              from: { id: 42 },
              text: "/" + c,
            },
          }),
        );
        assert(response.status === 200);
      }
      const response = await webhook(
        request({
          update_id: 200,
          callback_query: {
            id: "callback",
            from: { id: 42 },
            data: "today",
            message: { chat: { id: 42, type: "private" } },
          },
        }),
      );
      assert(response.status === 200);
      assert(sends === 13);
      assert(callbacks === 1);
    } finally {
      globalThis.fetch = original;
    }
  },
);
Deno.test(
  "notification worker claims once, records 403 and stops retrying blocked chat",
  async () => {
    Deno.env.set("TELEGRAM_BOT_TOKEN", "test-only-token");
    const original = globalThis.fetch;
    const date = new Date().toISOString().slice(0, 10);
    const time = new Date().toISOString().slice(11, 16);
    let sends = 0;
    let blocked = false;
    let cancelled = false;
    let deduped = false;
    const pref = {
      user_id: "u",
      enabled: true,
      consent_at: new Date().toISOString(),
      quiet_start: "00:00:00",
      quiet_end: "00:00:00",
      work_times: [time],
      rest_times: [time],
      categories: { daily: true },
    };
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      const method = init?.method || "GET";
      let result: unknown = [];
      if (url.host === "api.telegram.org") {
        sends++;
        result = { ok: false, error_code: 403 };
      } else if (url.pathname.endsWith("/notification_settings"))
        result = url.searchParams.has("user_id") ? pref : [pref];
      else if (url.pathname.endsWith("/schedule_settings"))
        result = { timezone: "UTC", first_shift: date, paused: false };
      else if (url.pathname.endsWith("/telegram_connections")) {
        if (method === "PATCH")
          blocked = JSON.parse(String(init?.body)).blocked === true;
        result = { chat_id: 42, blocked: false };
      } else if (url.pathname.endsWith("/profiles"))
        result = { state: { current: "1-18", sessions: [] } };
      else if (url.pathname.endsWith("/rpc/claim_notification")) result = true;
      else if (url.pathname.endsWith("/notification_jobs")) {
        if (method === "POST") {
          const payload = JSON.parse(String(init?.body));
          deduped = String(payload.dedupe_key).includes(date);
        }
        if (method === "GET")
          result = [
            {
              id: "job",
              user_id: "u",
              category: "daily",
              attempts: 0,
              payload: { text: "test" },
            },
          ];
        if (method === "PATCH" && url.searchParams.get("id") === "eq.job")
          cancelled = JSON.parse(String(init?.body)).status === "cancelled";
      }
      return new Response(JSON.stringify(result), {
        headers: { "content-type": "application/json" },
      });
    };
    try {
      const response = await worker(
        new Request("https://local", {
          method: "POST",
          headers: { Authorization: "Bearer test-only-cron-secret" },
        }),
      );
      assert(response.status === 200);
      if (sends !== 1 || !blocked || !cancelled || !deduped)
        throw Error(JSON.stringify({ sends, blocked, cancelled, deduped }));
    } finally {
      globalThis.fetch = original;
    }
  },
);
