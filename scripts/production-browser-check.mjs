import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const url = "https://andrey1904-dev.github.io/PWADevOps/";
const browser = await chromium.launch();
const reports = [];
mkdirSync("artifacts", { recursive: true });
try {
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({
      viewport,
      serviceWorkers: "allow",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const response = await page.goto(url);
    await page
      .getByRole("heading", { name: "Каждый шаг — ближе к цели." })
      .waitFor();
    const build = await page
      .locator('meta[name="devops-build"]')
      .getAttribute("content");
    if (process.env.EXPECTED_SHA && build !== process.env.EXPECTED_SHA)
      throw Error("Stale production build");
    if (response.status() !== 200) throw Error("HTTP failure");
    for (const label of [
      "План обучения",
      "Календарь",
      "Статистика",
      "Настройки",
      "Главная",
    ]) {
      await page.getByRole("button", { name: label, exact: true }).click();
    }
    await page.getByRole("combobox").selectOption("solved");
    await page.reload();
    await page
      .getByRole("heading", { name: "Каждый шаг — ближе к цели." })
      .waitFor();
    if ((await page.getByRole("combobox").inputValue()) !== "solved")
      throw Error("Progress did not persist");
    await page.getByText("50 XP", { exact: true }).waitFor();
    await page.evaluate(async () => navigator.serviceWorker.ready);
    await page.reload();
    await context.setOffline(true);
    await page.reload();
    await page
      .getByRole("heading", { name: "Каждый шаг — ближе к цели." })
      .waitFor();
    await context.setOffline(false);
    await page.reload();
    await page
      .getByRole("heading", { name: "Каждый шаг — ближе к цели." })
      .waitFor();
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    );
    if (!fits || errors.length)
      throw Error("Production layout or JavaScript errors");
    await page.screenshot({
      path: `artifacts/production-${name}.png`,
      fullPage: true,
    });
    reports.push({
      name,
      url,
      build,
      http: response.status(),
      navigation: true,
      progress_reload: true,
      xp: true,
      offline_reload: true,
      reconnect: true,
      layout_fits: fits,
      javascript_errors: errors,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
const result = { ok: true, checked_at: new Date().toISOString(), reports };
writeFileSync(
  "artifacts/production-browser.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result));
