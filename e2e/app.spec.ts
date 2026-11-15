import { test, expect } from "@playwright/test";
test("local progress, timer, persistence, calendar and offline editing", async ({
  page,
  context,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Каждый шаг — ближе к цели." }),
  ).toBeVisible();
  await expect(
    page.getByText("Файлы и обработка ошибок", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("0 подтверждено проверкой")).toBeVisible();
  await page.getByRole("combobox").selectOption("solved");
  await page
    .getByRole("button", { name: "Начать занятие", exact: true })
    .click();
  await page.getByRole("button", { name: "Завершить", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Занятие сохранено");
  await page.reload();
  await expect(page.getByRole("combobox")).toHaveValue("solved");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByLabel("Первая рабочая смена цикла 2/2").fill("2026-11-15");
  await page.getByRole("button", { name: "Календарь", exact: true }).click();
  await expect(page.locator(".calendar article")).toHaveCount(28);
  await expect(page.locator(".calendar .work")).toHaveCount(14);
  await page.getByRole("button", { name: "Главная", exact: true }).click();
  await context.setOffline(true);
  await page.getByRole("combobox").selectOption("verified");
  await expect(page.getByText("1 подтверждено проверкой")).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole("combobox")).toHaveValue("verified");
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `artifacts/${info.project.name}.png`,
    fullPage: true,
  });
});
test("curriculum edits persist and mobile layout fits", async ({ page }) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "План обучения", exact: true })
    .click();
  await page.getByText("Изменить главу и даты").click();
  await page
    .getByLabel("Название", { exact: true })
    .fill("Python: мой маршрут");
  await page.getByLabel("Плановый месяц").fill("2026-12");
  await page.reload();
  await page
    .getByRole("button", { name: "План обучения", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Python: мой маршрут" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("production PWA caches shell for offline reload", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Каждый шаг — ближе к цели." }),
  ).toBeVisible();
  const manifest = await page.request.get("./manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).icons).toHaveLength(2);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Каждый шаг — ближе к цели." }),
  ).toBeVisible();
  await context.setOffline(false);
});

test("XP is not doubled by status toggles or reload", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible();
  await page.getByRole("combobox").selectOption("solved");
  await expect(page.getByText("50 XP", { exact: true })).toBeVisible();
  await page.getByRole("combobox").selectOption("verified");
  await expect(page.getByText("100 XP", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("100 XP", { exact: true })).toBeVisible();
});
test("Mini App adapts theme and Telegram Back without creating another UI", async ({
  page,
}) => {
  await page.route("**/telegram.org/js/telegram-web-app.js", (route) =>
    route.fulfill({ body: "", contentType: "application/javascript" }),
  );
  await page.route("**/functions/v1/telegram-auth", (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: "LINK_REQUIRED" }),
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
  await page.addInitScript(() => {
    let back: (() => void) | undefined;
    window.Telegram = {
      WebApp: {
        initData: "test-signed-by-adapter",
        colorScheme: "light",
        themeParams: {},
        ready: () => {},
        expand: () => {},
        setHeaderColor: () => {},
        setBackgroundColor: () => {},
        onEvent: () => {},
        offEvent: () => {},
        BackButton: {
          show: () => {
            document.documentElement.dataset.back = "shown";
          },
          hide: () => {
            document.documentElement.dataset.back = "hidden";
          },
          onClick: (f) => {
            back = f;
            (window as unknown as { testBack: () => void }).testBack = () =>
              back?.();
          },
          offClick: () => {},
        },
      },
    };
  });
  await page.goto("./");
  await expect(page.getByText("Твой путь инженера — здесь.")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-telegram-theme",
    "light",
  );
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-back", "shown");
  await page.evaluate(() =>
    (window as unknown as { testBack: () => void }).testBack(),
  );
  await expect(
    page.getByRole("heading", { name: "Каждый шаг — ближе к цели." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("corrupted local data produces recoverable screen and preserves original", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "devops-quest-v1:local",
      '{"current":"missing","settings":{}}',
    ),
  );
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Не удалось открыть локальные данные" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("devops-quest-v1:local")),
  ).toContain("missing");
  await expect(
    page.getByRole("button", { name: "Скачать локальную копию" }),
  ).toBeVisible();
});

test("login loads cloud mission before allowing edits instead of waiting polling interval", async ({
  page,
}) => {
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "fixture@example.com",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-11-15T00:00:00Z",
  };
  const encode = (x: unknown) =>
    Buffer.from(JSON.stringify(x)).toString("base64url");
  const token =
    encode({ alg: "HS256", typ: "JWT" }) +
    "." +
    encode({
      sub: user.id,
      aud: "authenticated",
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    }) +
    ".test_signature";
  await page.route(
    "https://okswmvxxoataxprjwzjv.supabase.co/**",
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      let body: unknown = null;
      if (path.endsWith("/token"))
        body = {
          access_token: token,
          refresh_token: "test-refresh",
          expires_in: 3600,
          token_type: "bearer",
          user,
        };
      else if (path.endsWith("/user")) body = user;
      else if (path.endsWith("/profiles"))
        body = {
          version: 7,
          state: {
            current: "2-1",
            progress: {},
            sessions: [],
            active: null,
            settings: {
              anchor: "",
              timezone: "",
              work: 35,
              rest: 150,
              heavy: 12,
              paused: false,
              reminders: false,
              quietStart: "22:00",
              quietEnd: "08:00",
            },
          },
        };
      else if (
        path.endsWith("/reward_events") ||
        path.endsWith("/mission_history")
      )
        body = [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
        },
      });
    },
  );
  await page.goto("./");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("fixture@example.com");
  await page.getByLabel("Пароль", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(
    page.getByText("fixture@example.com", { exact: true }).last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Главная", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Python: автоматизация", exact: true }),
  ).toBeVisible();
});

test("personal cycle and energy buttons keep current mission and allow explicit boss scheduling", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-17T12:00:00Z"));
  await page.goto("./");
  await page
    .getByRole("button", { name: "Сегодня мало сил", exact: true })
    .click();
  await expect(page.getByText("Лёгкий ориентир: 12 минут")).toBeVisible();
  await page
    .getByRole("button", { name: "Есть время на большее", exact: true })
    .click();
  await expect(page.getByText(/Ориентир: 44 минут/)).toBeVisible();
  await page.getByRole("button", { name: "Перенести", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("XP сохранён");
  await expect(
    page.getByRole("heading", {
      name: "Файлы и обработка ошибок",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Календарь", exact: true }).click();
  await expect(
    page.getByLabel("Тип дня 2026-11-17", { exact: true }),
  ).toHaveValue("work");
  await expect(
    page.getByLabel("Тип дня 2026-11-18", { exact: true }),
  ).toHaveValue("work");
  await expect(
    page.getByLabel("Тип дня 2026-11-19", { exact: true }),
  ).toHaveValue("rest");
  await page
    .getByLabel("Миссия 2026-11-17", { exact: true })
    .selectOption("1-20");
  await expect(page.getByText("Босс · 1-20", { exact: true })).toBeVisible();
  await page
    .getByLabel("Тип дня 2026-11-17", { exact: true })
    .selectOption("rest");
  await expect(
    page.getByLabel("Тип дня 2026-11-17", { exact: true }),
  ).toHaveValue("rest");
});
