/* 配方：校验 / 库操作 / 提交码（M7）。做法 = M5 的编解码 + M8 的参数结构，不另造一套。
 * id = FNV-1a32(canonical)，canonical 不含 createdAt ⇒ 同一份做法反复提交得到同一个 id，也就是去重键。
 */
import type { BrewParams } from './brew';
import { beans, drinks } from './data/loader';
import { checksum, decodeCode, encodeCode, RECIPE_PREFIX } from './share';
import { readJson, writeJson } from './store';

export interface Recipe {
  id: string;
  name: string;
  author: string;
  beanId: string;
  drinkId: string;
  params: Partial<BrewParams>;
  note: string;
  createdAt: string;
}

export const RECIPES_KEY = 'yuwen-cafe-recipes-v1';
export const NAME_MAX = 24;
export const AUTHOR_MAX = 12;
export const NOTE_MAX = 120;

/** 参数档位表：在不看任何界面数据的前提下，也能说清「哪样的配方算越界」。 */
const PARAM_LIMITS: Record<'tempC' | 'doseG' | 'waterMl' | 'milkMl' | 'timeS', [number, number, string]> = {
  tempC: [60, 100, '水温'],
  doseG: [5, 60, '粉量'],
  waterMl: [10, 2000, '水量'],
  milkMl: [1, 1000, '牛奶'],
  timeS: [5, 3600, '时长'],
};

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const outOfRange = (key: keyof typeof PARAM_LIMITS): string => {
  const [lo, hi, label] = PARAM_LIMITS[key];
  return `${label}要落在 ${lo}~${hi} 之间`;
};

/** 只留认得出来的字段、并逐项检查范围；越界一律拒绝，不做静默取整。 */
function cleanParams(input: Partial<BrewParams>): { ok: true; params: Partial<BrewParams> } | { ok: false; reason: string } {
  const params: Partial<BrewParams> = {};

  if (input.tempC !== undefined) {
    const temp = input.tempC;
    if (!Array.isArray(temp) || !isNum(temp[0]) || !isNum(temp[1]) || temp[0] > temp[1]) {
      return { ok: false, reason: '水温区间要低值在前，比如 [90, 93]' };
    }
    const [lo, hi] = PARAM_LIMITS.tempC;
    if (temp[0] < lo || temp[1] > hi) return { ok: false, reason: outOfRange('tempC') };
    params.tempC = [temp[0], temp[1]];
  }

  for (const key of ['doseG', 'waterMl', 'milkMl', 'timeS'] as const) {
    const value = input[key];
    if (value === undefined) continue;
    const [lo, hi] = PARAM_LIMITS[key];
    if (!isNum(value) || value < lo || value > hi) return { ok: false, reason: outOfRange(key) };
    params[key] = value;
  }

  if (input.grind !== undefined) {
    if (typeof input.grind !== 'string' || !input.grind.trim()) return { ok: false, reason: '研磨度总得写点什么' };
    params.grind = input.grind.trim();
  }

  if (input.notes !== undefined) {
    if (!Array.isArray(input.notes) || !input.notes.every((n) => typeof n === 'string' && n.trim())) {
      return { ok: false, reason: '参数提示行不能是空的' };
    }
    params.notes = [...input.notes];
  }

  return { ok: true, params };
}

/** canonical 只含「做法本身」：不含 id、不含 createdAt。 */
function canonicalOf(r: Recipe): string {
  const p = r.params ?? {};
  return JSON.stringify({
    name: r.name.trim(),
    author: r.author.trim(),
    beanId: r.beanId,
    drinkId: r.drinkId,
    note: r.note.trim(),
    tempC: p.tempC ?? null,
    grind: p.grind ?? '',
    doseG: p.doseG ?? null,
    waterMl: p.waterMl ?? null,
    milkMl: p.milkMl ?? null,
    timeS: p.timeS ?? null,
    notes: p.notes ?? [],
  });
}

