/* ---- service worker ----
   Spendly is one 600 KB file. Caching it means that after a single visit it opens
   with no network at all: on a phone with no signal, on a plane, with GitHub down.
   That matters more here than for most apps, because the thing you reach for it to
   do — log what you just spent — happens in shops and taxis, not at a desk.

   The shell is stale-while-revalidate. You get the cached copy immediately, which
   is what makes a 600 KB file open instantly, and a fresh copy is fetched in the
   background for next time. So an update lands silently on the next open rather
   than making you wait for it on this one. That is the whole answer to "I don't
   want to keep sending myself the file".

   Bump VERSION on release. The activate handler deletes every cache that is not in
   the current set, so a bump is also the cache eviction. */
const VERSION = 'spendly-v3';
const SHELL   = VERSION + '-shell';
const VENDOR  = VERSION + '-vendor';

/* Chart.js is version-pinned in the markup and SRI-checked, so the bytes at this URL
   can never change under us. That makes it safe to cache-first and keep. */
const VENDOR_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    /* './' and './index.html' are the same page on Pages, but a request can arrive
       as either, so both are primed.

       Not addAll(): it fetches with the default cache mode, so a brand new install
       can be primed straight from the browser's HTTP cache - with the very bytes the
       install exists to replace. Observed: a fresh install still served the previous
       build, and only the revalidation on the NEXT open corrected it. 'reload' skips
       the HTTP cache outright, which is what a first install wants.

       One request per file rather than all-or-nothing, so a single failure does not
       leave the shell empty and the app unopenable offline. */
    const shellUrls = ['./', './index.html', './manifest.webmanifest', './icon.svg'];
    await Promise.all(shellUrls.map(async url => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload', credentials: 'same-origin' }));
        if (res && res.ok) await c.put(url, res);
      } catch (err) { /* offline mid-install; the fetch handler will fill this in */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = [SHELL, VENDOR];
    const names = await caches.keys();
    await Promise.all(names.map(n => keep.includes(n) ? null : caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* Vendor: immutable, so cache-first and never revalidate. */
  if (VENDOR_URLS.some(v => req.url.startsWith(v.split('?')[0]))) {
    e.respondWith((async () => {
      const c = await caches.open(VENDOR);
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
      return res;
    })());
    return;
  }

  /* Anything else off-origin (the GitHub API the sync feature talks to) must go
     straight to the network. Caching a sync response would hand back a stale copy
     of the user's own records, which is the one thing this must never do. */
  if (url.origin !== self.location.origin) return;

  /* Shell: stale-while-revalidate. */
  e.respondWith((async () => {
    const c = await caches.open(SHELL);
    const hit = await c.match(req, { ignoreSearch: true });
    /* Deliberately NOT fetch(req): a navigation carries the default cache mode, so the
       browser's own HTTP cache answered the revalidation with the same stale bytes the
       worker already held - and the worker wrote them straight back. The app could not
       update itself at all. 'no-cache' revalidates with the server instead, so an
       unchanged file costs a 304 rather than 650 KB. */
    const fresh = new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' });
    const net = fetch(fresh).then(res => {
      if (res && res.ok) c.put(req, res.clone());
      return res;
    }).catch(() => null);

    if (hit) { e.waitUntil(net); return hit; }

    const res = await net;
    if (res) return res;
    /* Offline, first visit to this path: fall back to the app shell so a navigation
       still lands somewhere real instead of the browser's error page. */
    return (await c.match('./index.html')) || (await c.match('./')) || Response.error();
  })());
});
