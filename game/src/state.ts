// 经营数值与存档。数值键与边界全部取自 contracts/state-keys.json，不在代码里另写魔法数。
import type { Choice, CoffeeBean, DailyLedger, Drink, Effects, PlayerSave, Stage, UpgradeId } from '../../contracts/types';
import stateKeys from '../../contracts/state-keys.json';
import { beans, drinks, firstStageId, getStage, stages } from './data/loader';
import { readJson, removeKey, store, writeJson } from './store';

type NumericKey = 'money' | 'reputation' | 'satisfaction_today' | 'energy';

const numeric = stateKeys.numeric as Record<NumericKey, { label: string; init: number; min: number; max: number | null }>;

const PORTIONS_PER_BAG = stateKeys.economy.bean_portions_per_bag;

/**
 * 出一杯的原料成本。豆子的 purchase_price 是整袋价，出杯只用其中一份，
 * 所以要先按 contracts/state-keys.json 里的 bean_portions_per_bag 摊到份上。
 */
export function cupCost(bean: CoffeeBean, drink: Drink) {
  return Math.ceil((bean.purchase_price / PORTIONS_PER_BAG) * drink.bean_cost);
}

export const numericLabels = Object.entries(numeric).map(([key, cfg]) => ({
  key: key as NumericKey,
  label: cfg.label,
  // max 为 null 的数值（现金）没有上限，HUD 里显示成计数器而不是进度条
  max: cfg.max,
}));

/**
 * 经济口径（M2）。宽松模式不是全局开关，而是显式参数：传进来才算数。
 * 函数内部不读设置、不读 localStorage，所以两种口径都能被直接断言。
 */
export interface Economy {
  unlimited: boolean;
}

/** 出杯的可选口径：经济模式 / 收入覆盖（自由营业按星级算）/ 一并落地的 effects。 */
export interface ServeOptions {
  eco?: Economy;
  incomeOverride?: number;
  extraEffects?: Effects;
}

export const EMERGENCY_BEAN_ID = 'bean-emergency';

/**
 * 应急豆：柜台下面常备的最后一小袋。它不是内容层的豆子（content/** 零改动），
 * 是游戏机制兜底——成本 0、份数无限、不写库存，收入照记，
 * 让「0 豆 0 现金」的档能靠出杯慢慢攒回一袋豆的钱（M1.5 自愈闭合）。
 */
export const EMERGENCY_BEAN: CoffeeBean = {
  id: EMERGENCY_BEAN_ID,
  name: '应急豆',
  origin: '柜台下面',
  variety: '未标注',
  process: '未标注',
  roast_level: '中深烘',
  flavor_tags: [],
  purchase_price: 0,
  usable_drinks: drinks.map((d) => d.id),
  source_chapter: '游戏机制',
  source_quote: '店里常备的最后一小袋，先把客人这一杯端上。',
};

/** 这支豆子此刻有几份。应急豆不占库存，永远出得起。 */
const portionsOf = (save: PlayerSave, beanId: string) =>
  beanId === EMERGENCY_BEAN_ID ? Number.POSITIVE_INFINITY : (save.inventory[beanId] ?? 0);

/** 仓库里还有没有一支「有货且能做出至少一杯」的豆。为假时界面亮出应急豆（M1.3）。 */
export function canBrewAnything(save: PlayerSave): boolean {
  return beans.some((b) => (save.inventory[b.id] ?? 0) > 0 && brewableWith(save, b).length > 0);
}

/** 现金的显示口径：宽松模式下余额不参与经营，显示成 ∞（M2.4）。 */
export function displayMoney(save: PlayerSave, unlimited: boolean): string {
  return unlimited ? '∞' : String(save.money);
}

/** 可升级项（方案 §6.2）。第一版只做 4 类，磨豆机是第一章唯一必做的一项。 */
export const UPGRADES: { id: UpgradeId; name: string; cost: number; effect: string }[] = [
  { id: 'grinder', name: '维修磨豆机', cost: 80, effect: '出粉均匀，选错时的负面后果减半' },
  { id: 'brewer', name: '更换冲煮设备', cost: 150, effect: '解锁新饮品种类' },
  { id: 'seats', name: '增加店内座位', cost: 120, effect: '提高每日客流上限' },
  { id: 'blackboard', name: '重写菜单黑板', cost: 60, effect: '推荐饮品收益提高' },
];

const emptyLedger = (): DailyLedger => ({
  revenue: 0,
  cost: 0,
  customers: 0,
  satisfied: 0,
  wasted: 0,
  knowledge_gained: [],
  drinks_served: {},
});

