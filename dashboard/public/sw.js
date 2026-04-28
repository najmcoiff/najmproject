// Service Worker — Najm Coiff Dashboard PWA
const CACHE_NAME = "najmcoiff-v1";
const SHELL_URLS = ["/", "/dashboard", "/logo.png", "/manifest.json"];

// Installation : mise en cache du shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

// Activation : nettoyage des anciens caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  event.waitUntil(clients.claim());
});

// Fetch : network-first pour les API, cache-first pour le shell
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Ne jamais intercepter les requêtes API ou Supabase
  if (
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("supabase") ||
    url.hostname.includes("vercel") ||
    event.request.method !== "GET"
  ) {
    return;
  }

  // Navigation : network-first, fallback vers /dashboard si offline
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match("/dashboard").then((r) => r || caches.match("/"))
      )
    );
    return;
  }

  // Assets statiques : cache-first
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/logo.png" ||
    url.pathname === "/manifest.json"
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }
});

// Push notifications
self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  const title = data.title || "Najm Coiff";
  const options = {
    body: data.body || "",
    icon: "/logo.png",
    badge: "/logo.png",
    vibrate: [200, 100, 200],
    tag: data.tag || "default",
    renotify: true,
    data: { url: data.url || "/dashboard" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Clic sur notification → ouvrir ou focus le dashboard
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes("/dashboard") && "focus" in client) {
          client.postMessage({ type: "NAVIGATE", url });
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
