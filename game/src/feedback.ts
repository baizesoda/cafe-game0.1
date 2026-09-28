/* 问题反馈：零后端窗口（M6）。环形缓冲与错误捕获在内存，落盘只存玩家主动提交的反馈。
 * 快照与文本格式化都是纯函数（now / ua 由参数传入），所以能在 node 里断言字段与顺序。
 */
import { APP_VERSION } from './settings';
import { readJson, writeJson } from './store';

export type FeedbackKind = 'bug' | 'stuck' | 'suggestion';
export type ActionKind =
  | 'view'
  | 'stage'
  | 'serve'
  | 'buy'
  | 'upgrade'
  | 'day'
  | 'share'
  | 'business'
  | 'error';

export interface ActionItem {
  at: number;
  kind: ActionKind;
  detail: string;
}

export interface FeedbackItem {
  id: string;
  kind: FeedbackKind;
  text: string;
  at: number;
  snapshot: string;
}

export interface LastError {
  at: number;
  message: string;
  source?: string;
}

export interface InventoryLine {
  beanId: string;
  name: string;
  portions: number;
}

export interface SnapshotInput {
  now: number;
  ua?: string;
  language?: string;
  screen?: string;
  profileName?: string | null;
  chapter?: string | null;
  stageId?: string | null;
  stageTitle?: string | null;
  completedStages?: number;
  totalStages?: number;
  money?: number | null;
  energy?: number | null;
  reputation?: number | null;
  satisfactionToday?: number | null;
  inventory?: InventoryLine[];
  businessDay?: number | null;
  recipeCount?: number | null;
  recentActions?: ActionItem[];
  lastError?: LastError | null;
}

export interface FeedbackSnapshot {
  version: string;
  time: string;
  ua: string;
  language: string;
  screen: string;
  profileName: string | null;
  chapter: string | null;
  stageId: string | null;
  stageTitle: string | null;
  completedStages: number;
  totalStages: number;
  money: number | null;
  energy: number | null;
  reputation: number | null;
  satisfactionToday: number | null;
  inventory: InventoryLine[];
  businessDay: number | null;
  recipeCount: number | null;
  recentActions: ActionItem[];
  lastError: LastError | null;
}

export const ACTION_CAP = 24;
export const FEEDBACK_CAP = 10;
export const FEEDBACK_KEY = 'yuwen-cafe-feedback-v1';
/** 人读段与 JSON 段之间的分隔行。整段复制给店主时，JSON 段就是分隔行之后的部分。 */
export const JSON_SEPARATOR = '----- JSON -----';

const KIND_LABEL: Record<FeedbackKind, string> = { bug: '出错', stuck: '卡住', suggestion: '建议' };

/** 内存环形缓冲，旧 → 新，不落盘（D14）。 */
const actions: ActionItem[] = [];
let lastError: LastError | null = null;
let transport: ((text: string) => void) | null = null;

export function recordAction(kind: ActionKind, detail: string): void {
  actions.push({ at: Date.now(), kind, detail });
  while (actions.length > ACTION_CAP) actions.shift();
}

export function recentActions(): ActionItem[] {
  return actions.map((item) => ({ ...item }));
}

export function lastErrorOf(): LastError | null {
  return lastError ? { ...lastError } : null;
}

export function captureError(message: string, source?: string): void {
  lastError = source ? { at: Date.now(), message, source } : { at: Date.now(), message };
}

/** 监听 error 与 unhandledrejection，返回卸载函数。假 window（测试）也接得住。 */
export function installErrorCapture(win: {
  addEventListener: Function;
  removeEventListener?: Function;
}): () => void {
  const onError = (event: unknown) => {
    const e = event as { message?: string; filename?: string; error?: { message?: string } };
    captureError(e?.message || e?.error?.message || '未知错误', e?.filename || 'error');
  };
  const onRejection = (event: unknown) => {
    const reason = (event as { reason?: string | { message?: string } })?.reason;
    captureError(
      typeof reason === 'string' ? reason : reason?.message || '未处理的 Promise 拒绝',
      'unhandledrejection',
    );
  };

  win.addEventListener('error', onError);
  win.addEventListener('unhandledrejection', onRejection);
  return () => {
    win.removeEventListener?.('error', onError);
    win.removeEventListener?.('unhandledrejection', onRejection);
  };
}

