/* Service Worker：离线缓存 + stale-while-revalidate（先回缓存，后台更新，保证发版后能拿到新版） */
const CACHE = "sixthings-v17";
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
  // 规范化缓存 key：忽略 query 参数（?v= 版本号 / ?t= 防缓存时间戳）。
  // 否则每次带不同 query 的请求都会在缓存里新增一条记录，缓存无限膨胀，
  // 且带 ?v= 的请求无法命中 install 时缓存的无参版本，离线时可能失效。
  url.search = "";
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
