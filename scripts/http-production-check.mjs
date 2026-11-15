import { mkdirSync, writeFileSync } from "node:fs";
const url = "https://andrey1904-dev.github.io/PWADevOps/";
const expected = process.env.GITHUB_SHA;
let report;
for (let attempt = 0; attempt < 12; attempt++) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    const html = await response.text();
    if (!response.ok || !html.includes("DEVOPS QUEST"))
      throw Error("Production HTML unavailable");
    const build = html.match(/name="devops-build" content="([^"]+)"/)?.[1];
    if (expected && build !== expected)
      throw Error("Waiting for current release");
    const asset = html
      .match(/src="([^"]+\.js)"/g)
      ?.map((s) => s.slice(5, -1))
      .find((s) => s.includes("/assets/"));
    if (!asset || (await fetch(new URL(asset, url))).status !== 200)
      throw Error("Application bundle unavailable");
    const manifestResponse = await fetch(new URL("manifest.webmanifest", url));
    const manifest = await manifestResponse.json();
    if (
      manifest.scope !== "/PWADevOps/" ||
      manifest.start_url !== "/PWADevOps/"
    )
      throw Error("Incorrect PWA scope");
    if ((await fetch(new URL("sw.js", url))).status !== 200)
      throw Error("Service Worker unavailable");
    report = {
      ok: true,
      url,
      build,
      html_status: response.status,
      manifest_scope: manifest.scope,
      checked_at: new Date().toISOString(),
    };
    break;
  } catch (error) {
    if (attempt === 11) throw error;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
mkdirSync("artifacts", { recursive: true });
writeFileSync(
  "artifacts/production-http.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
