"use strict";

// Each edition registers this script at its own launch pathname on the same host.
const launch = new URL(self.registration.scope);
const page = launch.pathname.split("/").pop();
const shells = {
  "forecast-app.html": ["research.webmanifest", "architecture.css", "front-inference.css", "market-modality-theme.js"],
  "desk.html": ["paper-desk.webmanifest", "desk.css", "desk.js", "front-brief.css", "front-brief.js", "reasoning-3d.js"],
  "workbench.html": ["workbench.webmanifest", "architecture.css", "apps.css", "market-modality-theme.js", "workbench.js"]
};
const assets = new Set([page, ...shells[page], "style.css", "edition-install.js",
  "widget-icon-192.png", "widget-icon-512.png"].map(path => new URL(path, launch).href));
const cacheName = "phaseweave-browser-edition-v1:" + launch.pathname;

self.addEventListener("install", event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll([...assets])));
});
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || !assets.has(request.url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    try {
      const response = await fetch(request);
      if (response.ok && !response.redirected && response.type === "basic") {
        await cache.put(request.url, response.clone());
      }
      return response;
    } catch (error) {
      const saved = await cache.match(request.url);
      if (saved) return saved;
      throw error;
    }
  })());
});
