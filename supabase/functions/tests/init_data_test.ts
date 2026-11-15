import { createHmac } from "node:crypto";
import { validateInitData } from "../_shared/init-data.ts";
import { handler } from "../telegram-auth/index.ts";
const token = "test-only-miniapp-token";
const now = 1800000000;
function sign(fields: Record<string, string>) {
  const p = new URLSearchParams(fields);
  const check = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  p.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  return p.toString();
}
function assert(v: unknown) {
  if (!v) throw Error("Assertion failed");
}
async function rejects(raw: string) {
  try {
    await validateInitData(raw, token, now);
  } catch {
    return;
  }
  throw Error("Expected rejection");
}
Deno.test(
  "initData validates independent HMAC and stable Telegram identity",
  async () =>
    assert(
      (
        await validateInitData(
          sign({
            auth_date: String(now),
            user: JSON.stringify({ id: 42, first_name: "Инженер" }),
            query_id: "q",
          }),
          token,
          now,
        )
      ).id === 42,
    ),
);
Deno.test(
  "initData rejects tampering, expiry, future auth and duplicate keys",
  async () => {
    const raw = sign({ auth_date: String(now), user: '{"id":42}' });
    await rejects(raw.replace("42", "43"));
    await rejects(sign({ auth_date: String(now - 301), user: '{"id":42}' }));
    await rejects(sign({ auth_date: String(now + 31), user: '{"id":42}' }));
    await rejects(raw + "&auth_date=" + now);
    await rejects(
      sign({ auth_date: String(now), user: '{"id":42,"is_bot":true}' }),
    );
  },
);
Deno.test(
  "Mini App rejects forged browser data before database reads",
  async () => {
    Deno.env.set("TELEGRAM_BOT_TOKEN", token);
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      throw Error("Unexpected network");
    };
    try {
      const r = await handler(
        new Request("https://local", {
          method: "POST",
          body: JSON.stringify({
            initData: 'user={"id":42}',
            action: "exchange",
          }),
        }),
      );
      assert(r.status === 401 && calls === 0);
    } finally {
      globalThis.fetch = original;
    }
  },
);
Deno.test(
  "unlinked Telegram requires existing account and never creates a duplicate",
  async () => {
    Deno.env.set("TELEGRAM_BOT_TOKEN", token);
    Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test");
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      assert(url.includes("telegram_connections"));
      calls++;
      return new Response("null", {
        headers: { "content-type": "application/json" },
      });
    };
    try {
      const raw = sign({
        auth_date: String(Math.floor(Date.now() / 1000)),
        user: '{"id":42}',
      });
      const r = await handler(
        new Request("https://local", {
          method: "POST",
          body: JSON.stringify({ initData: raw }),
        }),
      );
      assert(r.status === 409 && calls === 1);
      assert((await r.json()).error === "LINK_REQUIRED");
    } finally {
      globalThis.fetch = original;
    }
  },
);
