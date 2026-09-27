// Service Worker بسيط: يجعل المنصة قابلة للتثبيت كتطبيق (PWA) ويخزن الملفات الثابتة فقط.
// لا يخزن الصفحات ولا التسجيلات أبداً (خصوصية + حماية المحتوى).
const CACHE = 'edaat-static-v4'
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/static/app.css?v=4', '/static/app.js?v=4', '/static/landing.css?v=4', '/static/landing.js?v=4', '/static/icon.svg'])))
  self.skipWaiting()
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))))
  self.clients.claim()
})
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith('/static/')) return
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)))
})
