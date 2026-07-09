const STATIC_CACHE = "koz-client-static-v2";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icons/pwa-icon.svg"];
const STATIC_DESTINATIONS = new Set(["document", "font", "image", "script", "style"]);
const ASSET_URL_PATTERN = /(?:src|href)="(\/assets\/[^"]+\.(?:css|js))"/g;

function isApiRequest(url) {
  return url.pathname === "/api" || url.pathname.startsWith("/api/");
}

function isCacheableStaticRequest(request, url) {
  if (request.method !== "GET") return false;
  if (request.headers.has("Authorization")) return false;
  if (url.origin !== self.location.origin) return false;
  if (isApiRequest(url)) return false;

  return STATIC_DESTINATIONS.has(request.destination);
}

function isStorableResponse(response) {
  const cacheControl = response.headers.get("Cache-Control") ?? "";
  return response.ok && !cacheControl.includes("no-store") && !cacheControl.includes("private");
}

async function cacheUrls(cache, urls) {
  await Promise.all(
    urls.map((url) =>
      cache.add(url).catch(() => {
        return undefined;
      }),
    ),
  );
}

async function removeOldAssets(cache, currentAssetUrls) {
  const currentAssets = new Set(currentAssetUrls);
  const requests = await cache.keys();

  await Promise.all(
    requests.map((request) => {
      const url = new URL(request.url);
      if (url.origin === self.location.origin && url.pathname.startsWith("/assets/") && !currentAssets.has(url.pathname)) {
        return cache.delete(request);
      }

      return undefined;
    }),
  );
}

async function cacheAppShell() {
  const cache = await caches.open(STATIC_CACHE);
  const indexResponse = await fetch("/", { cache: "reload" });

  if (isStorableResponse(indexResponse)) {
    const html = await indexResponse.clone().text();
    const assetUrls = Array.from(html.matchAll(ASSET_URL_PATTERN), (match) => match[1]);
    await cache.put("/", indexResponse);
    await cacheUrls(cache, [...APP_SHELL.filter((url) => url !== "/"), ...assetUrls]);
    await removeOldAssets(cache, assetUrls);
    return;
  }

  await cacheUrls(cache, APP_SHELL);
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (!isCacheableStaticRequest(request, url)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (!isStorableResponse(response)) {
            return response;
          }

          const copy = response.clone();
          const cache = await caches.open(STATIC_CACHE);
          const html = await copy.text();
          const assetUrls = Array.from(html.matchAll(ASSET_URL_PATTERN), (match) => match[1]);
          await cache.put("/", response.clone());
          await cacheUrls(cache, assetUrls);
          await removeOldAssets(cache, assetUrls);
          return response;
        })
        .catch(() => caches.match("/") || caches.match("/index.html")),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(request).then((response) => {
        if (isStorableResponse(response)) {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
        }

        return response;
      });
    }),
  );
});
