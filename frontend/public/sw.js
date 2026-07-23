/**
 * Wallet76 Service Worker
 *
 * Strategy:
 *  - Static assets (JS, CSS, fonts, images) → Cache-first (fast loads)
 *  - API calls (/api/*)                     → Network-first (always fresh data)
 *  - Navigation (HTML)                      → Network-first with offline fallback
 */

// Bump this string whenever you want to force every open tab to drop its
// cached assets on the next activate (see the "activate" handler below,
// which deletes any cache key other than the current one). JS/CSS chunks
// are content-hashed by the build so they naturally bust on their own, but
// the precached "/" and "/dashboard" HTML entries aren't — without a bump
// here, a returning tab can keep serving old HTML/behaviour indefinitely.
// Paired with UpdateAvailableToast.jsx on the frontend, which prompts the
// user to reload as soon as a new service worker like this one installs.
//
// Bumped v2 -> v3 on 2026-07-05: "deploy fez mas no telemóvel continua
// igual" kept recurring even with skipWaiting()/clients.claim() below,
// because sw.js itself hadn't changed byte-for-byte between recent deploys
// (only app JS/CSS did) — no diff means the browser never even detects an
// update, so the old worker (and its stale index.html precache) just keeps
// controlling the page indefinitely. Also added explicit no-cache headers
// (frontend/vercel.json) and updateViaCache: "none" (serviceWorkerRegistration.js)
// so this doesn't need a manual bump every time going forward.
const CACHE_NAME = "wallet76-v5";
const OFFLINE_URL = "/";

// Assets to pre-cache on install
const PRECACHE_URLS = [
  "/",
  "/dashboard",
  "/offline.html",
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Best-effort precache — don't fail install if some assets are missing
      return Promise.allSettled(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => {}))
      );
    })
  );
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests.
  // Correção (17 jul 2026): a verificação antiga
  // `!url.origin.startsWith(self.location.origin.split("://")[0])` resolvia
  // para `!url.origin.startsWith("https")` — ou seja, só descartava pedidos
  // NÃO-https, deixando passar TODOS os GET https de outras origens (Google
  // Fonts, etc.) para dentro da lógica de cache do SW. Comparar a origem
  // completa descarta corretamente tudo o que é cross-origin.
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // ── API: network-first, no cache ──
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ error: "offline" }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    return;
  }

  // ── Static assets (JS/CSS/images/fonts): cache-first ──
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|ico|woff2?|ttf)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // ── Navigation (HTML): network-first, fallback to cached root ──
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match("/");
          return cached || new Response("<h1>Offline</h1>", {
            headers: { "Content-Type": "text/html" },
          });
        })
    );
    return;
  }
});

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { title: "Wallet76", body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Wallet76", {
      body: payload.body || "",
      icon: "/icon-192x192.png",
      badge: "/icon-72x72.png",
      tag: payload.tag || "wallet76",
      data: { url: payload.url || "/dashboard" },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
