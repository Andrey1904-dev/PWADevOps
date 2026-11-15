/* One-time security upgrade. Only this PWA's windows are reloaded; local data is preserved. */
let upgradeExistingClient = false;
const authMarker = "devops-quest-auth-v3:" + self.registration.scope;
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      upgradeExistingClient =
        !!self.registration.active && !(await caches.has(authMarker));
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await caches.open(authMarker);
      if (upgradeExistingClient) {
        const windows = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        await Promise.allSettled(
          windows
            .filter((client) => client.url.startsWith(self.registration.scope))
            .map((client) => client.navigate(client.url)),
        );
      }
    })(),
  );
});
