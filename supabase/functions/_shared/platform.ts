import { createClient } from "npm:@supabase/supabase-js@2.119.0";
export const db = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin":
        Deno.env.get("PWA_ORIGIN") ||
        new URL(
          Deno.env.get("PWA_URL") ||
            "https://andrey1904-dev.github.io/PWADevOps/",
        ).origin,
      "Access-Control-Allow-Headers":
        "authorization, apikey, content-type, x-client-info",
    },
  });
export async function hash(s: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(s),
  );
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export async function telegram(method: string, body: unknown) {
  const response = await fetch(
    `https://api.telegram.org/bot${await runtimeSecret("TELEGRAM_BOT_TOKEN")}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    },
  );
  return await response.json();
}
export const menu = {
  inline_keyboard: [
    [
      { text: "Сегодня", callback_data: "today" },
      { text: "Моя миссия", callback_data: "mission" },
    ],
    [
      { text: "Начать занятие", callback_data: "begin" },
      { text: "Завершить занятие", callback_data: "done" },
    ],
    [
      { text: "Прогресс", callback_data: "progress" },
      { text: "Календарь", callback_data: "schedule" },
    ],
    [
      { text: "Настройки", callback_data: "settings" },
      {
        text: "Открыть PWA",
        url:
          Deno.env.get("PWA_URL") ||
          "https://andrey1904-dev.github.io/PWADevOps/",
      },
    ],
  ],
};

export async function runtimeSecret(name: string): Promise<string | undefined> {
  const env = Deno.env.get(name);
  if (env) return env;
  const { data, error } = await db().rpc("read_runtime_secret", {
    secret_name: "devops_quest_" + name.toLowerCase(),
  });
  return error ? undefined : data || undefined;
}
