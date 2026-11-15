import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import {
  db,
  hash,
  json,
  telegram,
  runtimeSecret,
} from "../../supabase/functions/_shared/platform.ts";
import { hmac } from "../../supabase/functions/_shared/init-data.ts";
import { publicConfig } from "../../src/public-config.ts";
Deno.serve(async (req) => {
  const bearer = req.headers.get("Authorization") || "";
  if (!bearer.startsWith("Bearer ")) return json({}, 401);
  const admin = db();
  const { data: allowed } = await admin.rpc("authorize_notification_worker", {
    hashed_token: await hash(bearer.slice(7)),
  });
  if (!allowed) return json({}, 401);
  const passed: string[] = [];
  const users: string[] = [];
  const clients: ReturnType<typeof createClient>[] = [];
  let chat = 0;
  const updates: number[] = [];
  let failure = "";
  const ok = (v: unknown, name: string) => {
    if (!v) throw Error(name);
    passed.push(name);
  };
  let telegramStatus: unknown = {};
  try {
    const url = "https://andrey1904-dev.github.io/PWADevOps/";
    const menu = await telegram("setChatMenuButton", {
      menu_button: {
        type: "web_app",
        text: "🚀 DevOps Quest",
        web_app: { url },
      },
    });
    ok(menu.ok, "configure Telegram Mini App menu");
    for (const language_code of ["", "ru"]) {
      const commands = await telegram("setMyCommands", {
        commands: [{ command: "start", description: "Открыть DevOps Quest" }],
        language_code,
      });
      ok(
        commands.ok,
        "configure buttons-first command menu " + (language_code || "default"),
      );
    }
    await telegram("setMyDescription", {
      description:
        "Твой путь от Python до DevOps-инженера. Миссии, практика, прогресс и личное расписание. Нажми «Начать» и открой приложение.",
    });
    const { data: realConnections } = await admin
      .from("telegram_connections")
      .select("user_id,chat_id")
      .eq("blocked", false);
    const realConnection = realConnections?.[0];
    if (realConnection) {
      const { data: job, error: jobError } = await admin
        .from("notification_jobs")
        .insert({
          user_id: realConnection.user_id,
          dedupe_key: realConnection.user_id + ":launch_test_002",
          category: "test",
          due_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 300000).toISOString(),
          status: "sending",
          attempts: 1,
        })
        .select("id")
        .single();
      if (!jobError && job) {
        const sent = await telegram("sendMessage", {
          chat_id: realConnection.chat_id,
          text: "✅ DevOps Quest: тест подключения. Приложение и Mini App доступны по кнопке меню. Это одно тестовое сообщение.",
        });
        await admin
          .from("notification_jobs")
          .update({ status: sent.ok ? "sent" : "failed" })
          .eq("id", job.id);
        await admin
          .from("notification_delivery_log")
          .insert({
            user_id: realConnection.user_id,
            job_id: job.id,
            result: sent.ok ? "launch_test_sent" : "launch_test_failed",
          });
        ok(sent.ok, "real user test message delivery");
      } else passed.push("real user test message already attempted");
    } else passed.push("real user delivery pending: no confirmed chat ID");
    const me = await telegram("getMe", {});
    const webhook = await telegram("getWebhookInfo", {});
    const appMenu = await telegram("getChatMenuButton", {});
    ok(me.ok && me.result.username === "PwaDevOps_Bot", "Telegram getMe");
    ok(
      webhook.ok && !webhook.result.last_error_message,
      "Telegram webhook status",
    );
    ok(
      appMenu.result?.type === "web_app" && appMenu.result.web_app.url === url,
      "Telegram Mini App menu URL",
    );
    telegramStatus = {
      username: me.result.username,
      webhook: webhook.result.url,
      pending: webhook.result.pending_update_count,
      menu: appMenu.result.type,
    };
    for (let i = 0; i < 2; i++) {
      const email = `dq-audit-${crypto.randomUUID()}@example.com`;
      const password = crypto.randomUUID() + crypto.randomUUID();
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      ok(!error && data.user, "create temporary Auth user " + i);
      users.push(data.user!.id);
      const c = createClient(publicConfig.url, publicConfig.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      clients.push(c);
      ok(
        !(await c.auth.signInWithPassword({ email, password })).error,
        "password login " + i,
      );
      ok(!(await c.rpc("ensure_profile")).error, "ensure profile " + i);
    }
    const [a, b] = clients;
    const { data: target } = await admin.auth.admin.getUserById(users[0]);
    const redirect = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: target.user!.email!,
      options: { redirectTo: "https://andrey1904-dev.github.io/PWADevOps/" },
    });
    const actualRedirect = redirect.data.properties?.action_link
      ? new URL(redirect.data.properties.action_link).searchParams.get(
          "redirect_to",
        )
      : null;
    passed.push(
      "Auth redirect target: " +
        (actualRedirect === "https://andrey1904-dev.github.io/PWADevOps/"
          ? "production allowed"
          : "Dashboard configuration required"),
    );
    const state = {
      current: "1-18",
      progress: {
        "1-18": {
          status: "solved",
          note: "audit",
          error: "",
          github: "",
          review: "",
        },
      },
      sessions: [
        {
          id: crypto.randomUUID(),
          date: "2026-11-15",
          seconds: 60,
          note: "audit",
        },
      ],
      active: null,
      settings: {
        anchor: "2026-11-15",
        timezone: "Europe/Moscow",
        work: 35,
        rest: 150,
        heavy: 12,
        paused: false,
        reminders: false,
        quietStart: "22:00",
        quietEnd: "08:00",
        weekdays: [1, 2, 3, 4, 5],
        weeklyGoal: 660,
      },
    };
    const params = {
      operation_id: crypto.randomUUID(),
      expected_version: 0,
      operation_kind: "progress",
      body: { state },
    };
    ok(!(await a.rpc("apply_operation", params)).error, "PWA operation");
    ok(
      (await a.rpc("apply_operation", params)).data.version === 1,
      "operation replay",
    );
    const rewards = await a.from("reward_events").select("xp");
    ok(
      rewards.data?.reduce((n, x) => n + x.xp, 0) === 50,
      "exactly one solved XP award",
    );
    ok(
      (await a.from("mission_history").select("id")).data?.length === 1,
      "progress history",
    );
    ok(
      (await b.from("reward_events").select("*")).data?.length === 0,
      "XP row isolation",
    );
    chat = 7000000000000 + crypto.getRandomValues(new Uint32Array(1))[0];
    const token = await runtimeSecret("TELEGRAM_BOT_TOKEN");
    const fields = {
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: crypto.randomUUID(),
      user: JSON.stringify({ id: chat, first_name: "Audit" }),
    };
    const check = Object.keys(fields)
      .sort()
      .map((k) => `${k}=${fields[k as keyof typeof fields]}`)
      .join("\n");
    const key = await hmac(new TextEncoder().encode("WebAppData"), token!);
    const signature = await hmac(key, check);
    const initData = new URLSearchParams({
      ...fields,
      hash: [...signature].map((x) => x.toString(16).padStart(2, "0")).join(""),
    }).toString();
    const call = async (action: string, jwt?: string, raw = initData) => {
      const r = await fetch(publicConfig.url + "/functions/v1/telegram-auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(jwt ? { Authorization: "Bearer " + jwt } : {}),
        },
        body: JSON.stringify({ action, initData: raw }),
      });
      return { status: r.status, body: await r.json() };
    };
    ok(
      (await call("exchange")).body.error === "LINK_REQUIRED",
      "unlinked Mini App does not create account",
    );
    const sessionA = (await a.auth.getSession()).data.session!;
    const sessionB = (await b.auth.getSession()).data.session!;
    ok(
      (await call("link", sessionA.access_token)).body.linked,
      "Mini App links existing account",
    );
    ok(
      (await call("link", sessionB.access_token)).status === 409,
      "cannot steal Telegram link",
    );
    const exchange = await call("exchange");
    ok(
      exchange.status === 200 && exchange.body.session,
      "signed initData session exchange",
    );
    const mini = createClient(publicConfig.url, publicConfig.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    clients.push(mini);
    const verified = await mini.auth.setSession(exchange.body.session);
    ok(
      !verified.error && verified.data.user?.id === users[0],
      "Mini App gets original Supabase identity",
    );
    ok(
      (await mini.from("profiles").select("state").single()).data?.state
        .current === "1-18",
      "Mini App sees PWA mission",
    );
    ok(
      (await call("exchange")).body.error === "REOPEN_MINI_APP",
      "initData exchange replay denied",
    );
    ok(
      (await call("exchange", verified.data.session!.access_token)).body
        .authenticated,
      "existing session resumes without registration",
    );
    ok(
      (await call("exchange", undefined, initData.replace("Audit", "Forged")))
        .status === 401,
      "forged initData rejected",
    );
    const update = Date.now() * 100;
    updates.push(update, update + 1);
    ok(
      !(
        await admin.rpc("bot_action_guarded", {
          chat,
          update_number: update,
          action: "status",
          argument: "verified",
          target_mission: "1-18",
        })
      ).error,
      "button action updates shared progress",
    );
    await admin.rpc("bot_action_guarded", {
      chat,
      update_number: update,
      action: "status",
      argument: "verified",
      target_mission: "1-18",
    });
    const after = await mini.from("reward_events").select("xp");
    ok(
      after.data?.reduce((n, x) => n + x.xp, 0) === 100,
      "verified XP is not doubled by duplicate callback",
    );
    ok(
      (await mini.from("profiles").select("state").single()).data?.state
        .progress["1-18"].status === "verified",
      "bot change visible in Mini App",
    );
    ok(
      (
        await admin.rpc("bot_action_guarded", {
          chat,
          update_number: update + 1,
          action: "status",
          argument: "solved",
          target_mission: "1-17",
        })
      ).data?.stale_action,
      "stale callback cannot change new mission",
    );
    const refreshed = await mini.auth.refreshSession();
    ok(
      !refreshed.error && refreshed.data.user?.id === users[0],
      "expired access session refresh preserves identity",
    );
    const reopenFields = { ...fields, query_id: crypto.randomUUID() };
    const reopenCheck = Object.keys(reopenFields)
      .sort()
      .map((k) => `${k}=${reopenFields[k as keyof typeof reopenFields]}`)
      .join("\n");
    const reopenSignature = await hmac(key, reopenCheck);
    const reopenInit = new URLSearchParams({
      ...reopenFields,
      hash: [...reopenSignature]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join(""),
    }).toString();
    const reopened = await call("exchange", undefined, reopenInit);
    ok(
      reopened.status === 200 && reopened.body.session,
      "reopening Mini App issues same-account session automatically",
    );
    const reopenedClient = createClient(
      publicConfig.url,
      publicConfig.publishableKey,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    clients.push(reopenedClient);
    ok(
      (await reopenedClient.auth.setSession(reopened.body.session)).data.user
        ?.id === users[0],
      "reopened session uses original user id",
    );
    ok(
      !(await a.rpc("revoke_telegram_link")).error,
      "PWA revokes Telegram link",
    );
    ok(
      (await call("exchange")).body.error === "LINK_REQUIRED",
      "revocation blocks new automatic login",
    );
    const status = await mini.rpc("mini_session_status");
    ok(
      status.data?.mini && status.data.allowed === false,
      "existing Mini App session detects revocation",
    );
    ok(
      (await mini.from("profiles").select("*")).data?.length === 0,
      "revoked JWT cannot read profile immediately",
    );
    ok(
      !!(await mini.rpc("ensure_profile")).error,
      "revoked JWT cannot use privileged writes",
    );
    ok(
      (await a.from("profiles").select("*")).data?.length === 1,
      "PWA password session keeps access",
    );
    ok(
      (await call("link", sessionA.access_token)).body.linked,
      "PWA can explicitly restore link",
    );
    ok(
      (await mini.rpc("mini_session_status")).data?.allowed === false,
      "relink does not resurrect revoked sessions",
    );
    for (const c of clients) {
      ok(!(await c.auth.signOut()).error, "logout");
    }
  } catch (e) {
    failure = (e as Error).message;
  } finally {
    for (const c of clients) await c.auth.signOut();
    for (const id of users) {
      if ((await admin.auth.admin.deleteUser(id)).error)
        failure = "test user cleanup";
    }
    if (chat)
      await admin.from("mini_app_auth_requests").delete().eq("chat_id", chat);
    if (updates.length)
      await admin.from("processed_updates").delete().in("update_id", updates);
  }
  return json({
    ok: !failure,
    passed,
    failure,
    telegram: telegramStatus,
    temporary_users_deleted: users.length,
  });
});
