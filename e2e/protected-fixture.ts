import { test as base, expect } from "@playwright/test";
export const fixtureId = "11111111-1111-4111-8111-111111111111";
export const fixtureUser = {
  id: fixtureId,
  email: "fixture@example.com",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: { display_name: "QA инженер" },
  created_at: "2026-11-15T00:00:00Z",
  email_confirmed_at: "2026-11-15T00:00:00Z",
};
export const fixtureToken = () => {
  const encode = (x: unknown) =>
    Buffer.from(JSON.stringify(x)).toString("base64url");
  return (
    encode({ alg: "HS256", typ: "JWT" }) +
    "." +
    encode({
      sub: fixtureId,
      session_id: fixtureId,
      exp: Math.floor(Date.now() / 1000) + 31536000,
      iat: Math.floor(Date.now() / 1000),
    }) +
    ".test_signature"
  );
};
export const test = base.extend({
  page: async ({ page, context }, use) => {
    let offline = false;
    const setOffline = context.setOffline.bind(context);
    context.setOffline = async (value) => {
      offline = value;
      await setOffline(value);
    };
    let state: Record<string, unknown> = {
      current: "1-18",
      progress: {},
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
        quietStart: "22:00",
        quietEnd: "08:00",
        workTimes: "09:00,13:00,18:00,21:30",
        restTimes: "09:00,13:00,18:00,21:30",
      },
    };
    let version = 0;
    let active = true;
    const seen = new Set();
    const session = {
      access_token: fixtureToken(),
      refresh_token: "test-refresh",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 31536000,
      token_type: "bearer",
      user: fixtureUser,
    };
    await page.addInitScript(
      (session) =>
        localStorage.setItem(
          "sb-okswmvxxoataxprjwzjv-auth-token",
          JSON.stringify(session),
        ),
      session,
    );
    await page.route(
      "https://okswmvxxoataxprjwzjv.supabase.co/**",
      async (route) => {
        if (offline) return route.abort("internetdisconnected");
        const path = new URL(route.request().url()).pathname;
        let body: unknown = null;
        if (path.endsWith("/user")) {
          if (!active)
            return route.fulfill({
              status: 401,
              json: { message: "Logged out", code: "bad_jwt" },
            });
          body = fixtureUser;
        } else if (path.endsWith("/logout")) active = false;
        else if (path.endsWith("/mini_session_status"))
          body = { allowed: active, mini: false };
        else if (path.endsWith("/profiles"))
          body = { state, version, display_name: "QA инженер" };
        else if (path.endsWith("/apply_operation")) {
          const op = route.request().postDataJSON();
          if (!seen.has(op.operation_id)) {
            state = op.body.state;
            version++;
            seen.add(op.operation_id);
          }
          body = { version };
        } else if (
          path.endsWith("/reward_events") ||
          path.endsWith("/mission_history")
        )
          body = [];
        else if (path.endsWith("/telegram_connections")) body = null;
        await route.fulfill({
          status: 200,
          json: body,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
          },
        });
      },
    );
    await use(page);
  },
});
export { expect };
