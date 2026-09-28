/* 离线与更新（M4）。
 * 缓存名从脚本自身 URL 的 ?v= 派生：版本一变脚本 URL 就变，
 * 浏览器必然重新安装，旧的 yuwen-cafe-* 缓存在 activate 时扫掉。
 * 站点可能挂在子路径下，所以一切匹配都按 scope 相对算，不写死绝对路径。 */

const VERSION = new URL(self.location.href).searchParams.get('v') || '0';
const CACHE = `yuwen-cafe-${VERSION}`;
/* 离线时能拿到的壳：页面、清单、一枚图标。带哈希的产物不进这里，靠下面运行时那条规则 */
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('yuwen-cafe-') && key !== CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 导航：先要网络（顺手把新壳存下），断网时回落缓存里的壳
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() =>
          caches.match('./index.html').then(
            (hit) =>
              hit ||
              new Response('离线了，而且本地还没有存过页面。', {
                status: 503,
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              })
          )
        )
    );
    return;
  }

  // 构建产物（assets/ 下带哈希的 JS / CSS）：命中缓存直接给，没命中再取并存下。
  // 基准前缀按 scope 算，子路径部署下 pathname 形如 /<repo>/assets/…，仍然命中。
  const assetsBase = new URL('assets/', self.registration.scope).pathname;
  if (url.pathname.startsWith(assetsBase)) {
    event.respondWith(
      caches.match(request).then((hit) => {
        if (hit) return hit;
        return fetch(request).then((response) => {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        });
      })
    );
  }
});
