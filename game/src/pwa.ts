/* Service Worker 注册与「有新版本」提示（M4.4）。
 * 缓存名由 sw.js 自己从 URL 的 `?v=` 派生，所以这里只负责把版本带上——
 * 版本一变脚本 URL 就变，浏览器必然发现更新（D10）。
 */
import { APP_VERSION } from './settings';

const listeners = new Set<() => void>();
let waiting: ServiceWorker | null = null;
let reloading = false;

function notify(): void {
  for (const cb of [...listeners]) cb();
}

/** 订阅「有新版本可用」。已经有等待中的新版本时，订阅即回调一次。返回退订函数。 */
export function onPwaUpdate(cb: () => void): () => void {
  listeners.add(cb);
  if (waiting) cb();
  return () => {
    listeners.delete(cb);
  };
}

function track(reg: ServiceWorkerRegistration): void {
  if (reg.waiting) {
    waiting = reg.waiting;
    notify();
  }
  reg.addEventListener('updatefound', () => {
    const installing = reg.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      // 已有页面在被旧 SW 控制 ⇒ 这次装好的是「更新」而不是首次安装
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        waiting = installing;
        notify();
      }
    });
  });
  void reg.update?.();
}

export function initPwa(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // dev 不注册：本地调试时 SW 缓存会和热更新打架
  if (!import.meta.env.PROD) return;

  const base = import.meta.env.BASE_URL || '/';
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register(`${base}sw.js?v=${APP_VERSION}`)
    .then(track)
    .catch(() => {
      // 注册失败（非 HTTPS / 隐私模式）就当没有 PWA，不影响游戏
    });
}

/** 让等待中的新版本立刻接管；`controllerchange` 那边负责刷新一次。 */
export function applyPwaUpdate(): void {
  waiting?.postMessage({ type: 'SKIP_WAITING' });
}
