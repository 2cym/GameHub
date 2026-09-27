/* GameHub Service Worker — 手写，零依赖。
 *
 * 目标：把已构建的应用壳和静态资源缓存下来，断网时 13 个单机游戏仍能玩。
 * 边界：只拦截同源的 GET；/api/ 一律放行（排行榜、登录、好友对战都需要网络，
 *       离线时让浏览器正常失败，前端已有降级提示）。
 * 版本：改应用壳（index.html / manifest / 入口资源）就 bump CACHE 常量，
 *       activate 会删掉所有旧版本缓存，避免 hash 变了的旧 JS 被反复命中。
 */

const CACHE = 'gamehub-v1'
const PRECACHE = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest']

// 运行时才加载的图片资源（src/games/contra/sprites.ts）。
// 放进安装期缓存，Contra 才能"第一次装完就能离线玩"，而不是必须联网玩过一次。
const RUNTIME_ASSETS = ['/contra/bg1.png', '/contra/bg2.png', '/contra/bg3.png', '/contra/bg4.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      // 逐个加而不是 addAll：某个资源 404 不应让整个 SW 安装失败
      await Promise.all(
        PRECACHE.map((url) =>
          cache.add(url).catch((err) => console.warn('[sw] 预缓存失败', url, err && err.message)),
        ),
      )
      // 运行时素材只尽力而为，失败也不该阻断安装
      await Promise.all(
        RUNTIME_ASSETS.map((url) => cache.add(url).catch(() => {})),
      )
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

/** 把响应写进缓存；只缓存 200 且非 opaque、非重定向的响应 */
async function putIfCacheable(cache, request, response) {
  if (!response || !response.ok || response.type === 'opaque' || response.redirected) return
  try {
    await cache.put(request, response.clone())
  } catch {
    // 缓存配额满或响应已被消费时静默丢弃，不影响本次返回
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  // 导航请求：网络优先，失败回退到缓存的 index.html（同时支持 SPA 深链）
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        try {
          const response = await fetch(request)
          await putIfCacheable(cache, '/index.html', response)
          return response
        } catch {
          return (
            (await cache.match('/index.html')) || new Response('', { status: 503, statusText: '离线' })
          )
        }
      })(),
    )
    return
  }

  // 静态资源（带 hash 的 JS/CSS、public/ 下的素材）：stale-while-revalidate。
  // 有缓存立刻返回旧值，同时后台刷新；首次访问或离线时等网络。
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      const cached = await cache.match(request)
      const refresh = fetch(request)
        .then((response) => {
          void putIfCacheable(cache, request, response)
          return response
        })
        .catch(() => cached)
      return cached || refresh
    })(),
  )
})
