// Service worker: lets the site open like an app and keeps working without internet.
// Pages: always fetched fresh when online; the last copy is kept for offline use.
// Images and fonts: their file names change whenever they change, so a saved copy is always right.
// The build fills in THUMBS (each painting's phone-sized home-page picture) and stamps a version on the SHELL name below, so a changed offline page reaches people on their next visit.
var SHELL = 'shell-__VERSION__';
var PAGES = 'pages';
var ASSETS = 'assets';
var OFFLINE = '/offline/';
var THUMBS = __THUMBS__;

self.addEventListener('install', function (e) {
  e.waitUntil(Promise.all([
    caches.open(SHELL).then(function (c) { return c.add(OFFLINE); }),
    caches.open(PAGES).then(function (c) { return c.add('/'); }),
    caches.open(ASSETS).then(function (c) { return c.addAll(THUMBS); })
  ]).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== SHELL && k !== PAGES && k !== ASSETS; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function trim(name, max) {
  return caches.open(name).then(function (c) {
    return c.keys().then(function (keys) {
      return Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map(function (k) { return c.delete(k); }));
    });
  });
}

// Offline, a painting saved at another size is better than none: /img/name-640-hash.webp stands in for /img/name-1400-hash.webp.
function otherSize(p) {
  var base = p.replace(/-\d+-[0-9a-f]+\.\w+$/, '-');
  return caches.open(ASSETS).then(function (c) {
    return c.keys().then(function (keys) {
      var best = null, bestW = 0;
      keys.forEach(function (r) {
        var m = new URL(r.url).pathname.slice(base.length).match(/^(\d+)-[0-9a-f]+\.\w+$/);
        if (m && new URL(r.url).pathname.indexOf(base) === 0 && +m[1] > bestW) { best = r; bestW = +m[1]; }
      });
      return best ? c.match(best) : Response.error();
    });
  });
}

function keep(name, req, res, max) {
  var copy = res.clone();
  return caches.open(name).then(function (c) { return c.put(req, copy); }).then(function () { return trim(name, max); });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  var url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  if (url.pathname.indexOf('/img/') === 0 || url.pathname.indexOf('/fonts/') === 0) {
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res.ok) e.waitUntil(keep(ASSETS, req, res, 300));
        return res;
      }).catch(function () { return otherSize(url.pathname); });
    }));
    return;
  }

  var page = req.mode === 'navigate' || url.pathname.slice(-1) === '/' || /\.html$/.test(url.pathname);
  if (!page) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok && !res.redirected) e.waitUntil(keep(PAGES, url.pathname, res, 80));
    return res;
  }).catch(function () {
    return caches.match(url.pathname).then(function (hit) { return hit || caches.match(OFFLINE); });
  }));
});
