import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import {
  db,
  hash,
  json,
  telegram,
} from "../../supabase/functions/_shared/platform.ts";
import { publicConfig } from "../../src/public-config.ts";
Deno.serve(async (req) => {
  const bearer = req.headers.get("Authorization") || "";
  if (!bearer.startsWith("Bearer ")) return json({}, 401);
  const admin = db();
  const { data: allowed } = await admin.rpc("authorize_notification_worker", {
    hashed_token: await hash(bearer.slice(7)),
  });
  if (!allowed) return json({}, 401);
  const users: string[] = [];
  const clients: ReturnType<typeof createClient>[] = [];
  const passed: string[] = [];
  let failure = "";
  const ok = (value: unknown, name: string) => {
    if (!value) throw Error(name);
    passed.push(name);
  };
  try {
    for (let i = 0; i < 2; i++) {
      const password = crypto.randomUUID() + crypto.randomUUID();
      const email = `dq-integration-${crypto.randomUUID()}@example.com`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) throw Error("admin test user creation");
      users.push(data.user.id);
      const c = createClient(publicConfig.url, publicConfig.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      clients.push(c);
      const login = await c.auth.signInWithPassword({ email, password });
      ok(!login.error, `password login ${i + 1}`);
      const ensured = await c.rpc("ensure_profile");
      ok(!ensured.error, `profile ${i + 1}`);
    }
    const me = await telegram("getMe", {});
    ok(me.ok && me.result.username === "PwaDevOps_Bot", "Telegram getMe");
    const webhook = await telegram("getWebhookInfo", {});
    ok(
      webhook.ok &&
        webhook.result.url.endsWith("/telegram-webhook") &&
        !webhook.result.last_error_message,
      "Telegram webhook registered without errors",
    );
    const commands = await telegram("getMyCommands", {});
    ok(
      commands.ok &&
        ["missions", "boss", "week"].every((command) =>
          commands.result.some((item: any) => item.command === command),
        ),
      "Telegram command menu",
    );
    const [a, b] = clients;
    const state = {
      current: "1-18",
      progress: {
        "1-18": {
          status: "solved",
          note: "test",
          error: "",
          github: "",
          review: "",
        },
      },
      sessions: [
        {
          id: crypto.randomUUID(),
          seconds: 60,
          date: "2026-11-15",
          note: "integration test",
        },
      ],
      active: Date.now() - 61000,
      settings: {
        anchor: "2026-11-15",
        timezone: "Europe/Moscow",
        work: 40,
        rest: 150,
        heavy: 12,
        paused: false,
        reminders: false,
        quietStart: "22:00",
        quietEnd: "08:00",
      },
    };
    const op = crypto.randomUUID();
    const params = {
      operation_id: op,
      expected_version: 0,
      operation_kind: "session",
      body: { state },
    };
    const first = await a.rpc("apply_operation", params);
    ok(!first.error && first.data.version === 1, "PWA operation");
    const repeat = await a.rpc("apply_operation", params);
    ok(!repeat.error && repeat.data.version === 1, "idempotent operation");
    const stale = await a.rpc("apply_operation", {
      ...params,
      operation_id: crypto.randomUUID(),
    });
    ok(stale.data?.conflict, "version conflict");
    const isolated = await b.from("profiles").select("*").eq("id", users[0]);
    ok(!isolated.error && !isolated.data?.length, "cross-user profile RLS");
    const isolatedSessions = await b
      .from("study_sessions")
      .select("*")
      .eq("user_id", users[0]);
    ok(
      !isolatedSessions.error && !isolatedSessions.data?.length,
      "cross-user session RLS",
    );
    const direct = await b
      .from("profiles")
      .update({ version: 999 })
      .eq("id", users[0]);
    ok(!!direct.error, "direct write forbidden");
    const link = await a.functions.invoke("link-telegram");
    ok(
      !link.error && typeof link.data.token === "string",
      "authenticated linking endpoint",
    );
    const tokenHash = await hash(link.data.token);
    const chat =
      8000000000000 + Number.parseInt(crypto.randomUUID().slice(0, 6), 16);
    const update = Date.now() * 100;
    const consume = await admin.rpc("consume_link", {
      hash: tokenHash,
      telegram_chat: chat,
      update_number: update,
    });
    ok(consume.data === true, "one-time Telegram link");
    const reused = await admin.rpc("consume_link", {
      hash: tokenHash,
      telegram_chat: chat,
      update_number: update + 1,
    });
    ok(reused.data === false, "link replay denied");
    const finish = await admin.rpc("bot_action", {
      chat,
      update_number: update + 2,
      action: "done",
      argument: "",
    });
    ok(
      !finish.error && finish.data.sessions.length === 2,
      "bot session updates PWA state",
    );
    await admin.rpc("bot_action", {
      chat,
      update_number: update + 2,
      action: "done",
      argument: "",
    });
    const sessions = await a.from("study_sessions").select("*");
    ok(sessions.data?.length === 2, "duplicate bot action no extra time");
    await admin.rpc("bot_action", {
      chat,
      update_number: update + 3,
      action: "note",
      argument: "from bot",
    });
    const refresh = await a.from("profiles").select("state,version").single();
    ok(
      refresh.data?.state.progress["1-18"].note === "from bot",
      "bot note visible to PWA",
    );
    const next = { ...refresh.data!.state, current: "1-19" };
    const change = await a.rpc("apply_operation", {
      operation_id: crypto.randomUUID(),
      expected_version: refresh.data!.version,
      operation_kind: "progress",
      body: { state: next },
    });
    ok(!change.error, "PWA second operation");
    const botRead = await admin.rpc("bot_action", {
      chat,
      update_number: update + 4,
      action: "mission",
      argument: "",
    });
    ok(botRead.data?.current === "1-19", "PWA mission visible to bot");
    const anon = createClient(publicConfig.url, publicConfig.publishableKey, {
      auth: { persistSession: false },
    });
    const anonymous = await anon.from("profiles").select("*");
    ok(
      !!anonymous.error || anonymous.data?.length === 0,
      "anonymous private data denied",
    );
    for (const [i, c] of clients.entries()) {
      const result = await c.auth.signOut();
      const after = await c.auth.getUser();
      ok(!result.error && !after.data.user, `logout ${i + 1}`);
    }
  } catch (e) {
    failure = (e as Error).message;
  } finally {
    for (const c of clients) await c.auth.signOut();
    for (const id of users) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) failure = "temporary test user cleanup failed";
    }
  }
  return json({
    ok: !failure,
    passed,
    failure,
    temporary_users_cleaned: users.length,
  });
});
