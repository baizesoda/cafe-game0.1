/* M9 全局导航的纯函数面（设计档 §1 M9.1 / M9.2 / M9.4 · §2.2 `nav.ts`）。
 * 视图清单、目录签、屏幕键三件事都从参数进出，没有任何存储 / DOM 依赖，
 * 因此在 node 环境里可以直接断言（不需要 jsdom，也不会把 styles.css 拉进测试）。
 */

/** 唯一视图清单（D18：`type View` 自 App.tsx 迁入；新增视图不登记即编译不过）。 */
export const VIEWS = [
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
] as const;

export type View = (typeof VIEWS)[number];

/** 目录栏的两个落点（U17 / M9.1）。 */
export type NavTarget = 'home' | 'cafe';

/**
 * 某个视图该有哪些目录签（M9.4）：
 * 首页 / 店内本身即目标，记 0 签（M9.1 除外条款）；其余视图有档时「首页」+「店内」两签齐、
 * 无档时只剩「首页」——无档唯一可达的非首页视图是知识档案。
 */
export function navEntries(view: View, hasSave: boolean): NavTarget[] {
  if (view === 'home' || view === 'cafe') return [];
  return hasSave ? ['home', 'cafe'] : ['home'];
}

/**
 * 屏幕键（M9.2）：换屏即变，置顶就挂在这个键上。
 * `main` 的 `key` 也要换屏即变，但它只有 `` `${view}${outcome ? '-result' : ''}` ``，
 * 吃不到「下一关」（`stage.id` 变而 `view` / `outcome` 不变）——本键是它的超集：
 * `stage` 视图要再分「哪一关 + 进行 / 结算」，因为结算屏出现与下一关切换都不换 `view`；
 * 其余视图就是视图名。
 */
export function screenKeyOf(view: View, hasResult: boolean, stageId?: string): string {
  if (view === 'stage') return `stage:${stageId ?? ''}:${hasResult ? 'result' : 'play'}`;
  return view;
}