export function recipeIdOf(r: Recipe): string {
  return checksum(canonicalOf(r));
}

/** 编辑器收的草稿（id 与时间戳由 validateRecipe 生成），App 与配方墙共用同一个形状。 */
export type RecipeDraft = Omit<Recipe, 'id' | 'createdAt'>;

export function validateRecipe(
  draft: RecipeDraft,
): { ok: true; recipe: Recipe } | { ok: false; reason: string } {
  const name = (draft.name ?? '').trim();
  if (!name) return { ok: false, reason: '给这份配方起个名字吧' };
  if (name.length > NAME_MAX) return { ok: false, reason: `配方名最多 ${NAME_MAX} 字` };

  const author = (draft.author ?? '').trim();
  if (author.length > AUTHOR_MAX) return { ok: false, reason: `署名最多 ${AUTHOR_MAX} 字` };

  const note = (draft.note ?? '').trim();
  if (note.length > NOTE_MAX) return { ok: false, reason: `风味笔记最多 ${NOTE_MAX} 字` };

  const drink = drinks.find((d) => d.id === draft.drinkId);
  if (!drink) return { ok: false, reason: '没有这款饮品' };

  const beanId = draft.beanId ?? '';
  if (beanId && !beans.some((b) => b.id === beanId)) return { ok: false, reason: '没有这支豆子' };

  const cleaned = cleanParams(draft.params ?? {});
  if (!cleaned.ok) return cleaned;

  const recipe: Recipe = {
    id: '',
    name,
    author,
    beanId,
    drinkId: drink.id,
    params: cleaned.params,
    note,
    createdAt: new Date().toISOString(),
  };
  recipe.id = recipeIdOf(recipe);
  return { ok: true, recipe };
}

/** 同 id 视为同一条做法：只提示，不覆盖。 */
export function addRecipe(list: Recipe[], r: Recipe): { ok: true; list: Recipe[] } | { ok: false; reason: string } {
  if (list.some((item) => item.id === r.id)) return { ok: false, reason: '这条配方已经在库里了' };
  return { ok: true, list: [r, ...list] };
}

export function removeRecipe(list: Recipe[], id: string): Recipe[] {
  return list.filter((r) => r.id !== id);
}

export function encodeRecipe(r: Recipe): string {
  return encodeCode(RECIPE_PREFIX, r);
}

function isRecipeLike(v: unknown): v is Recipe {
  if (!v || typeof v !== 'object') return false;
  const r = v as Recipe;
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.drinkId === 'string' &&
    typeof r.beanId === 'string' &&
    typeof r.note === 'string' &&
    typeof r.author === 'string' &&
    !!r.params &&
    typeof r.params === 'object'
  );
}

/** 解码后按同一套校验过一遍：码里的内容与编号对不上（被手改过）也当坏码拒掉。 */
export function decodeRecipe(code: string): { ok: true; recipe: Recipe } | { ok: false; reason: string } {
  const decoded = decodeCode(RECIPE_PREFIX, code);
  if (!decoded.ok) return decoded;

  const raw = decoded.payload as Partial<Recipe> | null;
  if (!isRecipeLike(raw)) return { ok: false, reason: '这段码读不出来' };

  const checked = validateRecipe({
    name: raw.name,
    author: raw.author,
    beanId: raw.beanId,
    drinkId: raw.drinkId,
    params: raw.params,
    note: raw.note,
  });
  if (!checked.ok) return checked;
  if (raw.id !== checked.recipe.id) return { ok: false, reason: '这份配方的内容和编号对不上' };

  checked.recipe.createdAt = typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : checked.recipe.createdAt;
  return { ok: true, recipe: checked.recipe };
}

export function loadRecipes(): Recipe[] {
  const raw = readJson<unknown>(RECIPES_KEY, []);
  return Array.isArray(raw) ? raw.filter(isRecipeLike) : [];
}

export function persistRecipes(list: Recipe[]): void {
  writeJson(RECIPES_KEY, list);
}
