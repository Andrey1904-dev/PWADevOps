import { fixtureId, test, expect } from "./protected-fixture";
test("career attempts, hint gate, persistence and legacy return", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "System Administrator", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "System Administrator Quest",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Открыть миссию" }).first().click();
  await expect(
    page.getByRole("button", {
      name: "Показать разбор (не подтверждает навык)",
    }),
  ).toHaveCount(0);
  await page.getByLabel("Маска /24?").fill("255.255.255.0");
  await page.getByLabel("Адрес сети?").fill("192.168.10.0");
  await page.getByLabel("Шлюз для внешней сети?").fill("192.168.10.1");
  await page.getByRole("button", { name: "Подсказка 1", exact: true }).click();
  await page.getByRole("button", { name: "Проверить попытку" }).click();
  await expect(page.getByText(/подсказки: 1/i).first()).toBeVisible();
  await page
    .getByRole("button", { name: "Показать разбор (не подтверждает навык)" })
    .click();
  await page.getByRole("button", { name: "Новая попытка" }).click();
  await expect(page.getByLabel("Маска /24?")).toHaveValue("");
  await page.reload();
  await page
    .getByRole("button", { name: "System Administrator", exact: true })
    .click();
  await expect(
    page.getByText("1/7 симуляций пройдено.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "JOB READY", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "JOB READY: SYSTEM ADMINISTRATOR" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "DevOps RPG", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "System Administrator Quest",
      exact: true,
    }),
  ).toHaveCount(0);
  const width = await page.evaluate(
    () => document.documentElement.scrollWidth <= innerWidth,
  );
  expect(width).toBe(true);
});
test("boss requires all missions and preserves manual review report", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "System Administrator", exact: true })
    .click();
  await expect(
    page
      .getByRole("article")
      .filter({
        has: page.getByRole("heading", {
          name: "Босс №001: Офис остался без сети",
        }),
      })
      .getByRole("button", { name: "Открыть миссию" }),
  ).toBeDisabled();
  const answers = [
    ["255.255.255.0", "192.168.10.0", "192.168.10.1"],
    ["DHCP", "кабель"],
    ["DNS", "dig"],
    ["default", "tracert"],
    ["локально", "443"],
    ["DNS", "routing"],
  ];
  for (let i = 0; i < 6; i++) {
    await page.getByRole("button", { name: "Открыть миссию" }).nth(i).click();
    const fields = page.locator(".career article > label input");
    for (let j = 0; j < answers[i].length; j++)
      await fields.nth(j).fill(answers[i][j]);
    await page.getByRole("button", { name: "Проверить попытку" }).click();
    await page.getByRole("button", { name: "Карта глав", exact: true }).click();
  }
  await page.getByRole("button", { name: "Открыть миссию" }).last().click();
  const fields = page.locator(".career article > label input");
  for (const [i, a] of ["DHCP", "DNS", "сервис"].entries())
    await fields.nth(i).fill(a);
  await page
    .getByRole("textbox", { name: /Журнал:/ })
    .fill(
      "A: проверяю кабель, VLAN и DHCP. B: DNS и путь до резолвера. C: listener и журнал сервиса. Изменения только на стенде. Повторяю аренду, DNS и HTTPS после исправления.",
    );
  await page.getByRole("button", { name: "Проверить попытку" }).click();
  await expect(page.getByText(/Короткие ответы верны/)).toBeVisible();
  await page.getByLabel("Проверяющий", { exact: true }).fill("Наставник QA");
  await page
    .getByLabel("Обоснование оценки")
    .fill(
      "Проверены три причины, команды и контроль. Это тест ручного журнала, не реальная оценка ученика.",
    );
  await page.getByRole("button", { name: "Записать ручной зачёт" }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "System Administrator", exact: true })
    .click();
  await expect(
    page.getByText("7/7 симуляций пройдено.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "JOB READY", exact: true }).click();
  await expect(page.getByText(/boss-001: passed/)).toBeVisible();
});
test("real lab draft and manual evidence survive reload without automatic confirmation", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "System Administrator", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Реальная лаборатория", exact: true })
    .click();
  const journal =
    "Ubuntu ARM64 изолированная VM. ip -4 addr: 192.168.64.2/24, route: default via 192.168.64.1. DNS query и curl сохранены в журнале. Это фикстура проверки хранения, не реальная лаборатория.";
  await page.getByLabel("Журнал лаборатории").fill(journal);
  await page.reload();
  await page
    .getByRole("button", { name: "System Administrator", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Реальная лаборатория", exact: true })
    .click();
  await expect(page.getByLabel("Журнал лаборатории")).toHaveValue(journal);
  await page
    .getByRole("button", { name: "Отправить на ручную проверку" })
    .click();
  await expect(page.getByText(/pending-review/)).toBeVisible();
  await page.getByRole("button", { name: "JOB READY", exact: true }).click();
  await expect(
    page.getByText("network.ip: реальная практика не подтверждена", {
      exact: false,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("JSON backup, restore and rollback preserve both career and legacy data", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("combobox").selectOption("solved");
  await page.reload();
  await expect(page.getByRole("combobox")).toHaveValue("solved");
  const legacyKey = `devops-quest-v1:${fixtureId}`;
  const legacy = await page.evaluate((key) => {
    const data = JSON.parse(localStorage.getItem(key)!);
    return { progress: data.progress, current: data.current };
  }, legacyKey);
  await page
    .getByRole("button", { name: "System Administrator", exact: true })
    .click();
  await page.getByRole("button", { name: "Открыть миссию" }).first().click();
  await page.getByLabel("Маска /24?").fill("255.255.255.0");
  await page.getByLabel("Адрес сети?").fill("192.168.10.0");
  await page.getByLabel("Шлюз для внешней сети?").fill("192.168.10.1");
  await page.getByRole("button", { name: "Проверить попытку" }).click();
  await page.getByRole("button", { name: "JOB READY", exact: true }).click();
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Резервная копия JSON", exact: true })
    .click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("sysadmin-backup.json");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const backup = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(backup.attempts).toHaveLength(1);
  expect(backup.attempts[0].result).toBe("passed");
  const careerKey = `artsofte-quest-v1:${fixtureId}`;
  const before = await page.evaluate((k) => localStorage.getItem(k), careerKey);
  const input = page.getByLabel("Восстановить копию JSON");
  await input.setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"schema":2}'),
  });
  await expect(
    page.getByRole("status").filter({ hasText: "Копия не принята" }),
  ).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), careerKey)).toBe(
    before,
  );
  await input.setInputFiles({
    name: "empty.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ schema: 1, attempts: [], drafts: {}, deferred: {} }),
    ),
  });
  expect(
    JSON.parse(
      (await page.evaluate((k) => localStorage.getItem(k), careerKey))!,
    ).attempts,
  ).toHaveLength(0);
  expect(
    await page.evaluate(
      (k) => localStorage.getItem(k + ":before-restore"),
      careerKey,
    ),
  ).toBe(before);
  await page
    .getByRole("button", { name: "Вернуть состояние до импорта", exact: true })
    .click();
  expect(await page.evaluate((k) => localStorage.getItem(k), careerKey)).toBe(
    before,
  );
  await input.setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.reload();
  await expect(page.getByRole("combobox")).toHaveValue("solved");
  const after = await page.evaluate((key) => {
    const data = JSON.parse(localStorage.getItem(key)!);
    return { progress: data.progress, current: data.current };
  }, legacyKey);
  expect(after).toEqual(legacy);
  await page.getByRole("button", { name: "Общие навыки", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "JOB READY: SYSTEM ADMINISTRATOR" }),
  ).toBeVisible();
  await expect(page.getByText(/net-ip: passed/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("lab manual review requires evidence, supports rejection and persists acceptance", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "System Administrator", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Реальная лаборатория", exact: true })
    .click();
  await page
    .getByLabel("Журнал лаборатории")
    .fill(
      "Тестовая запись QA, не реальная лаборатория. Ubuntu ARM64: ip addr, ip route, DNS query, ss и curl. Наставник воспроизводит процедуру, проверяет маску, шлюз, DNS и HTTPS и записывает ограничения тестирования.",
    );
  await page
    .getByRole("button", { name: "Отправить на ручную проверку", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Записать ручное подтверждение", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Нужны имя проверяющего" }),
  ).toBeVisible();
  await expect(page.getByText(/pending-review/)).toBeVisible();
  await page
    .getByLabel("Наставник", { exact: true })
    .fill("QA fixture reviewer");
  await page
    .getByLabel("Результаты воспроизведения и контрольные вопросы")
    .fill(
      "Тест отклонения записи: результаты DNS не приложены. Это только QA фикстура.",
    );
  await page
    .getByRole("button", { name: "Вернуть на доработку", exact: true })
    .click();
  await expect(page.getByText(/· retry/)).toBeVisible();
  await page
    .getByRole("button", { name: "Отправить на ручную проверку", exact: true })
    .click();
  await page
    .getByLabel("Результаты воспроизведения и контрольные вопросы")
    .fill(
      "Тест приёмки записи: процедура воспроизведена, разобраны IP/CIDR, маршрут, DNS и порт. Это QA фикстура, а не проверка реального стенда.",
    );
  await page
    .getByRole("button", { name: "Записать ручное подтверждение", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Общие навыки", exact: true }).click();
  await expect(
    page.getByText("network.ip: ручная проверка лаборатории записана", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByText(/net-lab: retry/)).toBeVisible();
  await expect(page.getByText(/net-lab: passed/)).toBeVisible();
  await expect(
    page.getByText("network.vpn: реальная практика не подтверждена", {
      exact: false,
    }),
  ).toBeVisible();
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Экспорт Markdown", exact: true })
    .click();
  const download = await event;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const report = Buffer.concat(chunks).toString("utf8");
  expect(report).toContain("не коммерческий опыт");
  expect(report).toContain("QA fixture reviewer");
  expect(report).not.toContain("Результат: pending-review");
  expect(report).toContain("Результат: retry");
  expect(report).toContain("Результат: passed");
});
