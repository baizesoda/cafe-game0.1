/* M8 冲煮交互：参数派生 / 交互映射 / 评级（纯函数，见设计档 §1 M8 与 §6 案例表）。
 * 数据现有 3 种 method（浓缩 / 手冲 / 奶咖），滴滤为第 4 种预留映射。
 */
import { describe, expect, it } from 'vitest';
import type { CoffeeBean, Drink, DrinkMethod } from '../../contracts/types';
import {
  AUTO_VALUE,
  GRADE_SATISFACTION,
  deriveBrewParams,
  gradeOverall,
  gradeRound,
  interactionFor,
  staticQuiz,
  staticQuizChoices,
} from '../src/brew';
import { beans, drinks } from '../src/data/loader';

const byMethod = (method: DrinkMethod) => drinks.find((d) => d.method === method)!;
const byRoast = (roast: CoffeeBean['roast_level']) => beans.find((b) => b.roast_level === roast)!;

/** 设计档 §1 M8.1 的水温表（中深烘在现有数据里没有豆子，用合成豆核对） */
const TEMP_TABLE: Record<CoffeeBean['roast_level'], [number, number]> = {
  浅烘: [92, 94],
  中浅烘: [90, 93],
  中烘: [88, 91],
  中深烘: [86, 89],
  深烘: [85, 88],
};

/** 设计档 §1 M8.2 的交互表：形态 / 轮数 / 满量程 / 单轮超时 / 好评容差 */
const INTERACTION_TABLE: Record<DrinkMethod, [string, number, number, number, number]> = {
  浓缩: ['hold', 1, 3500, 4000, 0.12],
  奶咖: ['hold', 1, 4200, 4500, 0.14],
  手冲: ['taps', 3, 1600, 4000, 0.15],
  滴滤: ['hold', 1, 3000, 3500, 0.15],
};

describe('M8 参数派生', () => {
  it('水温按烘焙度取区间：五档全对，数据里的四档与表一致', () => {
    for (const [roast, temp] of Object.entries(TEMP_TABLE)) {
      const bean: CoffeeBean = { ...beans[0], roast_level: roast as CoffeeBean['roast_level'] };
      expect(deriveBrewParams(bean, drinks[0]).tempC, `${roast} 水温`).toEqual(temp);
    }
    for (const bean of beans) {
      expect(deriveBrewParams(bean, drinks[0]).tempC, `${bean.id} 水温`).toEqual(TEMP_TABLE[bean.roast_level]);
    }
  });

  it('研磨 / 粉量 / 水量 / 时长按 method 取：四款对齐设计表', () => {
    const spec: Record<DrinkMethod, [string, number, number, number]> = {
      浓缩: ['细', 18, 36, 27],
      奶咖: ['细', 18, 36, 25],
      手冲: ['中细', 15, 240, 150],
      滴滤: ['中', 22, 360, 210],
    };
    for (const [method, [grind, doseG, waterMl, timeS]] of Object.entries(spec)) {
      const drink: Drink = { ...drinks[0], method: method as DrinkMethod };
      const p = deriveBrewParams(beans[0], drink);
      expect([p.grind, p.doseG, p.waterMl, p.timeS], method).toEqual([grind, doseG, waterMl, timeS]);
    }
  });

  it('牛奶只在奶咖出现：奶咖 180ml，浓缩与手冲不带 milkMl', () => {
    expect(deriveBrewParams(beans[0], byMethod('奶咖')).milkMl).toBe(180);
    expect(deriveBrewParams(beans[0], byMethod('浓缩')).milkMl).toBeUndefined();
    expect(deriveBrewParams(beans[0], byMethod('手冲')).milkMl).toBeUndefined();
  });

  it('提示文案 2~3 条：说水温也说得出手法，非空', () => {
    for (const bean of beans) {
      for (const drink of drinks) {
        const notes = deriveBrewParams(bean, drink).notes;
        expect(notes.length, `${bean.id}/${drink.id}`).toBeGreaterThanOrEqual(2);
        expect(notes.length).toBeLessThanOrEqual(3);
        notes.forEach((n) => expect(n.trim().length).toBeGreaterThan(0));
      }
    }
  });

  it('override 按字段覆盖（配方预设），合法值原地生效', () => {
    const p = deriveBrewParams(byRoast('深烘'), byMethod('手冲'), {
      tempC: [90, 93],
      doseG: 20,
      waterMl: 300,
      timeS: 120,
      grind: '粗',
      notes: ['照配方来'],
    });
    expect(p).toEqual({
      tempC: [90, 93],
      grind: '粗',
      doseG: 20,
      waterMl: 300,
      timeS: 120,
      notes: ['照配方来'],
    });
  });

  it('override 非法值逐项回落到派生值，判定不被手改的码带偏', () => {
    const base = deriveBrewParams(byRoast('中烘'), byMethod('浓缩'));
    const p = deriveBrewParams(byRoast('中烘'), byMethod('浓缩'), {
      tempC: [95, 88], // 区间倒置
      grind: '   ',
      doseG: 0,
      waterMl: -10,
      timeS: Number.NaN,
      notes: ['', '有内容'],
    });
    expect(p).toEqual(base);
  });
});

