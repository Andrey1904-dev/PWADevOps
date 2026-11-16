import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { db, hash, json, runtimeSecret } from "../_shared/platform.ts";
import { validateInitData } from "../_shared/init-data.ts";
import { publicConfig } from "../../../src/public-config.ts";
import { linkDiagnostic } from "../_shared/link-flow.ts";
export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return json({});
  if (req.method !== "POST") return json({}, 405);
  try {
    const text = await req.text();
    if (text.length > 14000) return json({ error: "INVALID_INPUT" }, 400);
    const body = JSON.parse(text);
    const token = await runtimeSecret("TELEGRAM_BOT_TOKEN");
    if (!token) return json({ error: "TELEGRAM_UNAVAILABLE" }, 503);
    let tg;
    try {
      tg = await validateInitData(body.initData, token);
    } catch (e) {
      const reason = e instanceof Error &&
          [
            "INVALID_INIT_DATA",
            "INVALID_SIGNATURE",
            "EXPIRED_INIT_DATA",
            "DUPLICATE_FIELD",
            "INVALID_USER",
          ].includes(e.message)
        ? e.message
        : "INVALID_INIT_DATA";
      linkDiagnostic("init_data", "INVALID_OR_EXPIRED_INIT_DATA", reason);
      return json({ error: "INVALID_OR_EXPIRED_INIT_DATA" }, 401);
    }
    const admin = db();
    const bearer = req.headers.get("Authorization")?.replace(/^Bearer /, "");
    const {
      data: { user },
    } = bearer ? await admin.auth.getUser(bearer) : { data: { user: null } };
    const { data: connection, error: lookupError } = await admin
      .from("telegram_connections")
      .select("user_id,connection_id,blocked")
      .eq("chat_id", tg.id)
      .maybeSingle();
    if (lookupError) return json({ error: "DATABASE_UNAVAILABLE" }, 503);
    if (body.action === "link") {
      if (!user) return json({ error: "LOGIN_REQUIRED" }, 401);
      const scoped = createClient(
        publicConfig.url,
        publicConfig.publishableKey,
        {
          global: { headers: { Authorization: `Bearer ${bearer}` } },
          auth: { persistSession: false },
        },
      );
      const ensured = await scoped.rpc("ensure_profile");
      if (ensured.error) return json({ error: "PROFILE_UNAVAILABLE" }, 503);
      const { data, error } = await admin.rpc("link_mini_app", {
        profile_id: user.id,
        telegram_chat: tg.id,
      });
      if (error || !data) return json({ error: "ACCOUNT_ALREADY_LINKED" }, 409);
      return json({ linked: true });
    }
    if (!connection || connection.blocked) {
      return json({ error: "LINK_REQUIRED" }, 409);
    }
    if (user?.id === connection.user_id) {
      const scoped = createClient(
        publicConfig.url,
        publicConfig.publishableKey,
        {
          global: { headers: { Authorization: `Bearer ${bearer}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        },
      );
      const { data: status } = await scoped.rpc("mini_session_status");
      if (status?.allowed) return json({ authenticated: true });
    }
    const { data: consumed, error: nonceError } = await admin.rpc(
      "consume_mini_app_auth",
      { init_hash: await hash(body.initData), telegram_chat: tg.id },
    );
    if (nonceError) return json({ error: "DATABASE_UNAVAILABLE" }, 503);
    if (!consumed) return json({ error: "REOPEN_MINI_APP" }, 409);
    const { data: account, error: accountError } = await admin.auth.admin
      .getUserById(connection.user_id);
    if (accountError || !account.user.email) {
      return json({ error: "ACCOUNT_UNAVAILABLE" }, 409);
    }
    const { data: link, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: account.user.email,
    });
    if (
      error ||
      !link.properties?.hashed_token ||
      link.user?.id !== connection.user_id
    ) {
      return json({ error: "SESSION_UNAVAILABLE" }, 503);
    }
    const sessionClient = createClient(
      publicConfig.url,
      publicConfig.publishableKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
    const verified = await sessionClient.auth.verifyOtp({
      token_hash: link.properties.hashed_token,
      type: "magiclink",
    });
    const session = verified.data.session;
    if (
      verified.error ||
      !session ||
      verified.data.user?.id !== connection.user_id
    ) {
      return json({ error: "SESSION_UNAVAILABLE" }, 503);
    }
    const encoded = session.access_token
      .split(".")[1]
      .replaceAll("-", "+")
      .replaceAll("_", "/");
    const claims = JSON.parse(atob(encoded));
    if (!/^[a-f0-9-]{36}$/.test(claims.session_id)) {
      await sessionClient.auth.signOut();
      return json({ error: "SESSION_UNAVAILABLE" }, 503);
    }
    const { data: registered, error: registerError } = await admin.rpc(
      "register_mini_app_session",
      {
        auth_session: claims.session_id,
        profile_id: connection.user_id,
        telegram_chat: tg.id,
        generation: connection.connection_id,
      },
    );
    if (registerError || !registered) {
      await sessionClient.auth.signOut();
      return json({ error: "LINK_REQUIRED" }, 409);
    }
    return json({
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      },
    });
  } catch {
    return json({ error: "TEMPORARY_FAILURE" }, 503);
  }
};
if (import.meta.main) Deno.serve(handler);
