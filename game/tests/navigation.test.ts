/* M9 全局导航：目录栏与返回置顶（设计档 §1 M9、§5 M9.①②③）。
 * node 环境无 DOM：`NavMenu` 按设计是「无 hook 纯展示」，所以直接当函数调、取元素树断言；
 * `App.tsx` 的置顶接线按设计明列口径做源码机检（`useLayoutEffect` + `window.scrollTo(0, 0)` + 依赖为屏幕键）。
 * 真机三档宽走查属手工项（H5），不在本文件内。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import NavMenu from '../src/NavMenu';
import { VIEWS, type NavTarget, type View, navEntries, screenKeyOf } from '../src/nav';

const read = (rel: string): string => readFileSync(rel, 'utf8');

/** 设计档 §1 M9.4 的 13 行对照表口径：13 项逐个可判 */
const THIRTEEN: View[] = [...VIEWS];

type Sign = { label: string; click: () => void };

function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node === 'object') return textOf((node as { props?: { children?: unknown } }).props?.children);
  return String(node);
}

/** 直调组件取元素树，把 <button> 收成「签 = 文字 + 点击回调」（不渲染 DOM） */
function signsOf(view: View, hasSave: boolean, onGo: (to: NavTarget) => void): Sign[] {
  const tree = NavMenu({ view, hasSave, onGo }) as unknown as { props?: { children?: unknown } } | null;
  const signs: Sign[] = [];
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const el = node as { type?: unknown; props?: { children?: unknown; onClick?: () => void } };
    if (el.type === 'button' && typeof el.props?.onClick === 'function') {
      signs.push({ label: textOf(el.props.children), click: el.props.onClick });
    }
    walk(el.props?.children);
  };
  walk(tree);
  return signs;
}

describe('M9.① 入口存在（VIEWS × navEntries）', () => {
  it('VIEWS 是唯一视图清单：13 项，与设计档逐字一致', () => {
    expect(THIRTEEN.length).toBe(13);
    expect(THIRTEEN).toEqual([
      'home',
      'cafe',
      'stage',
      'serve',
      'settlement',
      'map',
      'storage',
      'clues',
      'upgrade',
      'archive',
      'purchase',
      'business',
      'recipes',
    ]);
  });

  it('13 视图逐个可判：结果 ⊆ {home, cafe}，home / cafe 为空，其余 11 项有档两签齐 / 无档仅 home', () => {
    for (const view of THIRTEEN) {
      for (const hasSave of [true, false]) {
        const entries = navEntries(view, hasSave);
        expect(entries.length).toBeLessThanOrEqual(2);
        for (const to of entries) expect(['home', 'cafe']).toContain(to);
        if (view === 'home' || view === 'cafe') {
          expect(entries).toEqual([]); // 自身即目标，记 0 击
        } else if (hasSave) {
          expect(entries).toEqual(['home', 'cafe']);
        } else {
          expect(entries).toEqual(['home']); // 无档时也留「首页」（含 archive）
        }
      }
    }
  });
});

describe('M9.② 落点 ≤1 击（NavMenu 元素树）', () => {
  it('view=map 两签齐在，点「首页」/「店内」各落一次', () => {
    const calls: NavTarget[] = [];
    const signs = signsOf('map', true, (to) => calls.push(to));
    expect(signs.map((s) => s.label)).toEqual(['首页', '店内']);
    expect(calls).toEqual([]);
    signs[0]!.click();
    expect(calls).toEqual(['home']);
    signs[1]!.click();
    expect(calls).toEqual(['home', 'cafe']);
  });

  it('首页 / 店内自身无签（不出现自己指向自己）', () => {
    expect(NavMenu({ view: 'home', hasSave: true, onGo: () => {} })).toBeNull();
    expect(NavMenu({ view: 'cafe', hasSave: true, onGo: () => {} })).toBeNull();
  });

  it('无档的 archive 只剩「首页」一签，落点仍是首页', () => {
    const calls: NavTarget[] = [];
    const signs = signsOf('archive', false, (to) => calls.push(to));
    expect(signs.map((s) => s.label)).toEqual(['首页']);
    signs[0]!.click();
    expect(calls).toEqual(['home']);
  });
});

describe('M9.③ 切换置顶（screenKeyOf + App.tsx 接线）', () => {
  it('13 视图两两换屏必变', () => {
    const keys = THIRTEEN.map((view) => screenKeyOf(view, false));
    expect(new Set(keys).size).toBe(13);
  });

  it('stage：结算屏出现变、下一关切换变，同屏重复取值不变', () => {
    expect(screenKeyOf('stage', false, 'stage-3')).not.toBe(screenKeyOf('stage', true, 'stage-3'));
    expect(screenKeyOf('stage', true, 'stage-3')).not.toBe(screenKeyOf('stage', false, 'stage-4'));
    expect(screenKeyOf('stage', false, 'stage-3')).toBe(screenKeyOf('stage', false, 'stage-3'));
    expect(screenKeyOf('map', false)).toBe(screenKeyOf('map', false));
  });

  it('屏幕键口径：stage = `stage:<id>:<play|result>`，其余 = 视图名', () => {
    expect(screenKeyOf('stage', false, 'stage-3')).toBe('stage:stage-3:play');
    expect(screenKeyOf('stage', true, 'stage-7')).toBe('stage:stage-7:result');
    expect(screenKeyOf('storage', true)).toBe('storage');
  });

  it('App.tsx 接线：useLayoutEffect 里 window.scrollTo(0, 0)，依赖是屏幕键', () => {
    const app = read('game/src/App.tsx');
    expect(app).toContain('useLayoutEffect');
    expect(app).toContain('window.scrollTo(0, 0)');
    expect(app).toMatch(/const screenKey = screenKeyOf\(view,\s*!!outcome,\s*stage\?\.id\);/);
    expect(app).toMatch(/useLayoutEffect\(\(\) => \{\s*window\.scrollTo\(0, 0\);\s*\}, \[screenKey\]\);/);
  });
});
