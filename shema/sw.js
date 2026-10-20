// This address moved to /verseloop/. Replaces the old offline worker here so
// the redirect page is always fetched fresh: clear its caches and step aside.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    .then(() => self.registration.unregister())
    .then(() => self.clients.matchAll({ type: "window" }))
    .then((clients) => clients.forEach((c) => c.navigate(c.url))));
});
