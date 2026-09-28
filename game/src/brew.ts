/* 冲煮参数派生、手势映射与评级（M8）。全是纯函数，依赖全在参数里。
 * 判定只依赖方法与输入，不掺伪物理：同参数 ⇒ 同题面 ⇒ 同判定（配方预设因此天然可复现）。
 */
import type { CoffeeBean, Drink, DrinkMethod } from '../../contracts/types';

export interface BrewParams {
  tempC: [number, number];
  grind: string;
  doseG: number;
  waterMl: number;
  milkMl?: number;
  timeS: number;
  notes: string[];
}

export type BrewGrade = '好' | '一般' | '失误';

export interface BrewInteractionSpec {
  method: DrinkMethod;
  kind: 'hold' | 'taps';
  rounds: number;
  valueMs: number;
  timeoutMs: number;
  band: number;
  title: string;
  prompt: string;
  unit: string;
}

/** 评级 → 主线满意度（M8.5）。自由营业那边由 rateOrder 换成星级。 */
export const GRADE_SATISFACTION: Record<BrewGrade, number> = { 好: 3, 一般: 1, 失误: 0 };

/** 超时或未操作时自动取的值：对四种 band 都落在「一般」区间，即没动手也照样出杯。 */
export const AUTO_VALUE = 0.72;

/** 水温区间按烘焙度（M8.1）。烘焙越深，水温越低——苦味出得快。 */
const TEMP_BY_ROAST: Record<CoffeeBean['roast_level'], [number, number]> = {
  浅烘: [92, 94],
  中浅烘: [90, 93],
  中烘: [88, 91],
  中深烘: [86, 89],
  深烘: [85, 88],
};

const METHOD_SPEC: Record<DrinkMethod, { grind: string; doseG: number; waterMl: number; milkMl?: number; timeS: number }> = {
  浓缩: { grind: '细', doseG: 18, waterMl: 36, timeS: 27 },
  奶咖: { grind: '细', doseG: 18, waterMl: 36, milkMl: 180, timeS: 25 },
  手冲: { grind: '中细', doseG: 15, waterMl: 240, timeS: 150 },
  滴滤: { grind: '中', doseG: 22, waterMl: 360, timeS: 210 },
};

/** 烘焙度的提示：第一句说水温，第三句说这支豆子的脾气。 */
const ROAST_NOTES: Record<CoffeeBean['roast_level'], [string, string]> = {
  浅烘: ['浅烘豆吃水温，压着 92–94℃ 才带得出花香', '浅烘偏酸是它的本味，喝不惯就少萃一点'],
  中浅烘: ['中浅烘 90–93℃，酸甜最平衡', '甜感在中段出，别急着加大水流'],
  中烘: ['中烘 88–91℃，稳一点不容易出错', '中烘最百搭，先把基础手法练稳'],
  中深烘: ['中深烘水温别冲太高，苦味容易出来（86–89℃）', '它的甜在回口，等凉一点再喝'],
  深烘: ['深烘怕过萃，水温压到 85–88℃', '时间到了就停，多十秒就只剩焦苦'],
};

/** 方法的提示：说清这一款的粉水比与节奏。 */
const METHOD_NOTES: Record<DrinkMethod, string> = {
  浓缩: '粉量 18g，25 秒左右收 36ml，别挤过头',
  奶咖: '先出 36ml 浓缩，再打 180ml 牛奶，奶泡别打太粗',
  手冲: '闷蒸 30 秒再接注水，分三段绕圈',
  滴滤: '一次注满 360ml，让它自己滴完',
};

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const pickNum = (v: unknown, fallback: number | undefined): number | undefined =>
  isNum(v) && v > 0 ? v : fallback;

const pickTemp = (v: unknown, fallback: [number, number]): [number, number] =>
  Array.isArray(v) && isNum(v[0]) && isNum(v[1]) && v[0] <= v[1] ? [v[0], v[1]] : fallback;

/**
 * 派生一份冲煮参数。`override`（配方预设）按字段覆盖；
 * 任何一项非法（水温区间倒置、粉量 0、缺失…）都忽略该字段、回落派生值，
 * 所以配方码再怎么手改，吧台显示与判定都还是可复现的。
 */
