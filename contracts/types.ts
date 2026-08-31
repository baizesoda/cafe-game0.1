// 数据契约的 TypeScript 类型。轨道 3 直接 import，禁止在 game/ 内重新定义这些结构。
// 字段与 contracts/*.schema.json 一一对应，改动需同步 schema。

export type Confidence = 'high' | 'medium' | 'placeholder';

export type KnowledgeCategory = '冲煮' | '咖啡豆' | '器具' | '产地' | '人物' | '故事线索';

export interface KnowledgeCard {
  id: string;
  title: string;
  category: KnowledgeCategory;
  plain_explanation: string;
  source_book: string;
  source_chapter: string;
  source_quote: string;
  confidence: Confidence;
  related_stages: string[];
  inference_note?: string;
  source_locator?: string;
}

export interface CoffeeBean {
  id: string;
  name: string;
  origin: string;
  variety: string;
  process: '水洗' | '日晒' | '蜜处理' | '厌氧发酵' | '湿刨' | '未标注';
  roast_level: '浅烘' | '中浅烘' | '中烘' | '中深烘' | '深烘';
  flavor_tags: string[];
  purchase_price: number;
  usable_drinks: string[];
  source_chapter: string;
  source_quote: string;
  source_book?: string;
  confidence?: Confidence;
}

export type DrinkMethod = '浓缩' | '手冲' | '滴滤' | '奶咖';

/** 菜单上的一款饮品。id 必须与咖啡豆 usable_drinks 里的引用一致。 */
export interface Drink {
  id: string;
  name: string;
  method: DrinkMethod;
  price: number;
  bean_cost: number;
  speed: '快' | '中' | '慢';
  taste_tags: string[];
  requires_upgrade?: UpgradeId;
  source_chapter: string;
  source_quote: string;
  source_book?: string;
  confidence?: Confidence;
}

export type CharacterId = 'player' | 'linshu' | 'xiaoman' | 'chenshu' | 'suhe' | 'guyan' | 'customer';

export interface Character {
  id: CharacterId;
  name: string;
  role: 'player' | 'mentor' | 'staff' | 'regular' | 'supplier' | 'rival' | 'customer';
  personality: string[];
  trust_level: number;
  unlockable_stories?: string[];
  avatar?: string | null;
  one_line?: string;
}

/** 经营数值变化。键必须在 contracts/state-keys.json 白名单内。 */
export interface Effects {
  money?: number;
  reputation?: number;
  satisfaction_today?: number;
  energy?: number;
  trust?: Record<string, number>;
  inventory?: Record<string, number>;
}

export type StageType = 'tutorial' | 'knowledge_decision' | 'business_decision' | 'story_branch' | 'crisis';

export type UpgradeId = 'grinder' | 'brewer' | 'seats' | 'blackboard';

export interface Choice {
  id: string;
  text: string;
  result: 'correct' | 'acceptable' | 'wrong';
  effects: Effects;
  explanation: string;
  knowledge_id?: string;
  set_flags?: string[];
  next_stage?: string;
  /** 这个选项对应端出哪款饮品。可选，不填的关卡不进入出杯流程。 */
  drink_id?: string;
}

export interface Stage {
  id: string;
  chapter: string;
  title: string;
  type: StageType;
  goal: string;
  scene: 'bar' | 'door' | 'blackboard' | 'storage' | 'table' | 'backdoor' | 'street';
  characters: string[];
  dialogue: { speaker: string; text: string }[];
  knowledge_brief?: string[];
  choices: Choice[];
  reward: {
    money?: number;
    reputation?: number;
    unlock_knowledge?: string[];
    unlock_upgrade?: UpgradeId[];
  };
  next_stage?: string | null;
  requires?: { flags?: string[]; completed_stages?: string[] };
  recovery?: string;
}

/** 当日流水，用于每日营业结算页（方案 §6.4）。逐日重置。 */
export interface DailyLedger {
  revenue: number;
  cost: number;
  customers: number;
  satisfied: number;
  wasted: number;
  knowledge_gained: string[];
  /** 今天每款饮品各出了几杯，结算页按饮品分列 */
  drinks_served: Record<string, number>;
}

export interface PlayerSave {
  player_name: string;
  current_chapter: string;
  current_stage: string;
  money: number;
  reputation: number;
  satisfaction_today: number;
  energy: number;
  trust: Record<string, number>;
  inventory: Record<string, number>;
  unlocked_knowledge: string[];
  completed_stages: string[];
  flags: Record<string, boolean>;
  upgrades: UpgradeId[];
  /** 菜单黑板上架的饮品 ID。空数组表示按默认菜单（全部无需升级的饮品）。 */
  menu: string[];
  today: DailyLedger;
}
