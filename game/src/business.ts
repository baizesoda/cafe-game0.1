/* 通关后的「自由营业」日循环（M3）。判定与生成全是纯函数，只有 load / persist 碰 localStorage。
 * 客人、饮品、风味标签全部取自现有数据（story/characters.json、content/**），零新增剧情文本。
 * 日计划入场即固化（planSeed 落盘），所以「同一天怎么玩都一致」，测试也能重放。
 */
import type { CoffeeBean, Drink, Effects, PlayerSave } from '../../contracts/types';
import { beans, characters } from './data/loader';
import { availableDrinks, brewableWith, EMERGENCY_BEAN } from './state';
import { readJson, writeJson } from './store';
import type { BrewGrade } from './brew';

export interface Guest {
  id: string;
  name: string;
}

export interface Order {
  id: string;
  guestId: string;
  guestName: string;
  drinkId: string;
  preferTags: string[];
  text: string;
}

export interface BusinessRecord {
  day: number;
  phase: 'open' | 'serving' | 'settled';
  orders: Order[];
  served: number;
  stars: number[];
  income: number;
  usedBeans: Record<string, number>;
  planSeed: number;
}

const businessKey = (profileId: string) => `yuwen-cafe-business-v1:${profileId}`;

/** 结构校验：认得出是营业档案才算数（存档码导入、localStorage 读回都走它）。 */
export function isBusinessRecord(v: unknown): v is BusinessRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as BusinessRecord;
  return (
    typeof r.day === 'number' &&
    ['open', 'serving', 'settled'].includes(r.phase) &&
    Array.isArray(r.orders) &&
    !!r.usedBeans &&
    typeof r.usedBeans === 'object'
  );
}

/** 读营业档案。没开过业、存不下、结构不认识，一律返回 null（界面按「营业第 1 天」起算）。 */
export function loadBusiness(profileId: string): BusinessRecord | null {
  const raw = readJson<unknown>(businessKey(profileId), null);
  return isBusinessRecord(raw) ? raw : null;
}

export function persistBusiness(profileId: string, rec: BusinessRecord): void {
  writeJson(businessKey(profileId), rec);
}

export function freshRecord(seed = 0): BusinessRecord {
  return {
    day: 1,
    phase: 'open',
    orders: [],
    served: 0,
    stars: [],
    income: 0,
    usedBeans: {},
    planSeed: seed,
  };
}

/** 客流：口碑 0 → 2 位、30 → 3 位、75 及以上 → 5 位（口碑上限 100 由契约钳制，下限恒为 2）。 */
export function dayGuestCount(reputation: number): number {
  return Math.min(5, 2 + Math.floor(reputation / 25));
}

/** 客人池 = 非玩家角色（`player` 是玩家自己，不进池）。 */
export function guestPool(): Guest[] {
  return characters.filter((c) => c.role !== 'player').map((c) => ({ id: c.id, name: c.name }));
}

/** 线性同余，确定性：同种子同序列。 */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * 这一杯「能端出来」的饮品：菜单里、且至少有一支豆做得了。
 * 应急豆（M1.4）什么都能做、永不缺货，所以它算在内——仓库全空时订单池也不会空，
 * 日循环不会因为「没豆就没订单」停摆。
 */
function drinkPool(save: PlayerSave): Drink[] {
  const emergency = brewableWith(save, EMERGENCY_BEAN);
  return availableDrinks(save).filter(
    (d) =>
      emergency.includes(d) ||
      beans.some((b) => b.usable_drinks.includes(d.id) && brewableWith(save, b).includes(d)),
  );
}

/** 能做出这款饮品的**真实**豆。风味偏好从这里取，与库存无关——客人要的是风味，不是你手头有多少。 */
function capableBeans(drink: Drink): CoffeeBean[] {
  return beans.filter((b) => b.usable_drinks.includes(drink.id));
}

/**
 * 风味偏好：从「能做该饮品的豆的 `flavor_tags` 并集」里取 1 个；口碑 ≥ 60 时再取 1 个，
 * 但第二个只能从「与第一个同在一支豆上」的标签里挑 —— 组合真的存在才发两个（找不到就退回 1 个）。
 */
function pickTags(drink: Drink, reputation: number, next: () => number): string[] {
  const capable = capableBeans(drink);
  const union = [...new Set(capable.flatMap((b) => b.flavor_tags))];
  if (!union.length) return [];
  const first = union[Math.floor(next() * union.length)] ?? union[0];
  if (reputation < 60) return [first];
  const coexist = [...new Set(capable.filter((b) => b.flavor_tags.includes(first)).flatMap((b) => b.flavor_tags))].filter(
    (t) => t !== first,
  );
  if (!coexist.length) return [first];
  const second = coexist[Math.floor(next() * coexist.length)] ?? coexist[0];
  return [first, second];
}

