// M1 / M2 / M3 的数值面：进度安全（买豆 + 应急豆）、经济口径、通关后的自由营业日循环。
// 界面不在这里测——这一层全是纯函数与薄存储，node 环境跑得动，也不需要 DOM。
import { beforeEach, describe, expect, it } from 'vitest';
import type { CoffeeBean, Drink, PlayerSave } from '../../contracts/types';
import {
  type BusinessRecord,
  applyServe,
  dayGuestCount,
  freshRecord,
  guestPool,
  nextDay,
  planDay,
  rateOrder,
  rng,
} from '../src/business';
import { GRADE_SATISFACTION } from '../src/brew';
import { beans, drinks, getStage, stages } from '../src/data/loader';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, withRelaxedEconomy } from '../src/settings';
import {
  EMERGENCY_BEAN_ID,
  UPGRADES,
  applyEffects,
  availableDrinks,
  brewableWith,
  buyBean,
  buyUpgrade,
  canBrewAnything,
  closeDay,
  createSave,
  displayMoney,
  isStoryComplete,
  serveDrink,
  settleStage,
} from '../src/state';

const cheapestBean = (): CoffeeBean =>
  [...beans].sort((a, b) => a.purchase_price - b.purchase_price)[0];

/** 有货又做得了的豆优先；一支都没有就用柜台下面那袋应急豆（M1.4）。 */
function serveOnce(save: PlayerSave) {
  const bean = beans.find((b) => (save.inventory[b.id] ?? 0) > 0 && brewableWith(save, b).length > 0);
  const drink = bean ? brewableWith(save, bean)[0] : availableDrinks(save)[0];
  return serveDrink(save, drink, bean ? bean.id : EMERGENCY_BEAN_ID, {
    extraEffects: { satisfaction_today: GRADE_SATISFACTION['好'] },
  });
}

/** 走一遍剧情：客人关先端出一杯，再挑一个非 wrong 的选项。 */
function walkStory(start: PlayerSave, limit = 200) {
  let save = start;
  let steps = 0;
  let servedAt = 0;
  let dips = 0;
  while (save.current_stage && steps < limit) {
    steps += 1;
    const stage = getStage(save.current_stage)!;
    if (stage.characters.includes('customer')) {
      const before = save.money;
      const r = serveOnce(save);
      expect(r.ok, `${stage.id} 端不出这一杯：${r.reason}`).toBe(true);
      save = r.save;
      servedAt += 1;
      if (save.money < before) dips += 1;
    }
    const choice = stage.choices.find((c) => c.result !== 'wrong')!;
    const before = save.money;
    save = settleStage(applyEffects(save, choice.effects).save, stage, choice).save;
    if (save.money < before) dips += 1;
  }
  return { save, steps, servedAt, dips };
}

