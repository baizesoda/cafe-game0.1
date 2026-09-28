/* 存档 / 配方码的编解码，复制 · 分享 · 下载三条出口，以及档位进度文案（M5、M7 共用）。
 * 没有后端：传播靠一段可复制的文本。码 = 前缀 + FNV-1a32 校验段 + '.' + base64url(JSON)。
 */
import type { PlayerSave } from '../../contracts/types';
import { isBusinessRecord } from './business';
import type { BusinessRecord } from './business';
import { APP_VERSION } from './settings';
import { isStoryComplete } from './state';
import { stages } from './data/loader';

export const SAVE_PREFIX = 'YWCAFE-SAVE-1.';
export const RECIPE_PREFIX = 'YWCAFE-RECIPE-1.';

export interface SavePayload {
  v: 1;
  app: string;
  profileName: string;
  exportedAt: string;
  save: PlayerSave;
  business?: BusinessRecord;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** FNV-1a32 → 8 位十六进制。先转 UTF-8 字节再算，同一段中文在任何环境都得同一个值。 */
export function checksum(text: string): string {
  let hash = 0x811c9dc5;
  for (const byte of encoder.encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** 分块转二进制串：码里可能带几千字节的中文，一次性 apply 会爆栈。 */
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const fill = padded.length % 4 ? '='.repeat(4 - (padded.length % 4)) : '';
  const binary = atob(padded + fill);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeCode(prefix: string, payload: unknown): string {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  return `${prefix}${checksum(body)}.${body}`;
}

/**
 * 解码。四类非法各有各的说法：前缀不符 / 校验不过 / 读不出来。
 * 复制粘贴常被聊天工具折行，所以先去掉所有空白再校验——去掉空白后仍改动过的码照样过不了校验。
 */
export function decodeCode(
  prefix: string,
  code: string,
): { ok: true; payload: unknown } | { ok: false; reason: string } {
  const clean = String(code ?? '').replace(/\s+/g, '');
  const wrongPrefix = prefix === RECIPE_PREFIX ? '这不是配方码' : '这不是存档码';
  if (!clean.startsWith(prefix)) return { ok: false, reason: wrongPrefix };

  const rest = clean.slice(prefix.length);
  const dot = rest.indexOf('.');
  if (dot <= 0 || dot === rest.length - 1) return { ok: false, reason: '这段码读不出来' };
  const sum = rest.slice(0, dot);
  const body = rest.slice(dot + 1);
  if (checksum(body) !== sum.toLowerCase()) {
    return { ok: false, reason: '校验不通过，可能被改动或复制缺了一段' };
  }

  try {
    return { ok: true, payload: JSON.parse(decoder.decode(fromBase64Url(body))) };
  } catch {
    return { ok: false, reason: '这段码读不出来' };
  }
}

export function buildSaveCode(save: PlayerSave, profileName: string, business: BusinessRecord | null): string {
  const payload: SavePayload = {
    v: 1,
    app: APP_VERSION,
    profileName,
    exportedAt: new Date().toISOString(),
    save,
  };
  // 没开过业就不带 business 键（旧码里也没有这个键，两条路走同一段降级）
  if (business) payload.business = business;
  return encodeCode(SAVE_PREFIX, payload);
}

function isSave(value: unknown): value is PlayerSave {
  if (!value || typeof value !== 'object') return false;
  const s = value as PlayerSave;
  return (
    typeof s.player_name === 'string' &&
    typeof s.current_chapter === 'string' &&
    typeof s.current_stage === 'string' &&
    typeof s.money === 'number' &&
    typeof s.reputation === 'number' &&
    typeof s.satisfaction_today === 'number' &&
    typeof s.energy === 'number' &&
    !!s.trust &&
    typeof s.trust === 'object' &&
    !!s.inventory &&
    typeof s.inventory === 'object' &&
    !!s.flags &&
    typeof s.flags === 'object' &&
    Array.isArray(s.unlocked_knowledge) &&
    Array.isArray(s.completed_stages) &&
    Array.isArray(s.upgrades) &&
    Array.isArray(s.menu) &&
    !!s.today &&
    typeof s.today === 'object'
  );
}

/** 重名就加「（2）」「（3）」——导入永远新建档，不覆盖现有档位。 */
function uniqueName(base: string, existingNames: string[]): string {
  if (!existingNames.includes(base)) return base;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${base}（${i}）`;
    if (!existingNames.includes(candidate)) return candidate;
  }
  return `${base}（${existingNames.length + 1}）`;
}

export function planImport(
  code: string,
  existingNames: string[],
): { ok: true; name: string; save: PlayerSave; business: BusinessRecord | null } | { ok: false; reason: string } {
  const decoded = decodeCode(SAVE_PREFIX, code);
  if (!decoded.ok) return decoded;

  const payload = decoded.payload as Partial<SavePayload> | null;
  if (!payload || typeof payload !== 'object' || !isSave(payload.save)) {
    return { ok: false, reason: '码里的存档结构不认识' };
  }

  const rawName = typeof payload.profileName === 'string' ? payload.profileName.trim() : '';
  return {
    ok: true,
    name: uniqueName(rawName || '学徒', existingNames),
    save: payload.save,
    business: isBusinessRecord(payload.business) ? payload.business : null,
  };
}

/** 档位行文案（U11）：未通关报章节与关卡进度，通关后改报自由营业天数。 */
export function profileProgressLabel(save: PlayerSave, businessDay?: number): string {
  const tail = `现金 ${save.money} · 知识卡 ${save.unlocked_knowledge.length} 张`;
  if (isStoryComplete(save)) return `已通关 · 自由营业[第 ${businessDay ?? 1} 天] · ${tail}`;
  const chapter = Number(String(save.current_chapter).replace(/\D/g, '')) || 0;
  return `第 ${chapter} 章 · 进度 ${save.completed_stages.length}/${stages.length} · ${tail}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 隐私模式 / 非 HTTPS 下 clipboard 会抛，落到下面的兜底
  }
  try {
    if (typeof document === 'undefined') return false;
    const holder = document.createElement('textarea');
    holder.value = text;
    holder.setAttribute('readonly', '');
    holder.style.position = 'fixed';
    holder.style.top = '-1000px';
    document.body.appendChild(holder);
    holder.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(holder);
    return ok;
  } catch {
    return false;
  }
}

/** 有系统分享就用系统分享，没有（或用户取消）就退回复制。 */
export async function shareText(title: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }) : undefined;
  if (nav?.share) {
    try {
      await nav.share({ title, text });
      return 'shared';
    } catch {
      // 取消或不可用都退回复制
    }
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}

export function downloadText(filename: string, text: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
