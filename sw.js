const CACHE_NAME = 'gesturecontrol-v1';
const CACHE_VERSION = 1;

// Uygulama kabuğu — her zaman cache'den gelir (hızlı)
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/about.html',
  '/contact.html',
  '/privacy.html',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json',
];

// Dış kaynaklar — network'ten gelir, cache'e yedeklenir
const CACHEABLE_ORIGINS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// Cache'e hiç alınmayacaklar
const NEVER_CACHE = [
  'googletagmanager.com',
  'google-analytics.com',
  'accounts.spotify.com',
  'api.spotify.com',
  'googleapis.com/youtube',
  'youtube.com/iframe_api',
  'mediapipe',
];

// ── Install: uygulama kabuğunu cache'e al ──
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: eski cache'leri temizle ──
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch: strateji seç ──
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Sadece GET isteklerini işle
  if (e.request.method !== 'GET') return;

  // Analytics, API çağrıları — her zaman network
  if (NEVER_CACHE.some((h) => url.hostname.includes(h) || url.pathname.includes(h))) {
    return; // SW pass-through, tarayıcı halleder
  }

  // Uygulama sayfaları — Cache First, arka planda güncelle (Stale-While-Revalidate)
  if (url.origin === self.location.origin) {
    e.respondWith(staleWhileRevalidate(e.request));
    return;
  }

  // Font ve diğer güvenilir dış kaynaklar — Cache First
  if (CACHEABLE_ORIGINS.some((h) => url.hostname.includes(h))) {
    e.respondWith(cacheFirst(e.request));
    return;
  }

  // Diğer her şey — Network First (API yanıtları vs.)
  e.respondWith(networkFirst(e.request));
});

// ── Stratejiler ──

/**
 * Stale-While-Revalidate:
 * Cache'deki yanıtı hemen döndür, arka planda güncelle.
 * Kullanıcı hız kazanır; bir sonraki ziyarette taze içerik gelir.
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || fetchPromise;
}

/**
 * Cache First:
 * Cache'de varsa oradan döndür (fontlar, ikonlar için ideal).
 * Yoksa network'ten al ve cache'e kaydet.
 */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

/**
 * Network First:
 * Önce network'ten dene; başarısız olursa cache'e bak.
 * Dinamik içerik için uygundur.
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}
