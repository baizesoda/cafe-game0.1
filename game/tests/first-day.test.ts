// 走一遍完整的「第一天营业」，对照方案 §12 的验收标准。
// 这里测的是数值逻辑与关卡串联，不测界面渲染。
import { beforeEach, describe, expect, it } from 'vitest';
import { beans, drinks, getStage, stages } from '../src/data/loader';
import {
  UPGRADES,
  activeProfileId,
  applyEffects,
  brewableWith,
  buyUpgrade,
  closeDay,
  createProfile,
  createSave,
  cupCost,
  deleteProfile,
  listProfiles,
  loadSave,
  migrateLegacySave,
  persistSave,
  serveDrink,
  settleStage,
} from '../src/state';

/** 挑一个非 wrong 的选项，模拟玩家做对 */
const goodChoice = (stageId: string) => {
  const stage = getStage(stageId)!;
  return stage.choices.find((c) => c.result !== 'wrong') ?? stage.choices[0];
};

describe('第一天营业闭环', () => {
  it('关卡数据能串成一条不断链的路线', () => {
    expect(stages.length).toBeGreaterThan(0);
    for (const s of stages) {
      if (s.next_stage) expect(getStage(s.next_stage), `${s.id} 的下一关缺失`).toBeDefined();
    }
  });

  it('从开局走到本章结束，数值与解锁都按预期变化', () => {
    let save = createSave('测试学徒');
    expect(save.money).toBe(3000);
    expect(save.current_stage).toBe('stage-1-1');

    // 第一章末尾已经接到第二章，所以走到章节号变化就停，别把后面几章也走完
    let guard = 0;
    while (save.current_stage && getStage(save.current_stage)?.chapter === 'chapter-01' && guard++ < 20) {
      const stage = getStage(save.current_stage)!;
      const choice = goodChoice(stage.id);
      save = applyEffects(save, choice.effects).save;
      save = settleStage(save, stage, choice).save;
    }

    // 走完第一章全部关卡，没有死循环，且顺势推进到第二章开头
    expect(save.current_stage).toBe('stage-2-1');
    expect(save.current_chapter).toBe('chapter-02');
    expect(save.completed_stages).toEqual([
      'stage-1-1',
      'stage-1-2',
      'stage-1-3',
      'stage-1-5',
      'stage-1-6',
      'stage-1-4',
    ]);

    // 至少解锁一张知识卡（验收标准 7）
    expect(save.unlocked_knowledge.length).toBeGreaterThan(0);
    // 至少触发一次信任度变化（验收标准 6）
    expect(save.trust.xiaoman).toBeGreaterThan(10);
    // 设备升级已解锁（验收标准 5）
    expect(save.upgrades).toContain('grinder');
    // 剧情标记写进了存档，桌面线索才有东西显示
    expect(save.flags.read_linshu_letter_1).toBe(true);
    // 当日流水记到了结算页需要的字段（第一章共 3 位客人，方案 §11.1）
    expect(save.today.customers).toBe(3);
    expect(save.today.satisfied).toBe(3);
    expect(save.today.revenue).toBeGreaterThan(0);
    expect(save.today.cost).toBeGreaterThan(0);
  });

  it('选错只损失可恢复的代价，不会卡死', () => {
    const save = createSave();
    const stage = getStage('stage-1-3')!;
    const wrong = stage.choices.find((c) => c.result === 'wrong')!;

    // 方案 §5：存在 wrong 选项的关卡必须给补救提示
    expect(stage.recovery).toBeTruthy();

    const after = settleStage(applyEffects(save, wrong.effects).save, stage, wrong);
    expect(after.save.money).toBeLessThan(save.money + 20); // 罚了钱但仍在推进
    expect(after.save.current_stage).toBe('stage-1-5');     // 不会 Game Over
    expect(after.save.today.satisfied).toBe(0);
  });

  it('数值不会越过 state-keys.json 的边界', () => {
    const save = createSave();
    const drained = applyEffects(save, { money: -9999, reputation: -9999, energy: -99 }).save;
    expect(drained.money).toBe(0);
    expect(drained.reputation).toBe(0);
    expect(drained.energy).toBe(0);

    const maxed = applyEffects(save, { reputation: 9999, energy: 99 }).save;
    expect(maxed.reputation).toBe(100);
    expect(maxed.energy).toBe(5);
  });
});

describe('设备升级', () => {
  it('现金够就扣钱生效，不够给出明确失败原因', () => {
    const grinder = UPGRADES.find((u) => u.id === 'grinder')!;
    const rich = createSave();
    const bought = buyUpgrade(rich, 'grinder');
    expect(bought.ok).toBe(true);
    expect(bought.save.money).toBe(rich.money - grinder.cost);
    expect(bought.save.upgrades).toContain('grinder');
    expect(bought.save.flags.grinder_repaired).toBe(true);

    // 不能重复买
    expect(buyUpgrade(bought.save, 'grinder').ok).toBe(false);

    const broke = { ...createSave(), money: 10 };
    const failed = buyUpgrade(broke, 'grinder');
    expect(failed.ok).toBe(false);
    expect(failed.reason).toContain('还差');
    expect(failed.save.money).toBe(10); // 失败不扣钱
  });
});

