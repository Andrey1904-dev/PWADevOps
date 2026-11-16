import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { publicConfig } from "../../../src/public-config.ts";
import { db, hash, json } from "../_shared/platform.ts";
import { linkDiagnostic } from "../_shared/link-flow.ts";
export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return json({});
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const client = db();
    const {
      data: { user },
      error,
    } = await client.auth.getUser(
      req.headers.get("Authorization")?.replace(/^Bearer /, ""),
    );
    if (error || !user) return json({ error: "Unauthorized" }, 401);
    const bearer = req.headers.get("Authorization") || "";
    const scoped = createClient(publicConfig.url, publicConfig.publishableKey, {
      global: { headers: { Authorization: bearer } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: status } = await scoped.rpc("mini_session_status");
    if (!status?.allowed) return json({ error: "SESSION_REVOKED" }, 401);
    const ensured = await scoped.rpc("ensure_profile");
    if (ensured.error) {
      linkDiagnostic(
        "issue",
        "PROFILE_UNAVAILABLE",
        ensured.error.code || "profile RPC failed",
      );
      return json({ error: "PROFILE_UNAVAILABLE" }, 503);
    }
    const raw = await req.text();
    if (raw.length > 1024) return json({ error: "INVALID_REQUEST" }, 400);
    const body = raw ? JSON.parse(raw) : {};
    if (body.action === "cancel") {
      if (
        typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token)
      ) return json({ error: "INVALID_REQUEST" }, 400);
      const { error: cancelError } = await client.from("telegram_link_tokens")
        .update({ consumed_at: new Date().toISOString(), outcome: "cancelled" })
        .eq("user_id", user.id).eq("token_hash", await hash(body.token)).is(
          "consumed_at",
          null,
        );
      if (cancelError) {
        linkDiagnostic("cancel", "DATABASE_UNAVAILABLE", cancelError.code);
        return json({ error: "DATABASE_UNAVAILABLE" }, 503);
      }
      linkDiagnostic(
        "cancel",
        "CANCELLED",
        "owner cancelled own pending request",
      );
      return json({ cancelled: true });
    }
    if (body.action && body.action !== "create") {
      return json({ error: "INVALID_REQUEST" }, 400);
    }
    const token = crypto.randomUUID().replaceAll("-", "") +
      crypto.randomUUID().replaceAll("-", "");
    const { data, error: e } = await client.rpc("create_link_token", {
      uid: user.id,
      hashed_token: await hash(token),
    });
    if (e) {
      linkDiagnostic("issue", "DATABASE_UNAVAILABLE", e.code);
      return json({ error: "DATABASE_UNAVAILABLE" }, 503);
    }
    if (!data) {
      linkDiagnostic(
        "issue",
        "LINK_RATE_LIMITED",
        "one-minute request throttle",
      );
      return json(
        { error: "LINK_RATE_LIMITED", retry_after_seconds: 60 },
        429,
      );
    }
    linkDiagnostic(
      "issue",
      "LINK_ISSUED",
      "ten-minute single-use capability created",
    );
    return json({
      token,
      url: `https://t.me/PwaDevOps_Bot?start=${token}`,
      expires_at: new Date(Date.now() + 600000).toISOString(),
    });
  } catch {
    linkDiagnostic(
      "issue",
      "TEMPORARY_FAILURE",
      "invalid request or transport failure",
    );
    return json({ error: "TEMPORARY_FAILURE" }, 503);
  }
};
if (import.meta.main) Deno.serve(handler);