export function createSave(playerName = '学徒'): PlayerSave {
  return {
    player_name: playerName,
    current_chapter: 'chapter-01',
    current_stage: firstStageId,
    money: numeric.money.init,
    reputation: numeric.reputation.init,
    satisfaction_today: numeric.satisfaction_today.init,
    energy: numeric.energy.init,
    trust: Object.fromEntries(stateKeys.trust.characters.map((id) => [id, stateKeys.trust.init])),
    inventory: Object.fromEntries(beans.slice(0, 2).map((b) => [b.id, 3])),
    unlocked_knowledge: [],
    completed_stages: [],
    flags: {},
    upgrades: [],
    menu: [],
    today: emptyLedger(),
  };
}

const clampNumeric = (key: NumericKey, value: number) => {
  const { min, max } = numeric[key];
  return Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, value));
};

/** 应用一次 effects，返回新存档与可展示的变化明细。同时记入当日流水。 */
export function applyEffects(save: PlayerSave, effects: Effects, eco?: Economy) {
  const next: PlayerSave = structuredClone(save);
  const changes: string[] = [];

  for (const { key, label } of numericLabels) {
    const delta = effects[key];
    if (!delta) continue;
    // 宽松模式只免「扣钱」：余额不动，也不出变化文案；赚进来的照记（M2.3）
    if (key === 'money' && eco?.unlimited === true && delta < 0) continue;
    const before = next[key];
    next[key] = clampNumeric(key, before + delta);
    const real = next[key] - before;
    if (real !== 0) changes.push(`${label} ${real > 0 ? '+' : ''}${real}`);
  }

  // 现金的正负分别记成收入和原料成本，供每日结算页拆开展示。
  // 流水是账本不是余额：宽松模式下没扣的那笔也按原始金额照记（D4）
  if (effects.money) {
    if (effects.money > 0) next.today.revenue += effects.money;
    else next.today.cost += -effects.money;
  }

  for (const [cid, delta] of Object.entries(effects.trust ?? {})) {
    const [min, max] = stateKeys.trust.range;
    const before = next.trust[cid] ?? stateKeys.trust.init;
    next.trust[cid] = Math.min(max, Math.max(min, before + delta));
    const real = next.trust[cid] - before;
    if (real !== 0) changes.push(`${cid} 信任 ${real > 0 ? '+' : ''}${real}`);
  }

  for (const [bid, delta] of Object.entries(effects.inventory ?? {})) {
    const before = next.inventory[bid] ?? 0;
    next.inventory[bid] = Math.max(stateKeys.inventory.min, before + delta);
    const real = next.inventory[bid] - before;
    if (real !== 0) changes.push(`${bid} 库存 ${real > 0 ? '+' : ''}${real}`);
    if (real < 0) next.today.wasted += -real;
  }

  return { save: next, changes };
}

/** 买一项升级。现金不够时返回失败原因，界面据此给出可重试的反馈。 */
export function buyUpgrade(save: PlayerSave, id: UpgradeId, eco?: Economy) {
  const item = UPGRADES.find((u) => u.id === id);
  if (!item) return { save, ok: false as const, reason: '没有这项升级' };
  if (save.upgrades.includes(id)) return { save, ok: false as const, reason: '已经升级过了' };
  // 宽松模式下余额不参与经营，钱不够不再是拦路条件（M2.2）
  if (save.money < item.cost && eco?.unlimited !== true) {
    return { save, ok: false as const, reason: `现金不够，还差 ${item.cost - save.money}` };
  }

  const { save: next } = applyEffects(save, { money: -item.cost }, eco);
  next.upgrades.push(id);
  if (id === 'grinder') next.flags.grinder_repaired = true;
  return { save: next, ok: true as const, reason: `${item.name}完成：${item.effect}` };
}

/**
 * 进一袋豆（M1.2）。豆子的 purchase_price 是整袋价，到货 bean_portions_per_bag 份。
 * 走一次 applyEffects：现金、库存、当日流水同源更新，不另算一套账。
 */
export function buyBean(save: PlayerSave, beanId: string, eco?: Economy) {
  const bean = beans.find((b) => b.id === beanId);
  if (!bean) return { save, ok: false as const, reason: '没有这支豆子' };
  if (save.money < bean.purchase_price && eco?.unlimited !== true) {
    return { save, ok: false as const, reason: `现金不够，还差 ${bean.purchase_price - save.money}` };
  }
  const { save: next } = applyEffects(
    save,
    { money: -bean.purchase_price, inventory: { [bean.id]: PORTIONS_PER_BAG } },
    eco,
  );
  return { save: next, ok: true as const, reason: `${bean.name}进了一袋，${PORTIONS_PER_BAG} 份` };
}

