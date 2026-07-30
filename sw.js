const CACHE = "integer-math-challenge-v3";
const CORE = [
  "./",
  "./index.html",
  "./app.js",
  "./style.css",
  "./cute.css",
  "./manifest.webmanifest",
  "./social-preview.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/mascot-dino-idle-v2.png",
  "./icons/mascot-dino-happy-v2.png",
  "./icons/mascot-dino-confused-v2.png",
  "./icons/mascot-dino-combo-v2.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html"))),
  );
});
