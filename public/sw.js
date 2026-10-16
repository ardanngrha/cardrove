// No response cache: private cards, sessions, signed media, and APIs stay on the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate' || url.origin !== self.location.origin || !['/', '/index.html'].includes(url.pathname)) return;
  event.respondWith(fetch(event.request).catch(() => new Response(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connection needed · Cardrove</title><style>body{margin:0;background:#f7f5f0;color:#2c2b27;font:16px/1.7 system-ui,sans-serif}main{max-width:32rem;margin:15vh auto;padding:24px}h1{font:42px/1.1 Georgia,serif}a{display:inline-block;padding:12px 20px;background:#a84426;color:#fffefb;border-radius:5px}a:focus-visible{outline:3px solid #2c2b27;outline-offset:5px}p{margin:24px 0}</style></head><body><main><p>Cardrove.</p><h1>A connection to continue.</h1><p>Connect to the internet or your local server, then try again. Your cards and progress are stored on your server. Offline study is not available.</p><p lang="id">Hubungkan ke internet atau server lokalmu, lalu coba lagi. Kartu dan progress tersimpan di server. Belajar offline belum tersedia.</p><a href="/">Try again / Coba lagi</a></main></body></html>`, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" },
  })));
});
