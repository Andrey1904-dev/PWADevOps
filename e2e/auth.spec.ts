import { test, expect } from "@playwright/test";
import { fixtureUser, fixtureToken } from "./protected-fixture";
function session() {
  return {
    access_token: fixtureToken(),
    refresh_token: "test-refresh",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: fixtureUser,
  };
}
test("visitor sees only authorization, even with cached progress and private screen query", async ({
  page,
}) => {
  let dataCalls = 0;
  await page.route("**/rest/v1/**", (r) => {
    dataCalls++;
    return r.fulfill({ json: [] });
  });
  await page.addInitScript(() =>
    localStorage.setItem(
      "devops-quest-v1:local",
      JSON.stringify({
        current: "1-18",
        progress: { "1-18": { status: "verified" } },
      }),
    ),
  );
  await page.goto("./?screen=plan");
  await expect(
    page.getByRole("heading", { name: "Твой путь в DevOps начинается здесь." }),
  ).toBeVisible();
  await expect(page.locator("nav")).toHaveCount(0);
  await expect(
    page.getByText("Файлы и обработка ошибок", { exact: true }),
  ).toHaveCount(0);
  expect(dataCalls).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `artifacts/auth-${test.info().project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
});
test("registration validates fields and shows confirmation/resend without entering cabinet", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/auth/v1/signup**", async (route) => {
    calls++;
    const body = route.request().postDataJSON();
    expect(body.data.display_name).toBe("Андрей QA");
    expect(route.request().url()).toContain("redirect_to=");
    await route.fulfill({
      json: {
        user: { ...fixtureUser, email_confirmed_at: null },
        session: null,
      },
    });
  });
  await page.goto("./");
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await page.getByLabel("Имя пользователя", { exact: true }).fill("Андрей QA");
  await page.getByLabel("Email", { exact: true }).fill("bad");
  await page.getByLabel("Пароль", { exact: true }).fill("long-password");
  await page.getByLabel("Повтор пароля", { exact: true }).fill("different");
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("email");
  expect(calls).toBe(0);
  await page.getByLabel("Email", { exact: true }).fill("fixture@example.com");
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("совпадают");
  expect(calls).toBe(0);
  await page.getByLabel("Повтор пароля", { exact: true }).fill("long-password");
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Проверь почту" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Отправить повторно через/ }),
  ).toBeDisabled();
  await expect(page.locator("nav")).toHaveCount(0);
  expect(calls).toBe(1);
});
test("wrong password stays public; valid login, reload and logout obey the gate", async ({
  page,
}) => {
  let active = false;
  await page.route(
    "https://okswmvxxoataxprjwzjv.supabase.co/**",
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/token")) {
        if (route.request().postDataJSON().password === "wrong-pass")
          return route.fulfill({
            status: 400,
            json: {
              code: "invalid_credentials",
              message: "Invalid credentials",
            },
          });
        active = true;
        return route.fulfill({ json: session() });
      }
      if (path.endsWith("/user"))
        return route.fulfill({
          status: active ? 200 : 401,
          json: active
            ? fixtureUser
            : { code: "bad_jwt", message: "Invalid JWT" },
        });
      if (path.endsWith("/logout")) {
        active = false;
        return route.fulfill({ json: {} });
      }
      if (path.endsWith("/mini_session_status"))
        return route.fulfill({ json: { allowed: active, mini: false } });
      if (path.endsWith("/profiles"))
        return route.fulfill({ json: { state: {}, version: 0 } });
      return route.fulfill({
        json:
          path.endsWith("/reward_events") || path.endsWith("/mission_history")
            ? []
            : null,
      });
    },
  );
  await page.goto("./");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("fixture@example.com");
  await page.getByLabel("Пароль", { exact: true }).fill("wrong-pass");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Неверный");
  await expect(page.locator("nav")).toHaveCount(0);
  await page.getByLabel("Пароль", { exact: true }).fill("correct-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Каждый шаг — ближе к цели." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Каждый шаг — ближе к цели." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Твой путь в DevOps начинается здесь." }),
  ).toBeVisible();
  await expect(page.locator("nav")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("nav")).toHaveCount(0);
});
test("password recovery explains real API rate-limit failures and remains usable", async ({
  page,
}) => {
  await page.route("**/auth/v1/recover**", (r) =>
    r.fulfill({
      status: 429,
      json: {
        code: "over_email_send_rate_limit",
        message: "email rate limit exceeded",
      },
    }),
  );
  await page.goto("./");
  await page
    .getByRole("button", { name: "Забыли пароль?", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill("fixture@example.com");
  await page
    .getByRole("button", { name: "Отправить ссылку", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Лимит");
  await expect(
    page.getByRole("button", { name: "Отправить ссылку", exact: true }),
  ).toBeEnabled();
  await expect(page.locator("nav")).toHaveCount(0);
});
test("revoked stored session cannot display cached cabinet even if getUser succeeds", async ({
  page,
}) => {
  await page.addInitScript(
    (s) =>
      localStorage.setItem(
        "sb-okswmvxxoataxprjwzjv-auth-token",
        JSON.stringify(s),
      ),
    session(),
  );
  await page.route("**/auth/v1/user", (r) => r.fulfill({ json: fixtureUser }));
  await page.route("**/rest/v1/rpc/mini_session_status", (r) =>
    r.fulfill({ json: { allowed: false, mini: false } }),
  );
  await page.goto("./?screen=stats");
  await expect(page.getByRole("alert")).toContainText("Сессия завершена");
  await expect(page.locator("nav")).toHaveCount(0);
});
test("unlinked Telegram shows authorization without a second account", async ({
  page,
}) => {
  await page.route("**/telegram.org/js/telegram-web-app.js", (r) =>
    r.fulfill({ body: "", contentType: "application/javascript" }),
  );
  await page.addInitScript(() => {
    window.Telegram = {
      WebApp: {
        initData: "adapter-init",
        colorScheme: "dark",
        themeParams: {},
        ready: () => {},
        expand: () => {},
        setHeaderColor: () => {},
        setBackgroundColor: () => {},
        onEvent: () => {},
        offEvent: () => {},
        BackButton: {
          show: () => {},
          hide: () => {},
          onClick: () => {},
          offClick: () => {},
        },
      },
    };
  });
  await page.route("**/functions/v1/telegram-auth", (r) =>
    r.fulfill({ status: 409, json: { error: "LINK_REQUIRED" } }),
  );
  await page.goto("./");
  await expect(
    page.getByText(
      "Войди в существующий аккаунт, чтобы связать Telegram. Новый профиль автоматически не создаётся.",
    ),
  ).toBeVisible();
  await expect(page.locator("nav")).toHaveCount(0);
});

test("recovery callback shows password form without mounting cabinet", async ({
  page,
}) => {
  const s = session();
  await page.route(
    "https://okswmvxxoataxprjwzjv.supabase.co/**",
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/user")) return route.fulfill({ json: fixtureUser });
      if (path.endsWith("/mini_session_status"))
        return route.fulfill({ json: { allowed: true, mini: false } });
      return route.fulfill({ json: {} });
    },
  );
  await page.goto(
    "./#access_token=" +
      s.access_token +
      "&refresh_token=" +
      s.refresh_token +
      "&expires_in=3600&type=recovery&token_type=bearer",
  );
  await expect(
    page.getByRole("heading", { name: "Новый пароль", exact: true }),
  ).toBeVisible();
  await expect(page.locator("nav")).toHaveCount(0);
  await page
    .getByLabel("Новый пароль", { exact: true })
    .fill("new-strong-password");
  await page
    .getByLabel("Повтор пароля", { exact: true })
    .fill("new-strong-password");
  await page
    .getByRole("button", { name: "Сохранить пароль", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Пароль изменён");
  await expect(page.locator("nav")).toHaveCount(0);
});

test("legacy Telegram keyboard launch with empty initData gives a safe relaunch path", async ({
  page,
}) => {
  await page.route("**/telegram.org/js/telegram-web-app.js", (r) =>
    r.fulfill({ body: "", contentType: "application/javascript" }),
  );
  await page.addInitScript(() => {
    window.Telegram = {
      WebApp: {
        initData: "",
        platform: "ios",
        colorScheme: "dark",
        themeParams: {},
        ready: () => {},
        expand: () => {},
        setHeaderColor: () => {},
        setBackgroundColor: () => {},
        onEvent: () => {},
        offEvent: () => {},
        BackButton: {
          show: () => {},
          hide: () => {},
          onClick: () => {},
          offClick: () => {},
        },
      },
    };
  });
  let exchanges = 0;
  await page.route("**/functions/v1/telegram-auth", (r) => {
    exchanges++;
    return r.fulfill({
      status: 401,
      json: { error: "INVALID_OR_EXPIRED_INIT_DATA" },
    });
  });
  await page.goto("./");
  await expect(
    page.getByText("Telegram не передал данные входа при таком запуске.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Открыть правильную кнопку запуска" }),
  ).toHaveAttribute("href", "https://t.me/PwaDevOps_Bot?start=app");
  await expect(page.locator("nav")).toHaveCount(0);
  expect(exchanges).toBe(0);
});