describe('M1 进度安全', () => {
  it('50 关贪心通关：关卡走空、章节标记收齐、通关判定为真', () => {
    const { save, steps, servedAt } = walkStory(createSave('通关测试'));
    expect(stages.length).toBe(50);
    expect(save.current_stage).toBe('');
    expect(steps).toBe(50);
    expect(save.completed_stages).toHaveLength(50);
    expect(servedAt).toBe(11); // 客人关 11 个，每个都端出了一杯
    expect(isStoryComplete(save)).toBe(true);
    // 通关两条件缺一不可：关卡没走空，或关卡没收齐，都不算通关
    expect(isStoryComplete({ ...save, current_stage: stages[stages.length - 1].id })).toBe(false);
    expect(isStoryComplete({ ...save, completed_stages: save.completed_stages.slice(0, -1) })).toBe(false);
    expect(isStoryComplete(createSave('新手'))).toBe(false);
    expect(save.money).toBeGreaterThanOrEqual(0);
    expect(save.energy).toBeGreaterThanOrEqual(0);
    expect(save.reputation).toBeGreaterThanOrEqual(0);
    expect(save.reputation).toBeLessThanOrEqual(100);
  });

  it('旧档自愈：0 豆 0 现金走进客人关照样有出路，走完还攒得下一袋豆', () => {
    const broke: PlayerSave = { ...createSave('断豆档'), inventory: {}, money: 0 };
    expect(canBrewAnything(broke)).toBe(false);

    const { save, servedAt } = walkStory(broke);
    expect(servedAt).toBe(11);
    expect(save.current_stage).toBe('');
    expect(save.money).toBeGreaterThanOrEqual(cheapestBean().purchase_price);
    expect(buyBean(save, cheapestBean().id).ok).toBe(true);
  });

  it('canBrewAnything：有货能做杯为真，断豆为假（应急豆不算库存）', () => {
    expect(canBrewAnything(createSave())).toBe(true);

    const noStock: PlayerSave = { ...createSave(), inventory: {} };
    expect(canBrewAnything(noStock)).toBe(false);

    // 有这支豆的键、份数为 0，仍然是断豆
    const zeroed: PlayerSave = { ...createSave(), inventory: { [beans[0].id]: 0 } };
    expect(canBrewAnything(zeroed)).toBe(false);

    // 库存只剩一支做不了任何饮品的豆
    const useless: PlayerSave = { ...createSave(), inventory: { [beans[0].id]: 3, [beans[1].id]: 0 } };
    expect(canBrewAnything({ ...useless, inventory: { [beans[0].id]: 0 } })).toBe(false);
  });

  it('买豆：扣整袋价、到货 20 份、当日成本记账', () => {
    const bean = cheapestBean();
    const save = createSave();
    const r = buyBean(save, bean.id);
    expect(r.ok).toBe(true);
    expect(r.save.money).toBe(save.money - bean.purchase_price);
    expect(r.save.inventory[bean.id]).toBe(20);
    expect(r.save.today.cost).toBe(bean.purchase_price);
    expect(r.save.today.revenue).toBe(0);
    // 原存档不被改动
    expect(save.inventory[bean.id]).toBeUndefined();
  });

  it('买豆边界：钱刚好买下、差 1 块被拒', () => {
    const bean = cheapestBean();
    const exact: PlayerSave = { ...createSave(), money: bean.purchase_price };
    const ok = buyBean(exact, bean.id);
    expect(ok.ok).toBe(true);
    expect(ok.save.money).toBe(0);
    expect(ok.save.inventory[bean.id]).toBe(20);

    const short: PlayerSave = { ...createSave(), money: bean.purchase_price - 1 };
    const failed = buyBean(short, bean.id);
    expect(failed.ok).toBe(false);
    expect(failed.reason).toBe('现金不够，还差 1');
    expect(failed.save.money).toBe(short.money);
    expect(failed.save.inventory[bean.id]).toBeUndefined();
  });

  it('买豆：宽松模式下不拦钱、余额不动、流水仍按原价记', () => {
    const bean = cheapestBean();
    const broke: PlayerSave = { ...createSave(), money: 0 };
    const r = buyBean(broke, bean.id, { unlimited: true });
    expect(r.ok).toBe(true);
    expect(r.save.money).toBe(0);
    expect(r.save.inventory[bean.id]).toBe(20);
    expect(r.save.today.cost).toBe(bean.purchase_price);
  });

  it('买豆：不存在的豆被拒，存档原样返回', () => {
    const save = createSave();
    const r = buyBean(save, 'bean-不存在');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('没有这支豆子');
    expect(r.save).toBe(save);
  });

  it('应急出杯：0 成本、不占库存、收入照记', () => {
    const broke: PlayerSave = { ...createSave(), inventory: {}, money: 0 };
    const drink = availableDrinks(broke)[0];
    const r = serveDrink(broke, drink, EMERGENCY_BEAN_ID);
    expect(r.ok).toBe(true);
    expect(r.save.money).toBe(drink.price);
    expect(r.save.today.revenue).toBe(drink.price);
    expect(r.save.today.cost).toBe(0);
    expect(r.save.inventory).toEqual({});
    expect(r.save.today.drinks_served[drink.id]).toBe(1);
  });

  it('应急出杯自愈闭合：一杯攒够最便宜一袋豆的钱', () => {
    const broke: PlayerSave = { ...createSave(), inventory: {}, money: 0 };
    const drink = availableDrinks(broke)[0];
    let save = serveDrink(broke, drink, EMERGENCY_BEAN_ID).save;
    expect(save.money).toBeGreaterThanOrEqual(cheapestBean().purchase_price);

    const bought = buyBean(save, cheapestBean().id);
    save = bought.save;
    expect(bought.ok).toBe(true);
    expect(save.inventory[cheapestBean().id]).toBe(20);
    expect(canBrewAnything(save)).toBe(true);
  });

  it('应急出杯：饮品未解锁时按升级条件被拒', () => {
    // 应急豆能做的饮品清单就是全部饮品，所以这里要卡住的是升级条件那一关
    const locked: Drink = { ...drinks[0], requires_upgrade: 'brewer' };
    const r = serveDrink(createSave(), locked, EMERGENCY_BEAN_ID);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(`${locked.name}要先完成「更换冲煮设备」`);

    // 升级到位就放行
    const equipped: PlayerSave = { ...createSave(), upgrades: ['brewer'] };
    expect(serveDrink(equipped, locked, EMERGENCY_BEAN_ID).ok).toBe(true);
  });
});

