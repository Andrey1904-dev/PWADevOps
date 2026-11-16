// Maintenance-only audit: real deployed HTTP APIs + DB; Telegram updates/initData are synthetic.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import {
  db,
  hash,
  json,
  runtimeSecret,
  telegram,
} from "../../supabase/functions/_shared/platform.ts";
import { linkCallback } from "../../supabase/functions/_shared/link-flow.ts";
import { hmac } from "../../supabase/functions/_shared/init-data.ts";
import { publicConfig } from "../../src/public-config.ts";
Deno.serve(async (req) => {
  const admin = db();
  const auth = req.headers.get("Authorization") || "";
  if (
    !auth.startsWith("Bearer ") ||
    !(await admin.rpc("authorize_notification_worker", {
      hashed_token: await hash(auth.slice(7)),
    })).data
  ) return json({}, 401);
  const passed: string[] = [];
  const users: string[] = [];
  const clients: any[] = [];
  let failed = "";
  // Above Telegram's documented 52-bit user id range: cannot address a real Telegram user.
  const chat = 8000000000000000 + Math.floor(Math.random() * 100000);
  const ok = (v: unknown, name: string) => {
    if (!v) throw Error(name);
    passed.push(name);
  };
  const base = publicConfig.url + "/functions/v1/";
  let update = Date.now();
  try {
    const me = await telegram("getMe", {});
    ok(me.ok && me.result.username === "PwaDevOps_Bot", "real Telegram getMe");
    const hook = await telegram("getWebhookInfo", {});
    ok(hook.ok && !hook.result.last_error_message, "real webhook healthy");
    for (let i = 0; i < 2; i++) {
      const email = `dq-link-audit-${crypto.randomUUID()}@example.com`;
      const password = crypto.randomUUID() + "A1!";
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: "Temporary link audit" },
      });
      ok(created.data.user && !created.error, "temporary Auth fixture " + i);
      users.push(created.data.user!.id);
      const c = createClient(publicConfig.url, publicConfig.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      ok(
        !(await c.auth.signInWithPassword({ email, password })).error,
        "real password session " + i,
      );
      clients.push(c);
      await c.rpc("ensure_profile");
    }
    const jwt = async (c: any) =>
      (await c.auth.getSession()).data.session.access_token;
    const api = async (name: string, body: unknown, c?: any) => {
      const r = await fetch(base + name, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: publicConfig.publishableKey,
          ...(c ? { Authorization: "Bearer " + await jwt(c) } : {}),
        },
        body: JSON.stringify(body),
      });
      return { status: r.status, data: await r.json() };
    };
    const create = async (c: any) => {
      const r = await api("link-telegram", { action: "create" }, c);
      ok(
        r.status === 200 && /^[a-f0-9]{64}$/.test(r.data.token),
        "real link endpoint creates capability",
      );
      ok(
        r.data.url === `https://t.me/PwaDevOps_Bot?start=${r.data.token}`,
        "deep link preserves full 64-byte start payload",
      );
      return r.data.token;
    };
    const webhook = async (token: string, action = "start", sender = chat) => {
      const u = action === "start"
        ? {
          update_id: ++update,
          message: {
            message_id: 1,
            date: Math.floor(Date.now() / 1000),
            chat: { id: chat, type: "private" },
            from: { id: sender },
            text: "/start " + token,
          },
        }
        : {
          update_id: ++update,
          callback_query: {
            id: "audit-" + update,
            from: { id: sender },
            data: linkCallback(token, action as "confirm" | "cancel"),
            message: {
              message_id: 1,
              date: Math.floor(Date.now() / 1000),
              chat: { id: chat, type: "private" },
            },
          },
        };
      const r = await fetch(base + "telegram-webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Bot-Api-Secret-Token":
            (await runtimeSecret("TELEGRAM_WEBHOOK_SECRET"))!,
        },
        body: JSON.stringify(u),
      });
      return r.status;
    };
    const connection = async () =>
      (await admin.from("telegram_connections").select("user_id,connection_id")
        .eq("chat_id", chat).maybeSingle()).data;
    ok(
      (await api("link-telegram", {})).status === 401,
      "unauthenticated link request denied",
    );
    let token = await create(clients[0]);
    ok(
      (await api("link-telegram", { action: "create" }, clients[0])).status ===
        429,
      "real API throttle returns 429",
    );
    ok(
      await webhook(token) === 200,
      "deployed webhook accepts authenticated synthetic start",
    );
    ok(!await connection(), "start alone does not link");
    ok(
      await webhook(token, "confirm", chat - 1) === 403,
      "webhook rejects mismatched Telegram sender",
    );
    await webhook(token, "cancel");
    ok(!await connection(), "cancel does not create connection");
    await webhook(token, "confirm");
    ok(!await connection(), "cancelled capability cannot link");
    token = await create(clients[0]);
    await webhook(token);
    await webhook(token, "confirm");
    const first = await connection();
    ok(
      first?.user_id === users[0],
      "confirmed token attaches original user id",
    );
    await webhook(token, "confirm");
    ok(
      (await connection())?.connection_id === first?.connection_id,
      "repeat confirmation preserves identity and generation",
    );
    const other = await create(clients[1]);
    await webhook(other);
    await webhook(other, "confirm");
    ok(
      (await connection())?.user_id === users[0],
      "Telegram conflict cannot steal connection",
    );
    await clients[0].rpc("revoke_telegram_link");
    await webhook(token, "confirm");
    ok(!await connection(), "spent token cannot restore revoked link");
    token = await create(clients[0]);
    await admin.from("telegram_link_tokens").update({
      expires_at: new Date(Date.now() - 1000).toISOString(),
    }).eq("user_id", users[0]);
    await webhook(token);
    await webhook(token, "confirm");
    ok(!await connection(), "expired token denied by deployed webhook");
    await webhook("0".repeat(64));
    await webhook("0".repeat(64), "confirm");
    ok(!await connection(), "tampered token denied");
    token = await create(clients[0]);
    await api("link-telegram", { action: "cancel", token }, clients[0]);
    await webhook(token);
    await webhook(token, "confirm");
    ok(!await connection(), "PWA cancellation invalidates link");
    token = await create(clients[0]);
    await webhook(token);
    await webhook(token, "confirm");
    ok(
      (await connection())?.user_id === users[0],
      "fresh request reconnects existing account",
    );
    const init = async () => {
      const p = new URLSearchParams({
        auth_date: String(Math.floor(Date.now() / 1000)),
        query_id: crypto.randomUUID(),
        user: JSON.stringify({ id: chat, first_name: "Audit" }),
      });
      const check = [...p].sort(([a], [b]) => a.localeCompare(b, "en")).map((
        [k, v],
      ) => `${k}=${v}`).join("\n");
      const key = await hmac(
        new TextEncoder().encode("WebAppData"),
        (await runtimeSecret("TELEGRAM_BOT_TOKEN"))!,
      );
      p.set(
        "hash",
        [...await hmac(key, check)].map((n) => n.toString(16).padStart(2, "0"))
          .join(""),
      );
      return p.toString();
    };
    const opened = await api("telegram-auth", {
      action: "exchange",
      initData: await init(),
    });
    ok(
      opened.status === 200 && opened.data.session,
      "deployed Mini App exchange accepts independently signed adapter",
    );
    const mini = createClient(publicConfig.url, publicConfig.publishableKey, {
      auth: { persistSession: false },
    });
    clients.push(mini);
    await mini.auth.setSession(opened.data.session);
    ok(
      (await mini.auth.getUser()).data.user?.id === users[0],
      "Mini App session is original Supabase user",
    );
    const profile = await clients[0].from("profiles").select("state,version")
      .single();
    const state = {
      ...profile.data.state,
      current: "1-18",
      progress: {
        "1-18": {
          status: "solved",
          note: "link-audit",
          error: "",
          github: "",
          review: "",
        },
      },
      sessions: [],
      active: null,
      settings: {
        anchor: "2026-11-17",
        timezone: "",
        work: 35,
        rest: 150,
        heavy: 12,
        paused: false,
        reminders: false,
      },
    };
    ok(
      !(await clients[0].rpc("apply_operation", {
        operation_id: crypto.randomUUID(),
        expected_version: profile.data.version,
        operation_kind: "progress",
        body: { state },
      })).error,
      "real PWA progress operation",
    );
    ok(
      (await mini.from("profiles").select("state").single()).data?.state
        .progress["1-18"].status === "solved",
      "Mini App sees same progress",
    );
    const reopened = await api("telegram-auth", {
      action: "exchange",
      initData: await init(),
    });
    ok(
      reopened.status === 200 && reopened.data.session,
      "reopen exchanges new signed adapter without account creation",
    );
    await clients[0].rpc("revoke_telegram_link");
    ok(
      (await api("telegram-auth", {
        action: "exchange",
        initData: await init(),
      })).status === 409,
      "revocation denies new Mini App login",
    );
    ok(
      (await mini.rpc("mini_session_status")).data.allowed === false,
      "revocation invalidates existing Mini App session",
    );
  } catch (e) {
    failed = e instanceof Error ? e.message : "audit failed";
  } finally {
    for (const c of clients) await c.auth.signOut().catch(() => {});
    for (const id of users) await admin.auth.admin.deleteUser(id);
  }
  return json({
    ok: !failed,
    passed,
    failed,
    temporary_users_deleted: users.length,
    scope:
      "Real production HTTP endpoints/Auth/RLS. Synthetic authenticated webhook updates and signed initData; fake impossible Telegram id; no actual chat delivery or native client test.",
  }, failed ? 500 : 200);
});
