/* ---------- localStorage 薄封装 ----------
 * 这一层只做一件事：把「可能根本用不了」的 localStorage 包成不会抛的读写。
 * Safari 隐私模式下 localStorage 存在但 setItem 抛异常；测试环境（node）里干脆不存在。
 * 两种都降级成同一句：玩得动，但存不下。
 * 本批所有存储薄层（settings / business / recipes / feedback）与存档位都走这里，
 * 降级口径因此只有一处实现。
 */

/** 探写用的键：就是存档位的「当前档」键，探一次等于顺手把它保回去 */
const PROBE_KEY = 'yuwen-cafe-active-v1';

/** localStorage 可用就返回它，不可用返回 null。每次现取，别在模块级缓存——测试会换掉替身。 */
export function store(): Storage | null {
  try {
    localStorage.setItem(PROBE_KEY, localStorage.getItem(PROBE_KEY) ?? '');
    return localStorage;
  } catch {
    return null;
  }
}

/** 读一个 JSON 键。键不存在、解析失败、存不了，一律回落到 fallback。 */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = store()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** 写一个 JSON 键。写失败静默吞掉，不阻断本局。 */
export function writeJson(key: string, value: unknown): void {
  try {
    store()?.setItem(key, JSON.stringify(value));
  } catch {
    // 存不下就算了，本局还能继续玩
  }
}

/** 删一个键（搬走旧存档、删档位时用）。删不掉也不影响本局。 */
export function removeKey(key: string): void {
  try {
    store()?.removeItem(key);
  } catch {
    // 同上
  }
}