describe('M2 经济放宽', () => {
  it('宽松开启：负值免扣、余额不动、流水按原始金额记成本', () => {
    const save = createSave();
    const r = applyEffects(save, { money: -80 }, { unlimited: true });
    expect(r.save.money).toBe(save.money);
    expect(r.save.today.cost).toBe(80);
    expect(r.changes).toEqual([]);
  });

  it('宽松开启：正值照记，进余额也进当日收入', () => {
    const save = createSave();
    const r = applyEffects(save, { money: 22 }, { unlimited: true });
    expect(r.save.money).toBe(save.money + 22);
    expect(r.save.today.revenue).toBe(22);
    expect(r.changes).toContain('现金 +22');
  });

  it('缺省与显式关闭：都按真实经济扣钱', () => {
    const save = createSave();
    expect(applyEffects(save, { money: -80 }).save.money).toBe(save.money - 80);
    expect(applyEffects(save, { money: -80 }, { unlimited: false }).save.money).toBe(save.money - 80);
    expect(applyEffects(save, { money: -80 }, { unlimited: false }).save.today.cost).toBe(80);
  });

  it('买升级：宽松关闭时行为与今日一致，宽松开启时不拦钱', () => {
    const grinder = UPGRADES.find((u) => u.id === 'grinder')!;
    const broke: PlayerSave = { ...createSave(), money: 10 };

    const strict = buyUpgrade(broke, 'grinder', { unlimited: false });
    expect(strict.ok).toBe(false);
    expect(strict.reason).toBe(`现金不够，还差 ${grinder.cost - 10}`);
    expect(buyUpgrade(broke, 'grinder').ok).toBe(false); // 缺省 = 真实经济

    const relaxed = buyUpgrade(broke, 'grinder', { unlimited: true });
    expect(relaxed.ok).toBe(true);
    expect(relaxed.save.money).toBe(10);
    expect(relaxed.save.upgrades).toContain('grinder');
    expect(relaxed.save.flags.grinder_repaired).toBe(true);
  });

  it('displayMoney：宽松显示 ∞，否则显示余额', () => {
    const save = { ...createSave(), money: 1234 };
    expect(displayMoney(save, true)).toBe('∞');
    expect(displayMoney(save, false)).toBe('1234');
  });

  it('设置：缺省宽松开着，翻转是纯函数', () => {
    expect(DEFAULT_SETTINGS.relaxedEconomy).toBe(true);

    const before = { relaxedEconomy: true };
    const after = withRelaxedEconomy(before, false);
    expect(after).toEqual({ relaxedEconomy: false });
    expect(before).toEqual({ relaxedEconomy: true }); // 不改入参
  });
});

