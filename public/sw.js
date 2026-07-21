const CACHE_NAMES = {
  static: "static-assets-v1",
  api: "api-cache-v1",
  analytics: "analytics-cache-v1",
  offline: "offline-page-v1",
}

const INSTALL_URLS = [
  "/offline.html",
  "/icons/icon-192x192.svg",
  "/icons/icon-512x512.svg",
]

const ANALYTICS_PATTERN = /^https?:\/\/.*\/api\/v1\/(analytics|metrics|usage)\/.*/i
const STATIC_PATTERN = /^https?:\/\/.*\/_next\/static\/.*/i
const FONT_PATTERN = /^https?:\/\/.*\.(woff2?|ttf|otf)(\?.*)?$/i

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAMES.offline)
      await cache.addAll(INSTALL_URLS)
    })(),
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((k) => !Object.values(CACHE_NAMES).includes(k))
          .map((k) => caches.delete(k)),
      )
      await self.clients.claim()
    })(),
  )
})

async function cacheFirst(request, cacheName, maxEntries = 200, maxAgeSeconds = 30 * 24 * 60 * 60) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) {
    const dateHeader = cached.headers.get("date")
    if (dateHeader) {
      const age = (Date.now() - new Date(dateHeader).getTime()) / 1000
      if (age < maxAgeSeconds) return cached
    } else {
      return cached
    }
  }
  try {
    const response = await fetch(request)
    if (response.ok) {
      const entries = await cache.keys()
      if (entries.length >= maxEntries) {
        await cache.delete(entries[0])
      }
      const headers = new Headers(response.headers)
      headers.set("date", new Date().toUTCString())
      const cloned = new Response(response.clone().body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
      await cache.put(request, cloned)
    }
    return response
  } catch {
    return cached || null
  }
}

async function networkFirst(request, cacheName, networkTimeoutSeconds = 5) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)

  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve(cached), networkTimeoutSeconds * 1000)
  })

  try {
    const fetchPromise = fetch(request).then(async (response) => {
      if (response.ok) {
        await cache.put(request, response.clone())
      }
      return response
    })
    return await Promise.race([fetchPromise, timeoutPromise])
  } catch {
    return cached || null
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)

  const fetchPromise = fetch(request).then(async (response) => {
    if (response.ok) {
      await cache.put(request, response.clone())
    }
    return response
  }).catch(() => cached)

  return cached || (await fetchPromise)
}

async function handleApi(request) {
  if (ANALYTICS_PATTERN.test(request.url)) {
    return staleWhileRevalidate(request, CACHE_NAMES.analytics)
  }
  return networkFirst(request, CACHE_NAMES.api, 5)
}

async function handleStatic(request) {
  const response = await cacheFirst(request, CACHE_NAMES.static, 200, 30 * 24 * 60 * 60)
  if (response) return response
  const offlineCache = await caches.open(CACHE_NAMES.offline)
  const offlinePage = await offlineCache.match("/offline.html")
  if (offlinePage) return offlinePage
  return new Response("Offline", { status: 503 })
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== "GET") return

  if (url.pathname === "/sw.js" || url.pathname === "/manifest.json") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAMES.offline)
        const cached = await cache.match(request)
        return cached || fetch(request)
      })(),
    )
    return
  }

  if (url.pathname.startsWith("/api/v1/")) {
    event.respondWith(handleApi(request))
    return
  }

  if (STATIC_PATTERN.test(request.url) || FONT_PATTERN.test(request.url) || url.pathname.startsWith("/icons/")) {
    event.respondWith(handleStatic(request))
    return
  }

  if (url.pathname === "/offline.html") {
    event.respondWith(
      caches.open(CACHE_NAMES.offline).then((c) => c.match(request)).then((r) => r || fetch(request)),
    )
    return
  }

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request)
        if (response.ok && response.type === "basic") {
          const cache = await caches.open(CACHE_NAMES.static)
          await cache.put(request, response.clone())
        }
        return response
      } catch {
        const cache = await caches.open(CACHE_NAMES.offline)
        const offline = await cache.match("/offline.html")
        if (offline) return offline
        return new Response("Offline", { status: 503 })
      }
    })(),
  )
})

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-pending-submissions") {
    event.waitUntil(
      (async () => {
        const clients = await self.clients.matchAll()
        for (const client of clients) {
          client.postMessage({ type: "SYNC_SUBMISSIONS" })
        }
      })(),
    )
  }
})
