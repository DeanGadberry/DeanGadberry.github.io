// Offline cache. App files: stale-while-revalidate (instant, updates in the
// background). Audio clips: cache-first, and the open book is prefetched
// once the page asks for it. Bump AUDIO when the clips are rebuilt.
const SHELL = "shell-v9";
const AUDIO = "audio-v5";
const SHELL_FILES = ["./", "index.html", "app.js", "style.css", "data/books.json", "manifest.webmanifest", "icon.svg", "icon-192.png",
  "fonts/ebgaramond-latin-normal.woff2", "fonts/ebgaramond-latin-italic.woff2", "fonts/ebgaramond-greek-normal.woff2"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== AUDIO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.includes("/audio/")) {
    e.respondWith(caches.open(AUDIO).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  e.respondWith(caches.open(SHELL).then(async (c) => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then((res) => {
      if (res.ok) c.put(e.request, res.clone());
      return res;
    });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  }));
});

self.addEventListener("message", (e) => {
  if (e.data?.type === "prefetch-book" && /^[a-z0-9]+$/.test(e.data.book)) e.waitUntil(prefetchBook(e.data.book));
});

async function prefetchBook(id) {
  const base = new URL("./", self.registration.scope);
  const book = await (await fetch(new URL(`data/${id}.json`, base))).json();
  const urls = [];
  const most = Math.max(...book.chapters.map((ch) => Math.max(ch.c, ch.verses.length)));
  for (let n = 1; n <= most; n++) urls.push(`audio/num/${n}.mp3`);
  for (const ms of [300, 800, 1600, 3000]) urls.push(`audio/s/${ms}.mp3`);
  for (const ch of book.chapters) {
    for (const v of ch.verses) urls.push(`audio/${id}/${ch.c}-${v.v}.mp3`);
  }
  const cache = await caches.open(AUDIO);
  const todo = [];
  for (const u of urls) {
    const req = new Request(new URL(u, base));
    if (!(await cache.match(req))) todo.push(req);
  }
  const worker = async () => {
    for (let req; (req = todo.shift());) {
      try { const res = await fetch(req); if (res.ok) await cache.put(req, res); } catch {}
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}
