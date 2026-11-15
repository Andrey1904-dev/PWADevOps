import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
const url = "https://andrey1904-dev.github.io/PWADevOps/";
const api = "https://okswmvxxoataxprjwzjv.supabase.co";
const key = "sb_publishable_EdGQ5pNgOy5CuNMdaDU76Q_TcQeuGGT";
const live = process.env.LIVE_AUTH_FILE
  ? JSON.parse(readFileSync(process.env.LIVE_AUTH_FILE, "utf8"))
  : null;
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
      .getByRole("heading", { name: "Твой путь в DevOps начинается здесь." })
      .waitFor();
    const build = await page
      .locator('meta[name="devops-build"]')
      .getAttribute("content");
    if (process.env.EXPECTED_SHA && build !== process.env.EXPECTED_SHA)
      throw Error("Stale production build");
    if (response.status() !== 200 || (await page.locator("nav").count()))
      throw Error("Public gate failed");
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    );
    if (!fits) throw Error("Layout overflow");
    await page.screenshot({
      path: `artifacts/production-auth-${name}.png`,
      fullPage: true,
      animations: "disabled",
    });
    const report = {
      name,
      url,
      build,
      http: response.status(),
      public_gate: true,
      layout_fits: fits,
      javascript_errors: errors,
    };
    if (live) {
      await page.getByRole("button", { name: "Войти", exact: true }).click();
      await page.getByLabel("Email", { exact: true }).fill(live.email);
      await page
        .getByLabel("Пароль", { exact: true })
        .fill("intentionally-wrong-password-003");
      await page.getByRole("button", { name: "Войти", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "Неверный" }).waitFor();
      if (await page.locator("nav").count())
        throw Error("Wrong password exposed cabinet");
      report.wrong_password_denied = true;
      await page.getByLabel("Пароль", { exact: true }).fill(live.password);
      await page.getByRole("button", { name: "Войти", exact: true }).click();
      await page
        .getByRole("heading", { name: "Каждый шаг — ближе к цели." })
        .waitFor();
      report.real_password_login = true;
      await page.getByRole("combobox").selectOption("in_progress");
      await page.waitForResponse(
        (r) => r.url().includes("/rpc/apply_operation") && r.status() === 200,
      );
      await page.reload();
      await page
        .getByRole("heading", { name: "Каждый шаг — ближе к цели." })
        .waitFor();
      if ((await page.getByRole("combobox").inputValue()) !== "in_progress")
        throw Error("Progress reload failed");
      report.real_progress_persisted = true;
      report.session_restored_after_reload = true;
      const oldSession = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("sb-okswmvxxoataxprjwzjv-auth-token")),
      );
      await page
        .getByRole("button", { name: "Настройки", exact: true })
        .click();
      const logoutResponse = page.waitForResponse((r) =>
        r.url().includes("/auth/v1/logout"),
      );
      await page.getByRole("button", { name: "Выйти", exact: true }).click();
      await page
        .getByRole("heading", { name: "Твой путь в DevOps начинается здесь." })
        .waitFor();
      await logoutResponse;
      report.logout_gate = true;
      const denied = await fetch(api + "/rest/v1/profiles?select=id", {
        headers: {
          apikey: key,
          Authorization: "Bearer " + oldSession.access_token,
        },
      });
      const deniedBody = await denied.json();
      if (denied.ok && (!Array.isArray(deniedBody) || deniedBody.length))
        throw Error("Old JWT still reads private data");
      report.old_jwt_data_denied = true;
      await page.evaluate((session) => {
        localStorage.removeItem("devops-quest-signed-out");
        localStorage.setItem(
          "sb-okswmvxxoataxprjwzjv-auth-token",
          JSON.stringify(session),
        );
      }, oldSession);
      await page.reload();
      await page
        .getByRole("heading", { name: "Твой путь в DevOps начинается здесь." })
        .waitFor();
      if (await page.locator("nav").count())
        throw Error("Revoked session restored cabinet");
      report.revoked_session_gate = true;
    }
    await page.evaluate(async () => navigator.serviceWorker.ready);
    await page.reload();
    await page
      .getByRole("heading", { name: "Твой путь в DevOps начинается здесь." })
      .waitFor();
    await context.setOffline(true);
    await page.reload();
    await page
      .getByRole("heading", { name: "Твой путь в DevOps начинается здесь." })
      .waitFor();
    if (await page.locator("nav").count())
      throw Error("Offline reload exposed cabinet");
    await context.setOffline(false);
    report.offline_auth_shell = true;
    if (errors.length) throw Error("Production JS errors");
    reports.push(report);
    await context.close();
  }
} finally {
  await browser.close();
}
const result = {
  ok: true,
  real_auth_requests: !!live,
  checked_at: new Date().toISOString(),
  reports,
};
writeFileSync(
  "artifacts/production-browser-003.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result));
