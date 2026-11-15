import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { publicConfig } from "../../../src/public-config.ts";
import { db, json, hash } from "../_shared/platform.ts";
export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return json({});
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
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
  const { data: profile } = await client
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return json({ error: "Sync profile first" }, 409);
  const token =
    crypto.randomUUID().replaceAll("-", "") +
    crypto.randomUUID().replaceAll("-", "");
  const { data, error: e } = await client.rpc("create_link_token", {
    uid: user.id,
    hashed_token: await hash(token),
  });
  if (e) return json({ error: "Unable to create code" }, 503);
  if (!data)
    return json(
      { error: "Wait one minute before generating another code" },
      429,
    );
  return json({ token });
};
if (import.meta.main) Deno.serve(handler);
