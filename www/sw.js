/* Service Worker：离线缓存 + stale-while-revalidate（先回缓存，后台更新，保证发版后能拿到新版） */
const CACHE = "sixthings-v19";
const ASSETS = [
  "./", "./index.html", "./styles.css", "./app.js", "./sync.js",
  "./manifest.webmanifest",
  "./vendor/supabase.umd.js", "./vendor/qrcode.min.js", "./vendor/jsqr.js",
  "./icons/icon-192.png", "./icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // 不拦截跨域
  // 规范化缓存 key：仅忽略 ?t= 防缓存时间戳（每次访问都不同，会导致缓存无限膨胀）。
  // 注意：绝不能忽略 ?v= 版本号 —— index.html 用 ?v= 加载 app.js/sync.js/styles.css，
  // 若忽略版本号会命中旧版本缓存，导致发版后用户仍加载旧代码。
  const qs = new URLSearchParams(url.search);
  qs.delete("t");
  url.search = qs.toString();
  const key = url.href;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(key);
      const network = fetch(e.request)
        .then((res) => {
          if (res && res.ok) cache.put(key, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