/** 菜单上现在能点的饮品：存档指定了 menu 就按 menu，否则按升级条件过滤。 */
export function availableDrinks(save: PlayerSave): Drink[] {
  const onMenu = save.menu?.length ? drinks.filter((d) => save.menu.includes(d.id)) : drinks;
  return onMenu.filter((d) => !d.requires_upgrade || save.upgrades.includes(d.requires_upgrade));
}

/** 这支豆子能做哪几款饮品，且库存够出一杯。 */
export function brewableWith(save: PlayerSave, bean: CoffeeBean): Drink[] {
  const stock = portionsOf(save, bean.id);
  return availableDrinks(save).filter((d) => bean.usable_drinks.includes(d.id) && stock >= d.bean_cost);
}

/**
 * 出一杯：扣豆、记收入与原料成本、记当日出杯数。
 * 失败时原样返回存档并给出可展示的理由（方案 §12 第 11 条要求可重试的反馈）。
 * opts 是本批新增的口径（M2 / M3）：经济模式、收入覆盖、附带的 effects。
 * 应急豆（M1.4）成本 0、不扣库存、收入照记，其余流程与正常豆完全一致。
 */
export function serveDrink(save: PlayerSave, drink: Drink, beanId: string, opts?: ServeOptions) {
  const emergency = beanId === EMERGENCY_BEAN_ID;
  const bean = beans.find((b) => b.id === beanId) ?? (emergency ? EMERGENCY_BEAN : undefined);
  if (!bean) return { save, ok: false as const, reason: '仓库里没有这支豆子' };
  if (!bean.usable_drinks.includes(drink.id)) {
    return { save, ok: false as const, reason: `${bean.name}做不了${drink.name}` };
  }
  if (drink.requires_upgrade && !save.upgrades.includes(drink.requires_upgrade)) {
    const need = UPGRADES.find((u) => u.id === drink.requires_upgrade)?.name ?? drink.requires_upgrade;
    return { save, ok: false as const, reason: `${drink.name}要先完成「${need}」` };
  }
  const stock = portionsOf(save, beanId);
  if (stock < drink.bean_cost) {
    return { save, ok: false as const, reason: `${bean.name}只剩 ${stock} 份，做${drink.name}要 ${drink.bean_cost} 份` };
  }

  const price = opts?.incomeOverride ?? drink.price;
  const cost = emergency ? 0 : cupCost(bean, drink);
  const extra = opts?.extraEffects ?? {};
  // 现金按净额过 applyEffects（走统一的夹取与变化文案），附带的 effects 一并落地——这一杯只写一次账
  const { save: next, changes } = applyEffects(
    save,
    { ...extra, money: (extra.money ?? 0) + price - cost },
    opts?.eco,
  );
  // 库存自己扣：applyEffects 会把库存减少记成 wasted，但卖出去的不是浪费。应急豆不占库存，跳过
  if (!emergency) {
    next.inventory[beanId] = Math.max(stateKeys.inventory.min, stock - drink.bean_cost);
    changes.push(`${bean.name} 库存 -${drink.bean_cost}`);
  }
  // 收入与原料成本分开记，结算页才拆得开
  next.today.revenue = save.today.revenue + price;
  next.today.cost = save.today.cost + cost;
  next.today.drinks_served[drink.id] = (next.today.drinks_served[drink.id] ?? 0) + 1;

  return {
    save: next,
    ok: true as const,
    reason: `用${bean.name}做了一杯${drink.name}，收 ${price}`,
    changes,
  };
}

/** 剧情走完了吗：没有待办关卡，且完成的关卡数够得上全部关卡（M3.1）。 */
export function isStoryComplete(save: PlayerSave): boolean {
  return !save.current_stage && save.completed_stages.length >= stages.length;
}

/** 收工：满意度换算成当日评价，流水清零，体力恢复。 */
export function closeDay(save: PlayerSave) {
  const next: PlayerSave = structuredClone(save);
  next.satisfaction_today = numeric.satisfaction_today.init;
  next.energy = numeric.energy.init;
  next.today = emptyLedger();
  return next;
}

