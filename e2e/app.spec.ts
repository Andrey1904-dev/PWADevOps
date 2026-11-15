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
