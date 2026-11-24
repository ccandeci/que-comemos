'use strict';

const cacheName = 'que-comemos-static-v2';
const files = [
  './', 'index.html', 'style.css', 'app.js', 'account.js', 'state-sync.js',
  'vendor/supabase.js', 'recipes.json', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png'
];
const assetPaths = new Set(files.map(file => new URL(file, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(files)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('que-comemos-static-') && k !== cacheName).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !assetPaths.has(request.url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    try {
      const response = await fetch(request);
      if (!response.ok) return (await cache.match(request)) || response;
      await cache.put(request, response.clone());
      return response;
    } catch {
      return await cache.match(request) || Response.error();
    }
  })());
});
