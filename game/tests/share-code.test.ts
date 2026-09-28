/* M5 存档码 / M7 配方码（设计档 §1 M5 · M7，案例表 §6）。
 * 编解码、校验分类、导入不覆盖、进度文案都落在纯函数上，不需要 DOM。
 */
import { describe, expect, it } from 'vitest';
import type { PlayerSave } from '../../contracts/types';
import { freshRecord, planDay } from '../src/business';
import type { BusinessRecord } from '../src/business';
import { beans, drinks, stages } from '../src/data/loader';
import {
  addRecipe,
  decodeRecipe,
  encodeRecipe,
  recipeIdOf,
  removeRecipe,
  validateRecipe,
} from '../src/recipes';
import type { Recipe, RecipeDraft } from '../src/recipes';
import { APP_VERSION } from '../src/settings';
import {
  RECIPE_PREFIX,
  SAVE_PREFIX,
  buildSaveCode,
  checksum,
  decodeCode,
  encodeCode,
  planImport,
  profileProgressLabel,
} from '../src/share';
import { createSave } from '../src/state';

/** 中文档位名 + 中文内容的一档，拿来当「真实那一份」 */
const chineseSave = (): PlayerSave => ({
  ...createSave('林小满'),
  player_name: '林小满',
  money: 321,
  unlocked_knowledge: ['know-001'],
  flags: { 备注: '爱喝浅烘' },
});

const completedSave = (): PlayerSave => ({
  ...chineseSave(),
  current_stage: '',
  completed_stages: stages.map((s) => s.id),
});

const businessOf = (save: PlayerSave): BusinessRecord => planDay(freshRecord(), save);

const draft = (patch: Partial<RecipeDraft> = {}): RecipeDraft => ({
  name: '晨曦手冲',
  author: '小满',
  beanId: beans[1].id,
  drinkId: drinks.find((d) => d.method === '手冲')!.id,
  params: { tempC: [90, 93], doseG: 15, waterMl: 240, timeS: 150, grind: '中细', notes: ['稳一点'] },
  note: '凉了更甜',
  ...patch,
});