describe('M3 自由营业日循环', () => {
  /** 通关档 + 满仓豆 + 中等口碑：日循环能一路跑下去的前提 */
  const businessSave = (reputation = 30): PlayerSave => ({
    ...walkStory(createSave('营业测试')).save,
    inventory: Object.fromEntries(beans.map((b) => [b.id, 30])),
    money: 3000,
    energy: 5,
    reputation,
  });

  const beanFor = (save: PlayerSave, drinkId: string) =>
    beans.find((b) => b.usable_drinks.includes(drinkId) && (save.inventory[b.id] ?? 0) > 0);

  it('客流：口碑 0 起步恒为 2 位，75 起封顶 5 位', () => {
    expect(dayGuestCount(0)).toBe(2);
    expect(dayGuestCount(25)).toBe(3);
    expect(dayGuestCount(30)).toBe(3);
    expect(dayGuestCount(50)).toBe(4);
    expect(dayGuestCount(75)).toBe(5);
    expect(dayGuestCount(100)).toBe(5);
  });

  it('订单生成：客人来自非玩家池、饮品做得出、偏好落在能做的豆上', () => {
    const save = businessSave(30);
    const orderable = new Set(availableDrinks(save).map((d) => d.id));
    const poolIds = new Set(guestPool().map((g) => g.id));
    expect(guestPool()).toHaveLength(6);
    expect(poolIds.has('player')).toBe(false);

    const byDrink = new Map(
      drinks.map((d) => [d.id, new Set(beans.filter((b) => b.usable_drinks.includes(d.id)).flatMap((b) => b.flavor_tags))]),
    );

    // 日期靠 nextDay 往前走：planSeed 取 day 与口碑，逐日重排
    let rec = freshRecord();
    for (let day = 1; day <= 20; day += 1) {
      rec = planDay(rec, save);
      expect(rec.day).toBe(day);
      expect(rec.orders).toHaveLength(dayGuestCount(save.reputation));
      expect(rec.phase).toBe('serving');
      for (const order of rec.orders) {
        expect(poolIds.has(order.guestId), `${order.guestId} 不在客人池`).toBe(true);
        expect(orderable.has(order.drinkId), `${order.drinkId} 做不出来`).toBe(true);
        for (const tag of order.preferTags) {
          expect(byDrink.get(order.drinkId)!.has(tag), `偏好 ${tag} 没有豆做得到`).toBe(true);
        }
        expect(order.text).toContain(order.guestName);
        expect(order.text).toContain(drinks.find((d) => d.id === order.drinkId)!.name);
      }
      rec = nextDay(rec);
    }
  });

  it('订单生成：口碑 ≥ 60 时取 2 个偏好，且这两个偏好同在一支豆上', () => {
    const save = businessSave(60);
    const unionOf = new Map(
      drinks.map((d) => [
        d.id,
        new Set(beans.filter((b) => b.usable_drinks.includes(d.id)).flatMap((b) => b.flavor_tags)),
      ]),
    );
    let rec = freshRecord();
    let twoTagOrders = 0;
    for (let day = 1; day <= 20; day += 1) {
      rec = planDay(rec, save);
      for (const order of rec.orders) {
        expect(order.preferTags.length).toBeGreaterThanOrEqual(1);
        expect(order.preferTags.length).toBeLessThanOrEqual(2);
        // 偏好取自「能做这杯的豆的标签并集」——不是某一支豆的标签子集
        for (const tag of order.preferTags) {
          expect(unionOf.get(order.drinkId)!.has(tag), `偏好 ${tag} 不在并集里`).toBe(true);
        }
        const together = beans.some((b) => order.preferTags.every((t) => b.flavor_tags.includes(t)));
        expect(together, `第 ${day} 天的『${order.preferTags.join('、')}』找不齐同一支豆`).toBe(true);
        if (order.preferTags.length === 2) twoTagOrders += 1;
      }
      rec = nextDay(rec);
    }
    // 数据里有能凑成双标签的豆 ⇒ 高口碑下两个偏好的路径真的会被走到
    expect(twoTagOrders).toBeGreaterThan(0);
  });

  it('订单生成：同一天重排结果一致（入场即固化，可重放）', () => {
    const save = businessSave(30);
    const a = planDay(freshRecord(), save);
    const b = planDay(freshRecord(), save);
    expect(b.orders).toEqual(a.orders);
    expect(b.planSeed).toBe(a.planSeed);

    // 换一天换一批客人：种子取自日计数与口碑
    const next = planDay(nextDay(a), save);
    expect(next.day).toBe(2);
    expect(next.planSeed).not.toBe(a.planSeed);
    expect(next.planSeed).toBe(2 * 7919 + save.reputation);
  });

  it('生成器覆盖 6 位客人 × 全部可出饮品', () => {
    const save = businessSave(75);
    const guests = new Set<string>();
    const menu = new Set<string>();
    let rec = freshRecord();
    for (let day = 1; day <= 60; day += 1) {
      rec = planDay(rec, save);
      for (const order of rec.orders) {
        guests.add(order.guestId);
        menu.add(order.drinkId);
      }
      rec = nextDay(rec);
    }
    expect([...guests].sort()).toEqual(guestPool().map((g) => g.id).sort());
    expect([...menu].sort()).toEqual(availableDrinks(save).map((d) => d.id).sort());
  });

  it('三段判定：饮品对 + 豆全中 + 手法好 = 3★', () => {
    const bean = beans.find((b) => b.flavor_tags.length > 0)!;
    const drink = drinks.find((d) => bean.usable_drinks.includes(d.id))!;
    const order = {
      id: 'o1',
      guestId: 'guyan',
      guestName: '顾言',
      drinkId: drink.id,
      preferTags: [bean.flavor_tags[0]],
      text: '',
    };
    const rated = rateOrder(order, drink, bean, '好');
    expect(rated.ok).toBe(true);
    if (!rated.ok) return;
    expect(rated.stars).toBe(3);
    expect(rated.income).toBe(Math.round(drink.price * 1.5));
    expect(rated.extraEffects.satisfaction_today).toBe(9);
    expect(rated.extraEffects.reputation).toBe(1);
    expect(rated.extraEffects.trust?.['guyan']).toBe(2);
    expect(rated.lines.length).toBeGreaterThanOrEqual(3);
    expect(rated.lines[2]).toContain('3★');
  });

  it('三段判定：豆部分命中 + 手法一般 = 2★，收入 ×1.2', () => {
    const bean = beans.find((b) => b.flavor_tags.length > 0)!;
    const drink = drinks.find((d) => bean.usable_drinks.includes(d.id))!;
    const order = {
      id: 'o2',
      guestId: 'linshu',
      guestName: '林叔',
      drinkId: drink.id,
      preferTags: [bean.flavor_tags[0], '这颗豆没有的标签'],
      text: '',
    };
    const rated = rateOrder(order, drink, bean, '一般');
    expect(rated.ok).toBe(true);
    if (!rated.ok) return;
    expect(rated.stars).toBe(2);
    expect(rated.income).toBe(Math.round(drink.price * 1.2));
    expect(rated.extraEffects.reputation).toBe(0);
    expect(rated.extraEffects.trust?.['linshu']).toBe(1);
    expect(rated.lines[1]).toContain('缺');
  });

  it('三段判定：豆全不中 + 手法失误 = 1★（下界），收入 ×1.0、口碑 −1', () => {
    const bean = beans.find((b) => b.flavor_tags.length > 0)!;
    const drink = drinks.find((d) => bean.usable_drinks.includes(d.id))!;
    const order = {
      id: 'o4',
      guestId: 'chenshu',
      guestName: '陈叔',
      drinkId: drink.id,
      preferTags: ['这颗豆完全没有的标签'],
      text: '',
    };
    const rated = rateOrder(order, drink, bean, '失误');
    expect(rated.ok).toBe(true);
    if (!rated.ok) return;
    expect(rated.stars).toBe(1);
    expect(rated.income).toBe(Math.round(drink.price * 1.0));
    expect(rated.extraEffects.satisfaction_today).toBe(3);
    expect(rated.extraEffects.reputation).toBe(-1);
    expect(rated.extraEffects.trust?.['chenshu']).toBe(0);
  });

  it('三段判定：端上别的饮品被拒，客流不消耗', () => {
    const bean = beans.find((b) => b.flavor_tags.length > 0)!;
    const drink = drinks[0];
    const other = drinks.find((d) => d.id !== drink.id)!;
    const order = { id: 'o3', guestId: 'guyan', guestName: '顾言', drinkId: other.id, preferTags: [], text: '' };
    const rated = rateOrder(order, drink, bean, '好');
    expect(rated.ok).toBe(false);
    if (rated.ok) return;
    expect(rated.reason).toBe('这不是这单要的那杯');
  });

  it('通关档连跑 12 天：数值全在界限内，没有一天卡住', () => {
    const save = businessSave(30);
    let rec: BusinessRecord = freshRecord();
    let current = save;
    let guests = 0;
    let income = 0;

    for (let day = 0; day < 12; day += 1) {
      rec = planDay(rec, current);
      expect(rec.day).toBe(day + 1);
      expect(rec.phase).toBe('serving');
      expect(rec.orders.length).toBeGreaterThanOrEqual(2);
      expect(rec.orders.length).toBeLessThanOrEqual(5);

      while (rec.phase === 'serving') {
        const order = rec.orders[rec.served];
        expect(order, `第 ${rec.day} 天第 ${rec.served + 1} 单缺订单`).toBeDefined();
        const drink = drinks.find((d) => d.id === order.drinkId)!;
        const bean = beanFor(current, order.drinkId) ?? beans.find((b) => b.usable_drinks.includes(order.drinkId))!;
        const rated = rateOrder(order, drink, bean, '好');
        expect(rated.ok, `第 ${rec.day} 天判定失败：${rated.ok ? '' : rated.reason}`).toBe(true);
        if (!rated.ok) break;

        const served = serveDrink(current, drink, bean.id, {
          incomeOverride: rated.income,
          extraEffects: { ...rated.extraEffects, energy: -1 }, // 每位客人耗 1 点精力
        });
        expect(served.ok, `第 ${rec.day} 天出杯失败：${served.reason}`).toBe(true);
        if (!served.ok) break;
        expect(served.save.energy).toBe(Math.max(0, current.energy - 1));
        current = served.save;
        rec = applyServe(rec, {
          stars: rated.stars,
          income: rated.income,
          beanId: bean.id,
          energyLeft: current.energy,
        });
        guests += 1;
        income += rated.income;
        expect(current.energy).toBeGreaterThanOrEqual(0);
        expect(current.energy).toBeLessThanOrEqual(5);
        expect(current.money).toBeGreaterThanOrEqual(0);
        expect(current.reputation).toBeGreaterThanOrEqual(0);
        expect(current.reputation).toBeLessThanOrEqual(100);
        expect(current.satisfaction_today).toBeGreaterThanOrEqual(0);
      }

      expect(rec.served).toBe(rec.orders.length); // 精力够，客人就做得完
      expect(rec.stars).toHaveLength(rec.served);
      expect(rec.income).toBeGreaterThan(0);

      current = closeDay(current);
      expect(current.energy).toBe(5);
      expect(current.today.revenue).toBe(0);
      rec = nextDay(rec);
      expect(rec.phase).toBe('open');
      expect(rec.day).toBe(day + 2);
      expect(Object.keys(rec.usedBeans).length).toBeGreaterThan(0); // 豆种图鉴跨日累计
    }

    expect(guests).toBeGreaterThanOrEqual(24); // 12 天每天至少 2 位
    expect(income).toBeGreaterThan(0);
  });

  it('精力耗尽：出杯后当日收工，余下客人不接待', () => {
    const save: PlayerSave = { ...businessSave(30), energy: 1 };
    const rec = planDay(freshRecord(), save);
    expect(rec.orders.length).toBeGreaterThanOrEqual(3);

    const order = rec.orders[0];
    const drink = drinks.find((d) => d.id === order.drinkId)!;
    const bean = beanFor(save, order.drinkId)!;
    const rated = rateOrder(order, drink, bean, '好');
    expect(rated.ok).toBe(true);
    if (!rated.ok) return;

    const served = serveDrink(save, drink, bean.id, {
      incomeOverride: rated.income,
      extraEffects: { ...rated.extraEffects, energy: -1 },
    });
    expect(served.save.energy).toBe(0);

    const after = applyServe(rec, {
      stars: rated.stars,
      income: rated.income,
      beanId: bean.id,
      energyLeft: served.save.energy,
    });
    expect(after.phase).toBe('settled');
    expect(after.served).toBe(1);
    expect(after.orders.length - after.served).toBeGreaterThanOrEqual(2); // 余下的客人改天再来
  });

  it('日终：精力回满、流水清零，日计数 +1，口碑与图鉴留着', () => {
    const save = businessSave(40);
    const served = serveDrink(save, drinks[0], beanFor(save, drinks[0].id)!.id, { incomeOverride: 20 });
    expect(served.ok).toBe(true);
    const rec = applyServe(planDay(freshRecord(), served.save), {
      stars: 3,
      income: 20,
      beanId: beanFor(save, drinks[0].id)!.id,
      energyLeft: served.save.energy,
    });

    const closed = closeDay(served.save);
    expect(closed.energy).toBe(5);
    expect(closed.satisfaction_today).toBe(0);
    expect(closed.today.revenue).toBe(0);
    expect(closed.today.cost).toBe(0);
    expect(closed.reputation).toBe(served.save.reputation);

    const next = nextDay(rec);
    expect(next.day).toBe(2);
    expect(next.phase).toBe('open');
    expect(next.served).toBe(0);
    expect(next.stars).toEqual([]);
    expect(next.orders).toEqual([]);
    expect(Object.keys(next.usedBeans)).toEqual(Object.keys(rec.usedBeans));
  });

  it('rng：同种子同序列，取值落在 [0,1)', () => {
    const a = rng(7919);
    const b = rng(7919);
    for (let i = 0; i < 5; i += 1) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(rng(1)()).not.toBe(rng(2)());
  });
});

/** 存档位替身：settings 走 store.ts，而 store.ts 每次都现取 globalThis.localStorage。 */
function stubStorage() {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
  };
  return map;
}

describe('设置落盘', () => {
  beforeEach(() => {
    stubStorage();
  });

  it('写一遍读一遍，值不丢', () => {
    saveSettings({ relaxedEconomy: false });
    expect(loadSettings()).toEqual({ relaxedEconomy: false });
  });

  it('存档里是坏值时回落缺省，不抛', () => {
    stubStorage().set('yuwen-cafe-settings-v1', '{"relaxedEconomy":"是的"}');
    expect(loadSettings().relaxedEconomy).toBe(true);
    stubStorage().set('yuwen-cafe-settings-v1', '不是 JSON');
    expect(loadSettings().relaxedEconomy).toBe(true);
  });
});
