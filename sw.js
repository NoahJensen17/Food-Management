// Pass-through service worker: Chrome requires a fetch handler before it treats the
// app as installable. Nothing is cached, so users always get the latest deploy.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => e.respondWith(fetch(e.request)));