/** 结算一关：发奖励、记完成、置 flag、记当日流水、推进到下一关。 */
export function settleStage(save: PlayerSave, stage: Stage, choice: Choice) {
  const { save: next, changes } = applyEffects(save, {
    money: stage.reward.money,
    reputation: stage.reward.reputation,
  });

  for (const flag of choice.set_flags ?? []) next.flags[flag] = true;

  for (const kid of stage.reward.unlock_knowledge ?? []) {
    if (!next.unlocked_knowledge.includes(kid)) {
      next.unlocked_knowledge.push(kid);
      next.today.knowledge_gained.push(kid);
    }
  }
  for (const up of stage.reward.unlock_upgrade ?? []) {
    if (!next.upgrades.includes(up)) next.upgrades.push(up);
  }
  if (!next.completed_stages.includes(stage.id)) next.completed_stages.push(stage.id);

  // 有客人出场的关卡记一位接待，选对或可接受算满意
  if (stage.characters.includes('customer')) {
    next.today.customers += 1;
    if (choice.result !== 'wrong') next.today.satisfied += 1;
  }

  next.current_stage = choice.next_stage ?? stage.next_stage ?? '';
  // 跨章推进时把章节号同步过来，否则店内面包屑会一直停在第一章
  const nextChapter = next.current_stage ? getStage(next.current_stage)?.chapter : undefined;
  if (nextChapter) next.current_chapter = nextChapter;

  return { save: next, changes };
}

/* ---------- 存档位 ----------
 * 同一台浏览器可以开多个档，各自独立进度。档位清单存在 PROFILE_KEY，
 * 每个档的存档体另存一份，键是 saveKey(id)。全部走 localStorage，没有后端，
 * 所以换设备/换浏览器带不走——要跨设备就用存档码（share.ts）。
 * 读写全走 store.ts 的薄封装：读不到 / 写不进都降级成「玩得动但存不下」。
 */
export interface Profile {
  id: string;
  name: string;
  /** 最后一次写盘的时间戳，用来在档位列表里排序和显示 */
  updated_at: number;
}

const saveKey = (id: string) => `yuwen-cafe-save-v2:${id}`;
const PROFILE_KEY = 'yuwen-cafe-profiles-v1';
const ACTIVE_KEY = 'yuwen-cafe-active-v1';

/** 档位清单，最近玩过的排在前面 */
export function listProfiles(): Profile[] {
  return readJson<Profile[]>(PROFILE_KEY, []).sort((a, b) => b.updated_at - a.updated_at);
}

/** 新建一个档并落盘初始存档。名字重复不拦，靠 id 区分。 */
export function createProfile(name: string, now = Date.now()): Profile {
  const clean = name.trim() || '学徒';
  const id = `p${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const profile: Profile = { id, name: clean, updated_at: now };
  writeJson(PROFILE_KEY, [...readJson<Profile[]>(PROFILE_KEY, []), profile]);
  persistSave(id, createSave(clean));
  setActiveProfile(id);
  return profile;
}

export function deleteProfile(id: string) {
  writeJson(PROFILE_KEY, readJson<Profile[]>(PROFILE_KEY, []).filter((p) => p.id !== id));
  removeKey(saveKey(id));
  if (activeProfileId() === id) setActiveProfile('');
}

export function activeProfileId(): string {
  try {
    return store()?.getItem(ACTIVE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setActiveProfile(id: string) {
  try {
    store()?.setItem(ACTIVE_KEY, id);
  } catch {
    // 同上
  }
}

export function loadSave(id: string): PlayerSave | null {
  if (!id) return null;
  const save = readJson<PlayerSave | null>(saveKey(id), null);
  if (!save) return null;
  // 老存档没有饮品相关字段，补上默认值，避免刷新后白屏
  save.menu ??= [];
  save.today ??= emptyLedger();
  save.today.drinks_served ??= {};
  return save;
}

export function persistSave(id: string, save: PlayerSave, now = Date.now()) {
  if (!id) return;
  writeJson(saveKey(id), save);
  const list = readJson<Profile[]>(PROFILE_KEY, []);
  const hit = list.find((p) => p.id === id);
  if (hit) {
    hit.updated_at = now;
    hit.name = save.player_name;
    writeJson(PROFILE_KEY, list);
  }
}

/**
 * 把 v1 时代那个单一存档搬进档位系统，只在还没有任何档位时做一次。
 * 旧档的现金是按「整袋价当每份成本」的错误算法攒出来的，几乎必然见底，
 * 所以顺手补到开局值，否则搬过来也是个走不动的死档。
 */
export function migrateLegacySave(now = Date.now()): Profile | null {
  const legacy = readJson<PlayerSave | null>('yuwen-cafe-save-v1', null);
  if (!legacy || listProfiles().length) return null;
  const profile = createProfile(legacy.player_name || '旧存档', now);
  legacy.menu ??= [];
  legacy.today ??= emptyLedger();
  legacy.today.drinks_served ??= {};
  legacy.money = Math.max(legacy.money, numeric.money.init);
  persistSave(profile.id, legacy, now);
  removeKey('yuwen-cafe-save-v1');
  return profile;
}
