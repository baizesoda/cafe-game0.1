// 数据加载层：轨道 3 与轨道 1／2 的唯一接口。
// 轨道 1、2 只要往 content/ 与 story/ 里加符合契约的 JSON 文件，这里自动收录，界面代码不用改。
import type { Character, CoffeeBean, Drink, KnowledgeCard, Stage } from '../../../contracts/types';

function flatten<T>(modules: Record<string, unknown>): T[] {
  return Object.values(modules).flatMap((m) => {
    const data = (m as { default: unknown }).default;
    return Array.isArray(data) ? (data as T[]) : [];
  });
}

export const knowledgeCards = flatten<KnowledgeCard>(
  import.meta.glob('/content/knowledge/*.json', { eager: true }),
);

export const beans = flatten<CoffeeBean>(
  import.meta.glob('/content/beans/*.json', { eager: true }),
);

export const drinks = flatten<Drink>(
  import.meta.glob('/content/drinks/*.json', { eager: true }),
);

export const stages = flatten<Stage>(
  import.meta.glob('/story/chapters/*.json', { eager: true }),
);

export const characters = flatten<Character>(
  import.meta.glob('/story/characters.json', { eager: true }),
);

const stageById = new Map(stages.map((s) => [s.id, s]));
const cardById = new Map(knowledgeCards.map((c) => [c.id, c]));
const charById = new Map<string, Character>(characters.map((c) => [c.id, c]));
const drinkById = new Map<string, Drink>(drinks.map((d) => [d.id, d]));
const beanById = new Map<string, CoffeeBean>(beans.map((b) => [b.id, b]));

export const getStage = (id: string) => stageById.get(id);
export const getBean = (id: string) => beanById.get(id);

/** 同 getCard：饮品还没配好时给一杯占位饮品，营业流程不至于崩。 */
export function getDrink(id: string): Drink {
  return (
    drinkById.get(id) ?? {
      id,
      name: '内容制作中',
      method: '手冲',
      price: 1,
      bean_cost: 1,
      speed: '中',
      taste_tags: ['待补'],
      source_chapter: '示例内容，待替换',
      source_quote: '示例内容，待替换',
      source_book: '示例内容，待替换',
      confidence: 'placeholder',
    }
  );
}

/** 轨道 2 可以先引用尚未产出的知识卡，这里降级为占位卡而不是崩溃。 */
export function getCard(id: string): KnowledgeCard {
  return (
    cardById.get(id) ?? {
      id,
      title: '内容制作中',
      category: '冲煮',
      plain_explanation: `知识卡 ${id} 尚未由内容轨道产出。`,
      source_book: '示例内容，待替换',
      source_chapter: '示例内容，待替换',
      source_quote: '示例内容，待替换',
      confidence: 'placeholder',
      related_stages: [],
    }
  );
}

export const getCharacterName = (id: string) => charById.get(id)?.name ?? id;

/** 第一关：取章节序号与关卡序号都最小的那个。 */
export const firstStageId =
  [...stages]
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
    .at(0)?.id ?? '';