describe('M5 存档码', () => {
  it('中文档位名 + 中文内容：编码 → 解码深等，码形合法', () => {
    const save = chineseSave();
    const code = buildSaveCode(save, '小满的档', null);
    expect(code.startsWith(SAVE_PREFIX)).toBe(true);
    expect(code.slice(SAVE_PREFIX.length)).toMatch(/^[0-9a-f]{8}\.[A-Za-z0-9_-]+$/); // 校验段 + 分隔 + 载荷

    const decoded = decodeCode(SAVE_PREFIX, code);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const payload = decoded.payload as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['app', 'exportedAt', 'profileName', 'save', 'v'].sort());
    expect(payload.v).toBe(1);
    expect(payload.app).toBe(APP_VERSION);
    expect(payload.profileName).toBe('小满的档');
    expect(Number.isNaN(Date.parse(String(payload.exportedAt)))).toBe(false);
    expect(payload.save).toEqual(save);
    expect('business' in payload).toBe(false); // 没开过业 ⇒ 整键省略
  });

  it('校验段随载荷变：同一份存档换个档位名，校验段就不同', () => {
    const save = chineseSave();
    const a = buildSaveCode(save, '甲', null).slice(SAVE_PREFIX.length, SAVE_PREFIX.length + 8);
    const b = buildSaveCode(save, '乙', null).slice(SAVE_PREFIX.length, SAVE_PREFIX.length + 8);
    expect(a).not.toBe(b);
    expect(checksum(JSON.stringify({ x: 1 }))).toMatch(/^[0-9a-f]{8}$/);
  });

  it('载荷带营业档案：解码后 business 深等；显式 null 则不含该键', () => {
    const save = chineseSave();
    const rec = businessOf(save);

    const withBiz = decodeCode(SAVE_PREFIX, buildSaveCode(save, '带营业', rec));
    expect(withBiz.ok).toBe(true);
    if (!withBiz.ok) return;
    const payload = withBiz.payload as { business?: BusinessRecord };
    expect(payload.business).toEqual(rec);

    const withoutBiz = decodeCode(SAVE_PREFIX, buildSaveCode(save, '不带营业', null));
    expect(withoutBiz.ok).toBe(true);
    if (!withoutBiz.ok) return;
    expect('business' in (withoutBiz.payload as object)).toBe(false);
  });

  it('非法码逐类给说法：前缀 / 分隔 / 校验 / JSON / 结构各一种', () => {
    const save = chineseSave();
    const first = buildSaveCode(save, '小满的档', null);
    const prefixLen = SAVE_PREFIX.length;
    const sum = first.slice(prefixLen, prefixLen + 8);
    const body = first.slice(prefixLen + 9);

    // ① 前缀不符（含空串、别的码）
    expect(planImport('', [])).toEqual({ ok: false, reason: '这不是存档码' });
    expect(planImport(`${RECIPE_PREFIX}${sum}.${body}`, [])).toEqual({ ok: false, reason: '这不是存档码' });
    expect(planImport('随便一段话', [])).toEqual({ ok: false, reason: '这不是存档码' });

    // ② 有前缀但读不出分段
    expect(planImport(SAVE_PREFIX, [])).toEqual({ ok: false, reason: '这段码读不出来' });
    expect(planImport(`${SAVE_PREFIX}${sum}`, [])).toEqual({ ok: false, reason: '这段码读不出来' });
    expect(planImport(`${SAVE_PREFIX}${sum}.`, [])).toEqual({ ok: false, reason: '这段码读不出来' });

    // ③ 校验不过：改动过的码与截断的码都落这条
    const tampered = `${SAVE_PREFIX}${sum}.${body.slice(0, -1)}${body.endsWith('A') ? 'B' : 'A'}`;
    expect(planImport(tampered, [])).toEqual({ ok: false, reason: '校验不通过，可能被改动或复制缺了一段' });
    expect(planImport(first.slice(0, first.length - 4), [])).toEqual({
      ok: false,
      reason: '校验不通过，可能被改动或复制缺了一段',
    });
    expect(planImport(`${SAVE_PREFIX}${'0'.repeat(8)}.${body}`, [])).toEqual({
      ok: false,
      reason: '校验不通过，可能被改动或复制缺了一段',
    });

    // ④ 校验过、解码失败（载荷不是 JSON）
    const notJson = btoa('not-json');
    expect(planImport(`${SAVE_PREFIX}${checksum(notJson)}.${notJson}`, [])).toEqual({
      ok: false,
      reason: '这段码读不出来',
    });

    // ⑤ 校验过、JSON 合法但不是存档
    const wrongShape = encodeCode(SAVE_PREFIX, { v: 1, save: { money: 'x' } });
    expect(planImport(wrongShape, [])).toEqual({ ok: false, reason: '码里的存档结构不认识' });
  });

  it('旧码（business 键缺失）与显式 null 码：同一条降级路径，都从「营业第 1 天」起算', () => {
    const save = completedSave(); // 开过业的才可能带 business，所以用通关档演这两个码
    const exportedAt = new Date().toISOString();
    const legacy = encodeCode(SAVE_PREFIX, { v: 1, app: APP_VERSION, profileName: '旧版档', exportedAt, save });
    const explicit = encodeCode(SAVE_PREFIX, {
      v: 1,
      app: APP_VERSION,
      profileName: '旧版档',
      exportedAt,
      save,
      business: null,
    });

    for (const code of [legacy, explicit]) {
      const plan = planImport(code, []);
      expect(plan.ok).toBe(true);
      if (!plan.ok) continue;
      expect(plan.business).toBeNull();
      expect(plan.save).toEqual(save);
      expect(profileProgressLabel(plan.save, 1)).toContain('自由营业[第 1 天]');
    }
  });

  it('导入永远新建档位：重名加序号，现有档位列表原样不动', () => {
    const code = buildSaveCode(chineseSave(), '小满的档', null);
    const existing = ['小满的档', '小满的档（2）'];
    const snapshot = [...existing];

    const plan = planImport(code, existing);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.name).toBe('小满的档（3）');
    expect(existing).toEqual(snapshot); // 纯函数，不改入参

    const fresh = planImport(code, []);
    expect(fresh.ok && fresh.name).toBe('小满的档');

    // 档位名为空白的码回落成「学徒」
    const blank = planImport(buildSaveCode(chineseSave(), '   ', null), []);
    expect(blank.ok && blank.name).toBe('学徒');
  });

  it('换行与空格容错：聊天工具折行过的码照样能导入', () => {
    const save = chineseSave();
    const code = buildSaveCode(save, '折行的档', null);
    const wrapped = `${code.slice(0, 30)}\n  ${code.slice(30, 60)}\r\n${code.slice(60)}`;
    const plan = planImport(wrapped, []);
    expect(plan.ok).toBe(true);
    expect(plan.ok && plan.save).toEqual(save);
  });

  it('进度文案：未通关报章节与关卡数，通关改报自由营业天数', () => {
    const fresh = chineseSave();
    expect(profileProgressLabel(fresh)).toBe(
      `第 1 章 · 进度 ${fresh.completed_stages.length}/${stages.length} · 现金 321 · 知识卡 1 张`,
    );

    const done = completedSave();
    expect(profileProgressLabel(done)).toBe(
      `已通关 · 自由营业[第 1 天] · 现金 321 · 知识卡 1 张`,
    );
    expect(profileProgressLabel(done, 5)).toContain('自由营业[第 5 天]');
  });
});

