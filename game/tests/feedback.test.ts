/* M6 问题反馈（设计档 §1 M6，案例表 §6 M6 快照 正常 / 边界（无档））。
 * 环形缓冲与错误捕获在内存，快照与文本格式化是纯函数 —— node 环境即可断言字段与顺序。
 */
import { describe, expect, it } from 'vitest';
import {
  ACTION_CAP,
  DESC_PREFIX,
  JSON_SEPARATOR,
  buildSnapshot,
  captureError,
  describeOf,
  formatFeedback,
  installErrorCapture,
  lastErrorOf,
  recentActions,
  recordAction,
} from '../src/feedback';
import { APP_VERSION } from '../src/settings';

/** 设计档 §1 M6.3 的必需字段清单 */
const REQUIRED_FIELDS = [
  'version',
  'time',
  'ua',
  'language',
  'screen',
  'profileName',
  'chapter',
  'stageId',
  'stageTitle',
  'completedStages',
  'totalStages',
  'money',
  'energy',
  'reputation',
  'satisfactionToday',
  'inventory',
  'businessDay',
  'recipeCount',
  'recentActions',
  'lastError',
] as const;

/** 假 window：只收集监听器，够 installErrorCapture 用 */
function fakeWindow() {
  const handlers = new Map<string, Function[]>();
  return {
    addEventListener(type: string, fn: Function) {
      handlers.set(type, [...(handlers.get(type) ?? []), fn]);
    },
    removeEventListener(type: string, fn: Function) {
      handlers.set(type, (handlers.get(type) ?? []).filter((f) => f !== fn));
    },
    fire(type: string, event: unknown) {
      for (const fn of handlers.get(type) ?? []) fn(event);
    },
    listenerCount: (type: string) => (handlers.get(type) ?? []).length,
  };
}

describe('M6 环形缓冲', () => {
  it('写 30 条：只留最近 24 条，顺序为旧 → 新', () => {
    for (let i = 0; i < 30; i += 1) recordAction('view', `ring-${i}`);
    const kept = recentActions().filter((a) => a.detail.startsWith('ring-'));

    expect(kept).toHaveLength(ACTION_CAP);
    expect(kept.map((a) => a.detail)).toEqual(Array.from({ length: ACTION_CAP }, (_, i) => `ring-${i + 6}`));
    expect(kept[kept.length - 1].detail).toBe('ring-29');
    kept.forEach((a) => {
      expect(a.kind).toBe('view');
      expect(typeof a.at).toBe('number');
    });
  });

  it('返回的是副本：改返回值动不了缓冲里的记录', () => {
    recordAction('serve', '标记');
    const copy = recentActions();
    copy[copy.length - 1].detail = '被改了';
    expect(recentActions()[recentActions().length - 1].detail).toBe('标记');
  });
});

describe('M6 错误捕获', () => {
  it('error 事件与 unhandledrejection 都进最近一次错误；卸载后不再记', () => {
    const win = fakeWindow();
    const off = installErrorCapture(win);
    expect(win.listenerCount('error')).toBe(1);
    expect(win.listenerCount('unhandledrejection')).toBe(1);

    win.fire('error', { message: '炸了', filename: 'app.js' });
    expect(lastErrorOf()).toMatchObject({ message: '炸了', source: 'app.js' });

    win.fire('unhandledrejection', { reason: '异步炸了' });
    expect(lastErrorOf()).toMatchObject({ message: '异步炸了', source: 'unhandledrejection' });

    win.fire('unhandledrejection', { reason: { message: '对象式的错' } });
    expect(lastErrorOf()).toMatchObject({ message: '对象式的错' });

    win.fire('unhandledrejection', {});
    expect(lastErrorOf()).toMatchObject({ message: '未处理的 Promise 拒绝' });

    win.fire('error', { error: { message: '只有 error.message' } });
    expect(lastErrorOf()).toMatchObject({ message: '只有 error.message', source: 'error' });

    off();
    expect(win.listenerCount('error')).toBe(0);
    win.fire('error', { message: '卸载后的错' });
    expect(lastErrorOf()?.message).toBe('只有 error.message'); // 仍是卸载前那一条

    captureError('手动上报');
    expect(lastErrorOf()).toMatchObject({ message: '手动上报' });
    expect(lastErrorOf()?.source).toBeUndefined();
  });
});

