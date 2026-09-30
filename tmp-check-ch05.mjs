import { readFileSync } from 'node:fs';
const FILE = new URL('./story/chapters/chapter-05.json', import.meta.url);
const errs = [];
let data;
try { data = JSON.parse(readFileSync(FILE, 'utf8')); } catch (e) { console.error('JSON 解析失败: ' + e.message); process.exit(1); }
if (!Array.isArray(data)) { console.error('顶层不是数组'); process.exit(1); }
if (data.length !== 8) errs.push('关卡数 ' + data.length + ' != 8');
const STAGE_KEYS = new Set(['id','chapter','title','type','goal','scene','characters','dialogue','knowledge_brief','choices','reward','next_stage','requires','recovery']);
const REQ = ['id','chapter','title','type','goal','scene','characters','dialogue','choices','reward'];
const CHOICE_KEYS = new Set(['id','text','result','effects','explanation','knowledge_id','set_flags','next_stage']);
const CHOICE_REQ = ['id','text','result','effects','explanation'];
const EFFECT_KEYS = new Set(['money','reputation','satisfaction_today','energy','trust','inventory']);
const REWARD_KEYS = new Set(['money','reputation','unlock_knowledge','unlock_upgrade']);
const TYPES = new Set(['tutorial','knowledge_decision','business_decision','story_branch','crisis']);
const SCENES = new Set(['bar','door','blackboard','storage','table','backdoor','street']);
const RESULTS = new Set(['correct','acceptable','wrong']);
const FLAGS = new Set(['fake_bluemountain_exposed','linshu_returned','chapter_05_cleared']);
const TRUST = new Set(['linshu','xiaoman','chenshu','suhe','guyan']);
const CHARS = new Set(['player','linshu','xiaoman','chenshu','suhe','guyan','customer']);
const KID = /^knowledge-[0-9]{3,}$/;
const EXPECT = [240,241,242,243,248,250,251,252,256,257,258,259,301,336,337,338,436,437,438,439,440,441,442,443,444,445,446,447].map((n)=>'knowledge-'+n);
const ids = new Set();
const unlockCount = new Map();
for (const s of data) {
  const w = '[' + (s.id ?? '无id') + ']';
  for (const k of REQ) if (!(k in s)) errs.push(w + ' 缺必填字段 ' + k);
  for (const k of Object.keys(s)) if (!STAGE_KEYS.has(k)) errs.push(w + ' 多余字段 ' + k);
  if (!/^stage-[0-9]+-[0-9]+$/.test(s.id ?? '')) errs.push(w + ' id 格式不合');
  if (ids.has(s.id)) errs.push(w + ' id 重复');
  ids.add(s.id);
  if (s.chapter !== 'chapter-05') errs.push(w + ' chapter 实为 ' + s.chapter);
  if (!TYPES.has(s.type)) errs.push(w + ' type 非法 ' + s.type);
  if (!SCENES.has(s.scene)) errs.push(w + ' scene 非法 ' + s.scene);
  if (typeof s.title !== 'string' || s.title.length < 2 || s.title.length > 20) errs.push(w + ' title 长度 ' + s.title?.length);
  if (typeof s.goal !== 'string' || s.goal.length < 4 || s.goal.length > 40) errs.push(w + ' goal 长度 ' + s.goal?.length);
  if (!Array.isArray(s.characters) || s.characters.length < 1) errs.push(w + ' characters 为空');
  for (const c of s.characters ?? []) if (!CHARS.has(c)) errs.push(w + ' 未定义角色 ' + c);
  if (!Array.isArray(s.dialogue) || s.dialogue.length < 1 || s.dialogue.length > 8) errs.push(w + ' dialogue 条数 ' + s.dialogue?.length);
  for (const [i, d] of (s.dialogue ?? []).entries()) {
    for (const k of Object.keys(d)) if (k !== 'speaker' && k !== 'text') errs.push(w + ' dialogue[' + i + '] 多余字段 ' + k);
    if (!d.speaker || !CHARS.has(d.speaker)) errs.push(w + ' dialogue[' + i + '] speaker 非法 ' + d.speaker);
    if (!d.text || d.text.length < 1 || d.text.length > 120) errs.push(w + ' dialogue[' + i + '] text 长度 ' + d.text?.length);
    if (d.speaker && !(s.characters ?? []).includes(d.speaker)) errs.push(w + ' dialogue[' + i + '] speaker ' + d.speaker + ' 不在 characters 里');
  }
  if (s.type === 'knowledge_decision' && !(s.knowledge_brief ?? []).length) errs.push(w + ' knowledge_decision 缺 knowledge_brief');
  for (const k of s.knowledge_brief ?? []) if (!KID.test(k)) errs.push(w + ' knowledge_brief 格式 ' + k);
  if (s.knowledge_brief && new Set(s.knowledge_brief).size !== s.knowledge_brief.length) errs.push(w + ' knowledge_brief 有重复');
  if (!Array.isArray(s.choices) || s.choices.length < 2 || s.choices.length > 4) errs.push(w + ' choices 数量 ' + s.choices?.length);
  const expectIds = ['choice-a','choice-b','choice-c','choice-d'];
  (s.choices ?? []).forEach((c, i) => {
    const cw = w + '.' + (c.id ?? i);
    for (const k of CHOICE_REQ) if (!(k in c)) errs.push(cw + ' 缺必填 ' + k);
    for (const k of Object.keys(c)) if (!CHOICE_KEYS.has(k)) errs.push(cw + ' 多余字段 ' + k);
    if (c.id !== expectIds[i]) errs.push(cw + ' id 应为 ' + expectIds[i]);
    if (!RESULTS.has(c.result)) errs.push(cw + ' result 非法 ' + c.result);
    if (typeof c.text !== 'string' || c.text.length < 1 || c.text.length > 30) errs.push(cw + ' text 长度 ' + c.text?.length);
    if (typeof c.explanation !== 'string' || c.explanation.length < 4 || c.explanation.length > 150) errs.push(cw + ' explanation 长度 ' + c.explanation?.length);
    const e = c.effects;
    if (typeof e !== 'object' || e === null || Array.isArray(e)) errs.push(cw + ' effects 不是对象');
    else {
      for (const k of Object.keys(e)) if (!EFFECT_KEYS.has(k)) errs.push(cw + ' effects 多余字段 ' + k);
      if ('inventory' in e) errs.push(cw + ' 出现了 effects.inventory（本章禁止）');
      for (const [k, v] of Object.entries(e.trust ?? {})) {
        if (!TRUST.has(k)) errs.push(cw + ' effects.trust 键非法 ' + k);
        if (!Number.isInteger(v)) errs.push(cw + ' effects.trust.' + k + ' 非整数');
      }
      for (const k of ['money','reputation','satisfaction_today','energy']) if (k in e && !Number.isInteger(e[k])) errs.push(cw + ' effects.' + k + ' 非整数');
    }
    if (c.knowledge_id && !KID.test(c.knowledge_id)) errs.push(cw + ' knowledge_id 格式 ' + c.knowledge_id);
    for (const f of c.set_flags ?? []) if (!FLAGS.has(f)) errs.push(cw + ' set_flags 非法 ' + f);
    if (c.next_stage !== undefined && !/^stage-[0-9]+-[0-9]+$/.test(c.next_stage)) errs.push(cw + ' next_stage 格式 ' + c.next_stage);
  });
  if (!(s.choices ?? []).some((c) => c.result !== 'wrong')) errs.push(w + ' 无非 wrong 选项');
  if ((s.choices ?? []).some((c) => c.result === 'wrong') && !s.recovery) errs.push(w + ' 有 wrong 但缺 recovery');
  if (s.recovery !== undefined && (typeof s.recovery !== 'string' || s.recovery.length > 150)) errs.push(w + ' recovery 长度 ' + s.recovery?.length);
  const r = s.reward;
  if (typeof r !== 'object' || r === null || Array.isArray(r)) errs.push(w + ' reward 不是对象');
  else {
    for (const k of Object.keys(r)) if (!REWARD_KEYS.has(k)) errs.push(w + ' reward 多余字段 ' + k);
    for (const k of ['money','reputation']) if (k in r && !Number.isInteger(r[k])) errs.push(w + ' reward.' + k + ' 非整数');
    const seen = new Set();
    for (const k of r.unlock_knowledge ?? []) {
      if (!KID.test(k)) errs.push(w + ' unlock_knowledge 格式 ' + k);
      if (seen.has(k)) errs.push(w + ' unlock_knowledge 内部重复 ' + k);
      seen.add(k);
      unlockCount.set(k, (unlockCount.get(k) ?? 0) + 1);
    }
  }
  if (!('next_stage' in s)) errs.push(w + ' 缺 next_stage');
}
const order = data.map((s) => s.id);
data.forEach((s, i) => {
  const expect = i === data.length - 1 ? null : order[i + 1];
  if (s.next_stage !== expect) errs.push('[' + s.id + '] next_stage 应为 ' + expect + '，实为 ' + s.next_stage);
  for (const c of s.choices ?? []) if (c.next_stage !== undefined && !ids.has(c.next_stage)) errs.push('[' + s.id + '].' + c.id + ' next_stage 指向不存在关卡 ' + c.next_stage);
});
const byId = new Map(data.map((s) => [s.id, s]));
const reach = new Set(['stage-5-1']);
let cur = 'stage-5-1';
while (cur) { const s = byId.get(cur); if (!s) break; const n = s.next_stage; if (n) { if (reach.has(n)) { errs.push('next_stage 成环'); break; } reach.add(n); } cur = n; }
for (const id of ids) if (!reach.has(id)) errs.push('关卡 ' + id + ' 从 stage-5-1 不可达');
for (const k of EXPECT) if (!unlockCount.has(k)) errs.push('unlock_knowledge 缺 ' + k);
for (const k of unlockCount.keys()) if (!EXPECT.includes(k)) errs.push('unlock_knowledge 多出 ' + k);
for (const [k, n] of unlockCount) if (n > 1) errs.push('unlock_knowledge 跨关卡重复 ' + k + '（' + n + ' 次）');
console.log('关卡 ' + data.length + ' 个 | unlock_knowledge 覆盖 ' + unlockCount.size + ' 张（目标 ' + EXPECT.length + '）');
if (errs.length) { console.error('\n不合格（' + errs.length + '）:'); for (const e of errs) console.error('  x ' + e); process.exit(1); }
console.log('全绿');