export function deriveBrewParams(bean: CoffeeBean, drink: Drink, override?: Partial<BrewParams>): BrewParams {
  const spec = METHOD_SPEC[drink.method];
  const [roastTemp, roastRough] = ROAST_NOTES[bean.roast_level];
  const derived: BrewParams = {
    tempC: TEMP_BY_ROAST[bean.roast_level],
    grind: spec.grind,
    doseG: spec.doseG,
    waterMl: spec.waterMl,
    timeS: spec.timeS,
    notes: [roastTemp, METHOD_NOTES[drink.method], roastRough],
  };
  if (spec.milkMl !== undefined) derived.milkMl = spec.milkMl;

  const params: BrewParams = {
    tempC: pickTemp(override?.tempC, derived.tempC),
    grind: typeof override?.grind === 'string' && override.grind.trim() ? override.grind : derived.grind,
    doseG: pickNum(override?.doseG, derived.doseG) as number,
    waterMl: pickNum(override?.waterMl, derived.waterMl) as number,
    timeS: pickNum(override?.timeS, derived.timeS) as number,
    notes:
      Array.isArray(override?.notes) && override.notes.every((n) => typeof n === 'string' && n.trim())
        ? override.notes
        : derived.notes,
  };
  const milk = pickNum(override?.milkMl, derived.milkMl);
  if (milk !== undefined) params.milkMl = milk;
  return params;
}

/** 手势形态（M8.2）。契约里四种 method 都要有映射，滴滤眼下没有饮品用它，先备着。 */
const INTERACTIONS: Record<DrinkMethod, BrewInteractionSpec> = {
  浓缩: {
    method: '浓缩',
    kind: 'hold',
    rounds: 1,
    valueMs: 3500,
    timeoutMs: 4000,
    band: 0.12,
    title: '压粉',
    prompt: '按住，压到刻度一半就松手',
    unit: 'ms',
  },
  奶咖: {
    method: '奶咖',
    kind: 'hold',
    rounds: 1,
    valueMs: 4200,
    timeoutMs: 4500,
    band: 0.14,
    title: '打发',
    prompt: '按住，打出细一点的奶泡',
    unit: 'ms',
  },
  手冲: {
    method: '手冲',
    kind: 'taps',
    rounds: 3,
    valueMs: 1600,
    timeoutMs: 4000,
    band: 0.15,
    title: '分段注水',
    prompt: '三拍，每拍按到刻度一半',
    unit: 'ms',
  },
  滴滤: {
    method: '滴滤',
    kind: 'hold',
    rounds: 1,
    valueMs: 3000,
    timeoutMs: 3500,
    band: 0.15,
    title: '注水',
    prompt: '按住，一次注满',
    unit: 'ms',
  },
};

export function interactionFor(method: DrinkMethod): BrewInteractionSpec {
  return INTERACTIONS[method];
}

/** 单轮评级：离半量程越远越差，容差含端点（d 恰为 band ⇒ 好）。 */
export function gradeRound(value: number, band: number): BrewGrade {
  const d = Math.abs(value - 0.5);
  if (d <= band) return '好';
  if (d <= band * 2) return '一般';
  return '失误';
}

const GRADE_VALUE: Record<BrewGrade, number> = { 好: 1, 一般: 0.5, 失误: 0 };

/** 多轮取均值：≥0.75 好、≥0.42 一般、否则失误。没记到轮次时保守按失误。 */
export function gradeOverall(rounds: BrewGrade[]): BrewGrade {
  const mean = rounds.reduce((sum, g) => sum + GRADE_VALUE[g], 0) / rounds.length;
  if (mean >= 0.75) return '好';
  if (mean >= 0.42) return '一般';
  return '失误';
}

/** 静态题三档之间的水温差：题面上认得出是「差了一档」，判定上只记差了几档。 */
const QUIZ_STEP_C = 1;
/** 档距与容差都换算到 gradeRound 的 [0,1] 标度：1 档落「一般」、2 档落「失误」。 */
const QUIZ_NOTCH = 0.2;
const QUIZ_BAND = 0.15;

export interface QuizChoice {
  pick: 0 | 1 | 2;
  tempC: [number, number];
  label: string;
}

/** 静态降级题的三份题面（M8.4）：正解是派生值本身，两个错项各把水温往下挪一档 / 两档。 */
export function staticQuizChoices(params: BrewParams): QuizChoice[] {
  const [lo, hi] = params.tempC;
  return ([0, 1, 2] as const).map((pick) => ({
    pick,
    tempC: [lo - pick * QUIZ_STEP_C, hi - pick * QUIZ_STEP_C] as [number, number],
    label: pick === 0 ? '对' : pick === 1 ? '差一档' : '差两档',
  }));
}

/**
 * 静态三选一的评级：题面与判定同一份 `params`，判定只看错了几档、不看绝对温度，
 * 但走的是 `gradeRound` 同一套阈值——两条路径的「好 / 一般 / 失误」口径因此必然一致。
 */
export function staticQuiz(params: BrewParams, pick: 0 | 1 | 2): BrewGrade {
  const choices = staticQuizChoices(params);
  const notches = Math.abs(choices[0].tempC[0] - choices[pick].tempC[0]) / QUIZ_STEP_C;
  return gradeRound(0.5 + notches * QUIZ_NOTCH, QUIZ_BAND);
}