describe('M7 配方码', () => {
  it('配方码 round-trip：内容深等，编号稳定（同内容同 id）', () => {
    const first = validateRecipe(draft());
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const decoded = decodeRecipe(encodeRecipe(first.recipe));
    expect(decoded.ok).toBe(true);
    expect(decoded.ok && decoded.recipe).toEqual(first.recipe);

    const again = validateRecipe(draft());
    expect(again.ok && again.recipe.id).toBe(first.recipe.id);
    expect(recipeIdOf({ ...first.recipe, name: '换名字' })).not.toBe(first.recipe.id);
    expect(recipeIdOf({ ...first.recipe, createdAt: '2030-01-01T00:00:00.000Z' })).toBe(first.recipe.id);
  });

  it('任意豆边界：beanId 留空照样收录，参数只留认识的字段', () => {
    const r = validateRecipe(draft({ beanId: '', params: { tempC: [88, 91], grind: ' 细 ', doseG: 18 } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.recipe.beanId).toBe('');
    expect(r.recipe.params).toEqual({ tempC: [88, 91], grind: '细', doseG: 18 });
  });

  it('越界与缺项逐类被拒，各有明确 reason', () => {
    const bad: [Partial<RecipeDraft>, string][] = [
      [{ name: '   ' }, '给这份配方起个名字吧'],
      [{ name: '名'.repeat(25) }, '配方名最多 24 字'],
      [{ author: '署'.repeat(13) }, '署名最多 12 字'],
      [{ note: '笔'.repeat(121) }, '风味笔记最多 120 字'],
      [{ drinkId: 'drink-none' }, '没有这款饮品'],
      [{ beanId: 'bean-none' }, '没有这支豆子'],
      [{ params: { tempC: [95, 88] } }, '水温区间要低值在前，比如 [90, 93]'],
      [{ params: { tempC: [40, 50] } }, '水温要落在 60~100 之间'],
      [{ params: { tempC: [98, 103] } }, '水温要落在 60~100 之间'],
      [{ params: { doseG: 0 } }, '粉量要落在 5~60 之间'],
      [{ params: { waterMl: 5000 } }, '水量要落在 10~2000 之间'],
      [{ params: { milkMl: 0 } }, '牛奶要落在 1~1000 之间'],
      [{ params: { timeS: 4000 } }, '时长要落在 5~3600 之间'],
      [{ params: { grind: '  ' } }, '研磨度总得写点什么'],
      [{ params: { notes: ['有', ''] } }, '参数提示行不能是空的'],
    ];
    for (const [patch, reason] of bad) {
      const r = validateRecipe(draft(patch));
      expect(r.ok, `${JSON.stringify(patch)} 应被拒`).toBe(false);
      expect(r.ok ? '' : r.reason, JSON.stringify(patch)).toBe(reason);
    }
  });

  it('收录台去重：同一条配方第二次进库被拦，库里顺序新在前、可删', () => {
    const a = validateRecipe(draft());
    const b = validateRecipe(draft({ name: '夜航奶咖', params: { doseG: 18, milkMl: 180 } }));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    const first = addRecipe([], a.recipe);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = addRecipe(first.list, b.recipe);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.list.map((r) => r.name)).toEqual(['夜航奶咖', '晨曦手冲']); // 倒序：时间新在前

    const dup = addRecipe(second.list, a.recipe);
    expect(dup).toEqual({ ok: false, reason: '这条配方已经在库里了' });

    const left = removeRecipe(second.list, a.recipe.id);
    expect(left.map((r: Recipe) => r.id)).toEqual([b.recipe.id]);
  });

  it('坏配方码：前缀不对 / 内容与编号对不上，都进不来', () => {
    const r = validateRecipe(draft());
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // 存档码当配方码用
    expect(decodeRecipe(buildSaveCode(chineseSave(), '小满的档', null))).toEqual({
      ok: false,
      reason: '这不是配方码',
    });
    expect(decodeRecipe('')).toEqual({ ok: false, reason: '这不是配方码' });

    // 手改内容但编号没跟着变 ⇒ 拒
    const tampered: Recipe = { ...r.recipe, name: '被改过的名字' };
    expect(decodeRecipe(encodeRecipe(tampered))).toEqual({
      ok: false,
      reason: '这份配方的内容和编号对不上',
    });
  });
});