/** 结构化快照：档位相关字段没有档时一律 null / 空，不抛异常。 */
export function buildSnapshot(input: SnapshotInput): FeedbackSnapshot {
  const inventory = (input.inventory ?? []).filter((line) => line.portions > 0);
  return {
    version: APP_VERSION,
    time: new Date(input.now).toISOString(),
    ua: input.ua ?? '',
    language: input.language ?? '',
    screen: input.screen ?? '',
    profileName: input.profileName ?? null,
    chapter: input.chapter ?? null,
    stageId: input.stageId ?? null,
    stageTitle: input.stageTitle ?? null,
    completedStages: input.completedStages ?? 0,
    totalStages: input.totalStages ?? 0,
    money: input.money ?? null,
    energy: input.energy ?? null,
    reputation: input.reputation ?? null,
    satisfactionToday: input.satisfactionToday ?? null,
    inventory,
    businessDay: input.businessDay ?? null,
    recipeCount: input.recipeCount ?? null,
    recentActions: (input.recentActions ?? []).slice(-ACTION_CAP).map((item) => ({ ...item })),
    lastError: input.lastError ?? null,
  };
}

/** 描述行的固定前缀：格式化与读回共用一处，界面只显示描述那半句。 */
export const DESC_PREFIX = '描述：';

/**
 * 从整段反馈文本里读回玩家写的那句描述（M6.5）。
 * 整段码存进「我的反馈」后，列表只列这一行，不再搬一遍快照。
 */
export function describeOf(text: string): string {
  const line = text.split('\n').find((l) => l.startsWith(DESC_PREFIX));
  const value = line ? line.slice(DESC_PREFIX.length).trim() : '';
  return value === '（没写描述）' ? '' : value;
}

const clock = (at: number): string => {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/** 人读段（逐行）+ 分隔行 + JSON 段；分隔行之后的部分可整段 JSON.parse。 */
export function formatFeedback(
  input: { kind: FeedbackKind; text: string },
  snap: FeedbackSnapshot,
): string {
  const who = snap.profileName ?? '（未开局）';
  const chapter = snap.chapter ?? '—';
  const stage = snap.stageTitle ? `${snap.stageTitle}（${snap.stageId ?? '—'}）` : '—';
  const num = (v: number | null) => (v === null ? '—' : String(v));

  const lines = [
    `【问题反馈】${KIND_LABEL[input.kind]}`,
    `${DESC_PREFIX}${input.text.trim() || '（没写描述）'}`,
    '',
    `版本：${snap.version}`,
    `时间：${snap.time}`,
    `档位：${who} · 章节 ${chapter} · 关卡 ${stage} · 进度 ${snap.completedStages}/${snap.totalStages}`,
    `数值：现金 ${num(snap.money)} · 体力 ${num(snap.energy)} · 口碑 ${num(snap.reputation)} · 今日满意度 ${num(snap.satisfactionToday)}`,
    snap.inventory.length
      ? `库存：${snap.inventory.map((l) => `${l.name} ${l.portions} 份`).join('、')}`
      : '库存：（空）',
    `营业：第 ${num(snap.businessDay)} 天 · 配方库 ${num(snap.recipeCount)} 条`,
    `设备：${snap.ua || '—'} · ${snap.language || '—'} · ${snap.screen || '—'}`,
    '最近操作：',
    ...(snap.recentActions.length
      ? snap.recentActions.map((a) => `  ${clock(a.at)} ${a.kind} ${a.detail}`)
      : ['  （无）']),
    snap.lastError
      ? `最近错误：${clock(snap.lastError.at)} ${snap.lastError.message}${snap.lastError.source ? ` · ${snap.lastError.source}` : ''}`
      : '最近错误：（无）',
  ];

  return `${lines.join('\n')}\n${JSON_SEPARATOR}\n${JSON.stringify(snap, null, 2)}`;
}

export function makeFeedback(kind: FeedbackKind, text: string, snapshot: string, now = Date.now()): FeedbackItem {
  return { id: `fb-${now}-${Math.floor(Math.random() * 1e6)}`, kind, text, at: now, snapshot };
}

/** 运输挂点：本批只留位置，不实现任何传输（决策 E）。 */
export function setTransport(fn: ((text: string) => void) | null): void {
  transport = fn;
}

export function loadFeedback(): FeedbackItem[] {
  const raw = readJson<unknown>(FEEDBACK_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is FeedbackItem => !!item && typeof item === 'object' && typeof (item as FeedbackItem).id === 'string')
    .slice(0, FEEDBACK_CAP);
}

export function persistFeedback(list: FeedbackItem[]): FeedbackItem[] {
  const kept = list.slice(0, FEEDBACK_CAP);
  writeJson(FEEDBACK_KEY, kept);
  return kept;
}

export function transportOf(): ((text: string) => void) | null {
  return transport;
}