function orderText(guestName: string, drinkName: string, tags: string[]): string {
  return tags.length
    ? `${guestName}：想喝${drinkName}——${tags.join('、')}`
    : `${guestName}：想喝${drinkName}——随你发挥`;
}

/** 生成今日订单并把日计划固化（入场时调一次；已固化过的日子不用重排）。 */
export function planDay(rec: BusinessRecord, save: PlayerSave, seed?: number): BusinessRecord {
  const planSeed = seed ?? rec.day * 7919 + Math.round(save.reputation);
  const next = rng(planSeed);
  const pool = guestPool();
  const menu = drinkPool(save);
  const orders: Order[] = [];

  for (let i = 0; i < dayGuestCount(save.reputation); i += 1) {
    const guest = pool[Math.floor(next() * pool.length)];
    const drink = menu[Math.floor(next() * menu.length)];
    if (!guest || !drink) break;
    const preferTags = pickTags(drink, save.reputation, next);
    orders.push({
      id: `d${rec.day}-${i}-${guest.id}`,
      guestId: guest.id,
      guestName: guest.name,
      drinkId: drink.id,
      preferTags,
      text: orderText(guest.name, drink.name, preferTags),
    });
  }

  return { ...rec, orders, phase: 'serving', planSeed };
}

/**
 * 三段判定 → 星级（M3.5、M3.6）：饮品对上 1 分 + 豆中偏好 1 / 部分 0.5 + 手法 好 1 / 一般 0.5 / 失误 0。
 * 偏好为空（仓库全空、只能拿应急豆那阵）没有「没满足」可言，按满足算。
 */
export function rateOrder(
  order: Order,
  drink: Drink,
  bean: CoffeeBean,
  grade: BrewGrade,
): { ok: true; stars: 1 | 2 | 3; income: number; extraEffects: Effects; lines: string[] } | { ok: false; reason: string } {
  if (order.drinkId !== drink.id) return { ok: false, reason: '这不是这单要的那杯' };

  const hit = order.preferTags.filter((t) => bean.flavor_tags.includes(t));
  const miss = order.preferTags.filter((t) => !bean.flavor_tags.includes(t));
  const beanScore = !miss.length ? 1 : hit.length ? 0.5 : 0;
  const methodScore = grade === '好' ? 1 : grade === '一般' ? 0.5 : 0;
  const total = 1 + beanScore + methodScore;
  const stars: 1 | 2 | 3 = total >= 2.5 ? 3 : total >= 1.5 ? 2 : 1;

  const income = Math.round(drink.price * [1, 1.2, 1.5][stars - 1]);
  const extraEffects: Effects = {
    satisfaction_today: stars * 3,
    reputation: stars === 3 ? 1 : stars === 2 ? 0 : -1,
  };
  // 熟客只记 5 位具名角色：客人池里的「客人」不是具名角色，不进信任表
  if (order.guestId !== 'customer') extraEffects.trust = { [order.guestId]: stars - 1 };

  const lines = [`饮品对上：${drink.name}`];
  if (!order.preferTags.length) {
    lines.push(`${bean.name} 没有标注风味，偏好这项不扣分`);
  } else if (!miss.length) {
    lines.push(`${bean.name} 的 flavor_tags 命中『${hit.join('、')}』`);
  } else if (hit.length) {
    lines.push(`${bean.name} 命中『${hit.join('、')}』，缺『${miss.join('、')}』`);
  } else {
    lines.push(`${bean.name} 没有『${miss.join('、')}』，它是 ${bean.flavor_tags.length ? bean.flavor_tags.join('／') : '没标风味'}`);
  }
  lines.push(`手法${grade} → ${stars}★，收入 ${income}`);

  return { ok: true, stars, income, extraEffects, lines };
}

/** 记一次豆种图鉴。纯函数，落盘由调用方负责（主线与自由营业都走它）。 */
export function recordUsedBean(rec: BusinessRecord, beanId: string): BusinessRecord {
  return {
    ...rec,
    usedBeans: { ...rec.usedBeans, [beanId]: (rec.usedBeans[beanId] ?? 0) + 1 },
  };
}

/** 出一杯后推进日计划：记星、记收入、记豆种；接完所有客人或精力耗尽即当日收工。 */
export function applyServe(
  rec: BusinessRecord,
  outcome: { stars: 1 | 2 | 3; income: number; beanId: string; energyLeft: number },
): BusinessRecord {
  const served = rec.served + 1;
  const done = served >= rec.orders.length || outcome.energyLeft <= 0;
  return {
    ...recordUsedBean(rec, outcome.beanId),
    served,
    stars: [...rec.stars, outcome.stars],
    income: rec.income + outcome.income,
    phase: done ? 'settled' : 'serving',
  };
}

/** 回到店里开下一日：日计数 +1、当日流水清零、phase 回 open；豆种图鉴跨日累计。 */
export function nextDay(rec: BusinessRecord): BusinessRecord {
  return { ...freshRecord(rec.planSeed), day: rec.day + 1, usedBeans: rec.usedBeans };
}
