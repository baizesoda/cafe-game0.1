// 经营数值与存档。数值键与边界全部取自 contracts/state-keys.json，不在代码里另写魔法数。
import type { Choice, CoffeeBean, DailyLedger, Drink, Effects, PlayerSave, Stage, UpgradeId } from '../../contracts/types';
import stateKeys from '../../contracts/state-keys.json';
import { beans, drinks, firstStageId, getStage } from './data/loader';

const SAVE_KEY = 'yuwen-cafe-save-v1';

type NumericKey = 'money' | 'reputation' | 'satisfaction_today' | 'energy';

const numeric = stateKeys.numeric as Record<NumericKey, { label: string; init: number; min: number; max: number | null }>;

export const numericLabels = Object.entries(numeric).map(([key, cfg]) => ({
  key: key as NumericKey,
  label: cfg.label,
  // max 为 null 的数值（现金）没有上限，HUD 里显示成计数器而不是进度条
  max: cfg.max,
}));

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
export function applyEffects(save: PlayerSave, effects: Effects) {
  const next: PlayerSave = structuredClone(save);
  const changes: string[] = [];

  for (const { key, label } of numericLabels) {
    const delta = effects[key];
    if (!delta) continue;
    const before = next[key];
    next[key] = clampNumeric(key, before + delta);
    const real = next[key] - before;
    if (real !== 0) changes.push(`${label} ${real > 0 ? '+' : ''}${real}`);
  }

  // 现金的正负分别记成收入和原料成本，供每日结算页拆开展示
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
export function buyUpgrade(save: PlayerSave, id: UpgradeId) {
  const item = UPGRADES.find((u) => u.id === id);
  if (!item) return { save, ok: false as const, reason: '没有这项升级' };
  if (save.upgrades.includes(id)) return { save, ok: false as const, reason: '已经升级过了' };
  if (save.money < item.cost) return { save, ok: false as const, reason: `现金不够，还差 ${item.cost - save.money}` };

  const { save: next } = applyEffects(save, { money: -item.cost });
  next.upgrades.push(id);
  if (id === 'grinder') next.flags.grinder_repaired = true;
  return { save: next, ok: true as const, reason: `${item.name}完成：${item.effect}` };
}

/** 菜单上现在能点的饮品：存档指定了 menu 就按 menu，否则按升级条件过滤。 */
export function availableDrinks(save: PlayerSave): Drink[] {
  const onMenu = save.menu?.length ? drinks.filter((d) => save.menu.includes(d.id)) : drinks;
  return onMenu.filter((d) => !d.requires_upgrade || save.upgrades.includes(d.requires_upgrade));
}

/** 这支豆子能做哪几款饮品，且库存够出一杯。 */
export function brewableWith(save: PlayerSave, bean: CoffeeBean): Drink[] {
  const stock = save.inventory[bean.id] ?? 0;
  return availableDrinks(save).filter((d) => bean.usable_drinks.includes(d.id) && stock >= d.bean_cost);
}

/**
 * 出一杯：扣豆、记收入与原料成本、记当日出杯数。
 * 失败时原样返回存档并给出可展示的理由（方案 §12 第 11 条要求可重试的反馈）。
 */
export function serveDrink(save: PlayerSave, drink: Drink, beanId: string) {
  const bean = beans.find((b) => b.id === beanId);
  if (!bean) return { save, ok: false as const, reason: '仓库里没有这支豆子' };
  if (!bean.usable_drinks.includes(drink.id)) {
    return { save, ok: false as const, reason: `${bean.name}做不了${drink.name}` };
  }
  if (drink.requires_upgrade && !save.upgrades.includes(drink.requires_upgrade)) {
    const need = UPGRADES.find((u) => u.id === drink.requires_upgrade)?.name ?? drink.requires_upgrade;
    return { save, ok: false as const, reason: `${drink.name}要先完成「${need}」` };
  }
  const stock = save.inventory[beanId] ?? 0;
  if (stock < drink.bean_cost) {
    return { save, ok: false as const, reason: `${bean.name}只剩 ${stock} 份，做${drink.name}要 ${drink.bean_cost} 份` };
  }

  // 现金按净额过 applyEffects（走统一的夹取与变化文案）
  const { save: next, changes } = applyEffects(save, {
    money: drink.price - bean.purchase_price * drink.bean_cost,
  });
  // 库存自己扣：applyEffects 会把库存减少记成 wasted，但卖出去的不是浪费
  next.inventory[beanId] = Math.max(stateKeys.inventory.min, stock - drink.bean_cost);
  changes.push(`${bean.name} 库存 -${drink.bean_cost}`);
  // 收入与原料成本分开记，结算页才拆得开
  next.today.revenue = save.today.revenue + drink.price;
  next.today.cost = save.today.cost + bean.purchase_price * drink.bean_cost;
  next.today.drinks_served[drink.id] = (next.today.drinks_served[drink.id] ?? 0) + 1;

  return {
    save: next,
    ok: true as const,
    reason: `用${bean.name}做了一杯${drink.name}，收 ${drink.price}`,
    changes,
  };
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

export function loadSave(): PlayerSave | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw) as PlayerSave;
    // 旧存档没有饮品相关字段，补上默认值，避免刷新后白屏
    save.menu ??= [];
    save.today ??= emptyLedger();
    save.today.drinks_served ??= {};
    return save;
  } catch {
    return null;
  }
}

export function persistSave(save: PlayerSave) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // 隐私模式下 localStorage 可能不可写，游戏仍可继续，只是刷新后丢进度
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // 同上
  }
}