describe('M6 快照', () => {
  const now = Date.parse('2026-10-01T10:20:30.000Z');

  it('有档有操作：必需字段齐全，值原样落位', () => {
    const snap = buildSnapshot({
      now,
      ua: 'Mozilla/5.0 (iPhone)',
      language: 'zh-CN',
      screen: '390x844',
      profileName: '小满',
      chapter: 'chapter-02',
      stageId: 'chapter-02-03',
      stageTitle: '第三关：雨天',
      completedStages: 12,
      totalStages: 50,
      money: 321,
      energy: 4,
      reputation: 30,
      satisfactionToday: 6,
      inventory: [
        { beanId: 'bean-001', name: '坚果拼配', portions: 7 },
        { beanId: 'bean-004', name: '深烘可可', portions: 0 },
      ],
      businessDay: 3,
      recipeCount: 2,
      recentActions: [
        { at: now - 1000, kind: 'view', detail: '进店' },
        { at: now - 500, kind: 'serve', detail: '出杯' },
      ],
      lastError: null,
    });

    for (const key of REQUIRED_FIELDS) {
      expect(Object.prototype.hasOwnProperty.call(snap, key), `缺字段 ${key}`).toBe(true);
    }
    expect(snap.version).toBe(APP_VERSION);
    expect(snap.time).toBe('2026-10-01T10:20:30.000Z');
    expect(snap.completedStages).toBe(12);
    expect(snap.totalStages).toBe(50);
    expect(snap.inventory).toEqual([{ beanId: 'bean-001', name: '坚果拼配', portions: 7 }]); // 去零
    expect(snap.recentActions.map((a) => a.detail)).toEqual(['进店', '出杯']); // 旧 → 新
    expect(snap.lastError).toBeNull();
    expect(snap.recipeCount).toBe(2);
    expect(snap.businessDay).toBe(3);
  });

  it('未开局：档位相关字段为 null / 空，不抛异常', () => {
    const snap = buildSnapshot({ now });
    expect(snap.profileName).toBeNull();
    expect(snap.chapter).toBeNull();
    expect(snap.stageId).toBeNull();
    expect(snap.stageTitle).toBeNull();
    expect(snap.money).toBeNull();
    expect(snap.energy).toBeNull();
    expect(snap.reputation).toBeNull();
    expect(snap.satisfactionToday).toBeNull();
    expect(snap.businessDay).toBeNull();
    expect(snap.recipeCount).toBeNull();
    expect(snap.inventory).toEqual([]);
    expect(snap.recentActions).toEqual([]);
    expect(snap.lastError).toBeNull();
    expect(snap.completedStages).toBe(0);
    expect(snap.totalStages).toBe(0);
    expect(snap.ua).toBe('');
    expect(Number.isNaN(Date.parse(snap.time))).toBe(false);
  });

  it('操作超过上限只留最近 24 条，且仍是旧 → 新', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ at: now + i, kind: 'stage' as const, detail: `s${i}` }));
    const snap = buildSnapshot({ now, recentActions: many });
    expect(snap.recentActions).toHaveLength(ACTION_CAP);
    expect(snap.recentActions[0].detail).toBe('s6');
    expect(snap.recentActions[ACTION_CAP - 1].detail).toBe('s29');
  });
});

describe('M6 反馈文本', () => {
  const now = Date.parse('2026-10-01T10:20:30.000Z');
  const snap = buildSnapshot({
    now,
    ua: 'Mozilla/5.0',
    language: 'zh-CN',
    screen: '390x844',
    profileName: '小满',
    stageTitle: '第三关：雨天',
    stageId: 'chapter-02-03',
    completedStages: 12,
    totalStages: 50,
    money: 321,
    energy: 4,
    reputation: 30,
    satisfactionToday: 6,
    inventory: [{ beanId: 'bean-001', name: '坚果拼配', portions: 7 }],
    businessDay: 3,
    recipeCount: 2,
    recentActions: [{ at: now, kind: 'serve', detail: '出杯' }],
    lastError: { at: now, message: '炸了', source: 'app.js' },
  });

  it('人读段 + 分隔行 + JSON 段：分隔行之后可整段解析且深等快照', () => {
    const text = formatFeedback({ kind: 'bug', text: '出杯后星级不对' }, snap);
    const [human, json] = text.split(JSON_SEPARATOR);

    expect(text.startsWith('【问题反馈】出错')).toBe(true);
    expect(human).toContain(`${DESC_PREFIX}出杯后星级不对`);
    expect(human).toContain(`版本：${APP_VERSION}`);
    expect(human).toContain('档位：小满 · 章节 — · 关卡 第三关：雨天（chapter-02-03） · 进度 12/50');
    expect(human).toContain('数值：现金 321 · 体力 4 · 口碑 30 · 今日满意度 6');
    expect(human).toContain('库存：坚果拼配 7 份');
    expect(human).toContain('营业：第 3 天 · 配方库 2 条');
    expect(human).toContain('设备：Mozilla/5.0 · zh-CN · 390x844');
    expect(human).toContain('最近操作：');
    expect(human).toContain('最近错误：');
    expect(human).toContain('炸了 · app.js');
    expect(JSON.parse(json ?? '')).toEqual(snap);
  });

  it('无档无库存无操作：缺项一律显示占位，不拼出空行', () => {
    const bare = buildSnapshot({ now });
    const text = formatFeedback({ kind: 'stuck', text: '   ' }, bare);
    const [human] = text.split(JSON_SEPARATOR);

    expect(text.startsWith('【问题反馈】卡住')).toBe(true);
    expect(human).toContain(`${DESC_PREFIX}（没写描述）`);
    expect(human).toContain('档位：（未开局） · 章节 — · 关卡 — · 进度 0/0');
    expect(human).toContain('数值：现金 — · 体力 — · 口碑 — · 今日满意度 —');
    expect(human).toContain('库存：（空）');
    expect(human).toContain('营业：第 — 天 · 配方库 — 条');
    expect(human).toContain('最近操作：\n  （无）');
    expect(human).toContain('最近错误：（无）');
    expect(human).not.toContain('undefined');
  });

  it('describeOf 读回玩家写的那句：没写描述回空串', () => {
    const text = formatFeedback({ kind: 'suggestion', text: '加个音效' }, snap);
    expect(describeOf(text)).toBe('加个音效');
    expect(describeOf(formatFeedback({ kind: 'suggestion', text: '' }, snap))).toBe('');
    expect(describeOf('没有描述行的一段文本')).toBe('');
  });
});