describe('M8 交互映射', () => {
  it('四种 method 都有映射，形态 / 轮数 / 量程 / 超时 / 容差齐备', () => {
    for (const [method, [kind, rounds, valueMs, timeoutMs, band]] of Object.entries(INTERACTION_TABLE)) {
      const spec = interactionFor(method as DrinkMethod);
      expect(spec.method, method).toBe(method);
      expect(spec.kind, method).toBe(kind);
      expect(spec.rounds, method).toBe(rounds);
      expect(spec.valueMs, method).toBe(valueMs);
      expect(spec.timeoutMs, method).toBe(timeoutMs);
      expect(spec.band, method).toBe(band);
      expect(spec.title.trim().length, method).toBeGreaterThan(0);
      expect(spec.prompt.trim().length, method).toBeGreaterThan(0);
      expect(spec.unit, method).toBe('ms');
      expect(spec.timeoutMs, method).toBeGreaterThanOrEqual(spec.valueMs);
    }
  });

  it('最坏时长 ≤ 15s：轮数 × 单轮超时', () => {
    for (const method of ['浓缩', '奶咖', '手冲', '滴滤'] as DrinkMethod[]) {
      const spec = interactionFor(method);
      expect(spec.rounds * spec.timeoutMs, method).toBeLessThanOrEqual(15000);
    }
  });

  it('超时自动取值 0.72：四种容差下都落「一般」，即没动手也照样出杯', () => {
    expect(AUTO_VALUE).toBe(0.72);
    for (const method of ['浓缩', '奶咖', '手冲', '滴滤'] as DrinkMethod[]) {
      expect(gradeRound(AUTO_VALUE, interactionFor(method).band), method).toBe('一般');
    }
  });
});

describe('M8 评级', () => {
  it('单轮：离半量程越远越差，容差含端点', () => {
    expect(gradeRound(0.5, 0.12)).toBe('好');
    expect(gradeRound(0.5 + 0.12, 0.12)).toBe('好'); // 端点恰好 = band
    expect(gradeRound(0.5 - 0.12, 0.12)).toBe('好');
    expect(gradeRound(0.5 + 0.121, 0.12)).toBe('一般');
    expect(gradeRound(0.5 + 0.24, 0.12)).toBe('一般'); // 端点恰好 = 2 × band
    expect(gradeRound(0.5 + 0.241, 0.12)).toBe('失误');
    expect(gradeRound(0, 0.15)).toBe('失误');
    expect(gradeRound(1, 0.15)).toBe('失误');
  });

  it('多轮取均值：好 = 1 / 一般 = 0.5 / 失误 = 0，阈值 0.75 与 0.42', () => {
    expect(gradeOverall(['好', '好', '一般'])).toBe('好'); // 0.833
    expect(gradeOverall(['好', '失误'])).toBe('一般'); // 0.5
    expect(gradeOverall(['一般', '一般'])).toBe('一般'); // 0.5
    expect(gradeOverall(['好', '好', '失误'])).toBe('一般'); // 0.667
    expect(gradeOverall(['好', '失误', '失误'])).toBe('失误'); // 0.333
    expect(gradeOverall(['失误', '失误'])).toBe('失误');
    expect(gradeOverall([])).toBe('失误'); // 没记到轮次时保守按失误
  });

  it('评级 → 主线满意度：好 3 / 一般 1 / 失误 0', () => {
    expect(GRADE_SATISFACTION).toEqual({ 好: 3, 一般: 1, 失误: 0 });
  });

  it('静态降级三选一：正解是派生值本身，两个错项各差一档 / 两档', () => {
    const params = deriveBrewParams(byRoast('中烘'), byMethod('手冲'));
    const choices = staticQuizChoices(params);
    expect(choices.map((c) => c.label)).toEqual(['对', '差一档', '差两档']);
    expect(choices[0].tempC).toEqual(params.tempC);
    expect(choices[1].tempC).toEqual([params.tempC[0] - 1, params.tempC[1] - 1]);
    expect(choices[2].tempC).toEqual([params.tempC[0] - 2, params.tempC[1] - 2]);
    expect(choices.map((c) => c.pick)).toEqual([0, 1, 2]);
  });

  it('静态降级评级：选对「好」、差一档「一般」、差两档「失误」，与手势路径同一套阈值', () => {
    const params = deriveBrewParams(byRoast('浅烘'), byMethod('奶咖'));
    expect(staticQuiz(params, 0)).toBe('好');
    expect(staticQuiz(params, 1)).toBe('一般');
    expect(staticQuiz(params, 2)).toBe('失误');
  });

  it('配方预设进的是判定链：覆盖后的参数就是题面正解（同参数 ⇒ 同题面）', () => {
    const bean = byRoast('浅烘');
    const drink = byMethod('手冲');
    const derived = deriveBrewParams(bean, drink);
    const tuned = deriveBrewParams(bean, drink, { tempC: [80, 82] });
    // 正解跟着覆盖后的 params 走，不是跟派生值走
    expect(staticQuizChoices(tuned)[0].tempC).toEqual([80, 82]);
    expect(staticQuizChoices(derived)[0].tempC).not.toEqual([80, 82]);
    // 两个错项仍相对「覆盖后的正解」各差一档 / 两档，阈值不变
    expect(staticQuizChoices(tuned).map((c) => c.tempC)).toEqual([
      [80, 82],
      [79, 81],
      [78, 80],
    ]);
  });
});