describe('出杯', () => {
  /** 开局库存里挑一支能做出饮品的豆子 */
  const atCounter = () => {
    const save = createSave();
    const bean = beans.find((b) => (save.inventory[b.id] ?? 0) > 0 && brewableWith(save, b).length > 0)!;
    expect(bean, '开局库存里没有一支豆子能做饮品').toBeDefined();
    return { save, bean, drink: brewableWith(save, bean)[0] };
  };

  it('出一杯：扣库存、记收入与原料成本，不算浪费', () => {
    const { save, bean, drink } = atCounter();
    const before = save.inventory[bean.id];
    const cost = cupCost(bean, drink);
    // 整袋价摊到份上之后，每杯都该是赚的，否则经营根本跑不起来
    expect(cost).toBeLessThan(drink.price);

    const r = serveDrink(save, drink, bean.id);
    expect(r.ok).toBe(true);
    expect(r.save.inventory[bean.id]).toBe(before - drink.bean_cost);
    expect(r.save.today.revenue).toBe(drink.price);
    expect(r.save.today.cost).toBe(cost);
    expect(r.save.today.drinks_served[drink.id]).toBe(1);
    expect(r.save.money).toBe(save.money + drink.price - cost);
    // 卖出去的豆子不是浪费
    expect(r.save.today.wasted).toBe(0);
    // 原存档不被改动
    expect(save.inventory[bean.id]).toBe(before);
  });

  it('库存不够时原样返回，并给出可重试的理由', () => {
    const { save, bean, drink } = atCounter();
    const empty = { ...save, inventory: { ...save.inventory, [bean.id]: 0 } };

    const r = serveDrink(empty, drink, bean.id);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain(bean.name);
    expect(r.save.money).toBe(save.money);
    expect(r.save.inventory[bean.id]).toBe(0);
    expect(r.save.today.drinks_served).toEqual({});
  });

  it('每支豆子的 usable_drinks 都能在饮品表里找到', () => {
    const ids = new Set(drinks.map((d) => d.id));
    for (const b of beans) {
      for (const did of b.usable_drinks) {
        expect(ids.has(did), `${b.id} 引用了不存在的饮品 ${did}`).toBe(true);
      }
    }
  });
});

describe('收工', () => {
  it('满意度与体力重置，流水清零，长期数值保留', () => {
    let save = createSave();
    save = applyEffects(save, { satisfaction_today: 40, energy: -3, reputation: 5 }).save;
    const next = closeDay(save);
    expect(next.satisfaction_today).toBe(0);
    expect(next.energy).toBe(5);
    expect(next.today.revenue).toBe(0);
    expect(next.reputation).toBe(35); // 口碑是长期数值，不重置
  });
});

/**
 * 存档位。state.ts 里每次读写都现取 globalThis.localStorage，
 * 所以装一个极简替身就能在 node 下跑，不用 jsdom。
 */
function stubStorage() {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
  };
  return map;
}

describe('存档位', () => {
  beforeEach(() => {
    stubStorage();
  });

  it('两个人各存一份，互不覆盖', () => {
    const a = createProfile('阿满');
    const b = createProfile('老陈');
    expect(a.id).not.toBe(b.id);

    persistSave(a.id, { ...loadSave(a.id)!, money: 1234 });
    persistSave(b.id, { ...loadSave(b.id)!, money: 5678 });

    expect(loadSave(a.id)!.money).toBe(1234);
    expect(loadSave(b.id)!.money).toBe(5678);
    // 名字进了各自的存档，档位清单里也能查到
    expect(loadSave(a.id)!.player_name).toBe('阿满');
    expect(listProfiles().map((p) => p.name).sort()).toEqual(['老陈', '阿满'].sort());
    // 新建时顺手切成当前档
    expect(activeProfileId()).toBe(b.id);
  });

  it('删一个档不动另一个', () => {
    const a = createProfile('阿满');
    const b = createProfile('老陈');
    deleteProfile(b.id);

    expect(listProfiles().map((p) => p.id)).toEqual([a.id]);
    expect(loadSave(b.id)).toBeNull();
    expect(loadSave(a.id)).not.toBeNull();
    // 删掉的正是当前档，当前档位要跟着清空，否则会读到空存档
    expect(activeProfileId()).toBe('');
  });

  it('名字留空时给个默认名，不产生无名档', () => {
    const p = createProfile('   ');
    expect(p.name).toBe('学徒');
    expect(loadSave(p.id)!.player_name).toBe('学徒');
  });

  it('localStorage 不可用时不抛异常，只是存不下', () => {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    expect(() => createProfile('无痕')).not.toThrow();
    expect(listProfiles()).toEqual([]);
    expect(loadSave('whatever')).toBeNull();
  });

  it('v1 时代的旧存档搬进档位，并把见底的现金补到开局值', () => {
    const map = stubStorage();
    const old = { ...createSave('老板'), money: 12, current_stage: 'stage-1-3' };
    map.set('yuwen-cafe-save-v1', JSON.stringify(old));

    const migrated = migrateLegacySave();
    expect(migrated).not.toBeNull();
    const save = loadSave(migrated!.id)!;
    expect(save.current_stage).toBe('stage-1-3'); // 进度保住
    expect(save.money).toBe(3000);                 // 旧算法攒的钱不作数，补到开局值
    expect(map.get('yuwen-cafe-save-v1')).toBeUndefined(); // 搬完就清掉，不会搬第二次
    expect(migrateLegacySave()).toBeNull();
  });
});
