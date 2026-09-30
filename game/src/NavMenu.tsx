import { type NavTarget, type View, navEntries } from './nav';

/* M9.1 目录栏（U17）：顶栏右边的两块明示布签。
 * 无 hook 纯展示——签的名单取自 `navEntries`，本文件只负责样子与点击回传；
 * 因此测试可以直接当函数调、取元素树断言，不必渲染 DOM（不引 jsdom）。
 */

const LABELS: Record<NavTarget, string> = { home: '首页', cafe: '店内' };

export default function NavMenu({
  view,
  hasSave,
  onGo,
}: {
  view: View;
  hasSave: boolean;
  onGo: (to: NavTarget) => void;
}) {
  const entries = navEntries(view, hasSave);
  // 首页 / 店内自身即目标 ⇒ 无签（M9.1 除外条款）
  if (!entries.length) return null;
  return (
    <nav className="navmenu" aria-label="目录栏">
      {entries.map((to) => (
        <button key={to} className="ghost" onClick={() => onGo(to)}>
          {LABELS[to]}
        </button>
      ))}
    </nav>
  );
}
