/* M4 手机版：PWA 静态文件与移动适配的结构机检（设计档 §1 M4、§5 M4.①②③）。
 * 无 headless 浏览器 ⇒ 这里只做「文件在不在、字段对不对、匹配按不按 scope 相对」；
 * 360 / 390 / 430 逐屏走查与真机安装属手工项（H1）。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '../src/settings';
import { SAVE_PREFIX } from '../src/share';

const read = (rel: string): string => readFileSync(rel, 'utf8');
/** 仓库根的 public / 根目录文件——必须从仓库根跑测试才能读到 */
const manifest = JSON.parse(read('public/manifest.webmanifest')) as {
  name: string;
  short_name: string;
  display: string;
  start_url: string;
  scope: string;
  theme_color: string;
  background_color: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
};
const sw = read('public/sw.js');
const html = read('index.html');
const css = read('game/src/styles.css');

/** PNG 的宽高在 IHDR 里：8 字节签名 + 4 长度 + 4 类型，随后 4 字节宽 + 4 字节高 */
function pngSize(rel: string): { width: number; height: number } {
  const buf = readFileSync(rel);
  expect(buf.subarray(1, 4).toString('ascii'), `${rel} 不是 PNG`).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('M4 manifest', () => {
  it('可解析且五项必备字段齐备', () => {
    expect(typeof manifest.name).toBe('string');
    expect(manifest.name.trim().length).toBeGreaterThan(0);
    expect(manifest.short_name.trim().length).toBeGreaterThan(0);
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    expect(manifest.theme_color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(manifest.background_color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('图标一律 scope 相对：没有一根绝对路径（子路径部署下绝对路径会 404）', () => {
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(manifest.icons.some((i) => (i.purpose ?? '').includes('maskable'))).toBe(true);

    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('./'), `${icon.src} 应以 ./ 开头`).toBe(true);
      expect(icon.src.startsWith('/'), `${icon.src} 不得是绝对路径`).toBe(false);
      expect(icon.type).toBe('image/png');
      expect(() => read(`public/${icon.src.slice(2)}`)).not.toThrow();
    }
  });

  it('三个图标像素尺寸正确，且与 manifest 声明的一致', () => {
    const expect3: [string, number][] = [
      ['public/icons/icon-192.png', 192],
      ['public/icons/icon-512.png', 512],
      ['public/icons/apple-touch-icon-180.png', 180],
    ];
    for (const [path, size] of expect3) {
      const got = pngSize(path);
      expect(got, path).toEqual({ width: size, height: size });
      expect(readFileSync(path).byteLength, path).toBeGreaterThan(1000);
    }
    for (const icon of manifest.icons) {
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(pngSize(`public/${icon.src.slice(2)}`), icon.src).toEqual({ width: w, height: h });
    }
  });
});

describe('M4 Service Worker', () => {
  it('资产匹配按 scope 相对算：不出现写死的 startsWith(\'/assets/\')', () => {
    expect(sw).not.toContain("startsWith('/assets/')");
    expect(sw).not.toContain('startsWith("/assets/")');
    expect(sw).toContain("new URL('assets/', self.registration.scope).pathname");
    expect(sw).toMatch(/url\.pathname\.startsWith\(assetsBase\)/);
  });

  it('precache 壳清单含页面 / 清单 / 图标；导航 network-first 回落缓存壳', () => {
    for (const item of ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png']) {
      expect(sw, `precache 缺 ${item}`).toContain(item);
    }
    expect(sw).toContain('cache.addAll(SHELL)');
    expect(sw).toMatch(/request\.mode === 'navigate'/);
    expect(sw).toContain("caches.match('./index.html')");
    expect(sw).toMatch(/caches\.open\(CACHE\)\.then\(\(cache\) => cache\.put\(request, copy\)\)/); // 运行时缓存
  });

  it('缓存名自 ?v= 派生，activate 清掉旧版本，收到 SKIP_WAITING 就接管', () => {
    expect(sw).toContain("searchParams.get('v')");
    expect(sw).toMatch(/const CACHE = `yuwen-cafe-\$\{VERSION\}`/);
    expect(sw).toContain("key.startsWith('yuwen-cafe-') && key !== CACHE");
    expect(sw).toContain('caches.delete(key)');
    expect(sw).toContain("event.data.type === 'SKIP_WAITING') self.skipWaiting()");
  });

  it('注册串带上应用版本（版本变 ⇒ 脚本 URL 变 ⇒ 浏览器必然发现更新）', () => {
    const pwa = read('game/src/pwa.ts');
    expect(pwa).toContain('register(`${base}sw.js?v=${APP_VERSION}`)');
    expect(pwa).toContain('if (!import.meta.env.PROD) return;'); // dev 不注册
    expect(pwa).toContain("postMessage({ type: 'SKIP_WAITING' })");
    expect(read('game/src/main.tsx')).toContain('initPwa()');
  });
});

describe('M4 index.html 与触控规格', () => {
  it('manifest / apple 图标 / theme-color 走 %BASE_URL%，viewport 带 viewport-fit=cover', () => {
    expect(html).toContain('rel="manifest" href="%BASE_URL%manifest.webmanifest"');
    expect(html).toContain('href="%BASE_URL%icons/apple-touch-icon-180.png"');
    expect(html).toContain('href="%BASE_URL%icons/icon-192.png"');
    expect(html).toContain('name="theme-color"');
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain('content="width=device-width, initial-scale=1, viewport-fit=cover"');
    // 静态资源不得写绝对路径（子路径部署会 404）
    expect(html).not.toMatch(/href="\/icons\//);
    expect(html).not.toContain('href="/manifest.webmanifest"');
  });

  it('styles.css 含 44px 触摸靶、安全区、横向不滚动三条规则', () => {
    expect(css).toMatch(/html,\s*body\s*\{\s*overflow-x:\s*hidden/);
    expect(css).toContain('-webkit-text-size-adjust: 100%');
    expect(css).toContain('env(safe-area-inset-bottom)');
    expect(css).toMatch(/\.bottombar\s*\{[^}]*padding-bottom:\s*env\(safe-area-inset-bottom\)/s);
    expect(css).toMatch(/@media \(max-width: 768px\)[\s\S]*button \{ min-height: 44px/);
    const hits = css.match(/min-height: 44px/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(8);
  });

  it('版本号两处同步：package.json 与应用常量一致', () => {
    const pkg = JSON.parse(read('package.json')) as { version: string };
    expect(APP_VERSION).toBe('0.2.0');
    expect(pkg.version).toBe(APP_VERSION);
    expect(SAVE_PREFIX).toBe('YWCAFE-SAVE-1.');
  });
});
