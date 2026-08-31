// 三轨共用的契约校验器。任一轨道提交前跑 `npm run validate`。
// error = 必须修；warning = 跨轨引用还没补齐，允许暂时存在。
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ajv = new Ajv({ allErrors: true, strict: false });

const errors = [];
const warnings = [];

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const schema = (name) => readJson(join(ROOT, 'contracts', `${name}.schema.json`));

/** 收集某目录下所有 json 数组文件，展平为 {item, file} */
function collect(dir) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      const data = readJson(join(abs, f));
      if (!Array.isArray(data)) {
        errors.push(`${dir}/${f}: 顶层必须是数组`);
        return [];
      }
      return data.map((item) => ({ item, file: `${dir}/${f}` }));
    });
}

function validateAll(entries, schemaName, label) {
  const check = ajv.compile(schema(schemaName));
  for (const { item, file } of entries) {
    if (!check(item)) {
      for (const e of check.errors) {
        errors.push(`${file} [${item.id ?? '无 id'}] ${label}${e.instancePath || ''} ${e.message}`);
      }
    }
  }
}

function assertUniqueIds(entries, label) {
  const seen = new Map();
  for (const { item, file } of entries) {
    if (seen.has(item.id)) {
      errors.push(`${label} ID 重复: ${item.id}（${seen.get(item.id)} 与 ${file}）`);
    }
    seen.set(item.id, file);
  }
  return seen;
}

/**
 * ID 段必须与文件名书号一致，防止轨道 1 多个 agent 并行写卡时撞号。
 * content/knowledge/b3-*.json 里的 ID 只能是 knowledge-3xx；不带 b<N> 前缀的按占位种子算，只能是 0xx。
 */
function assertIdRanges(entries, prefix, label) {
  for (const { item, file } of entries) {
    const name = file.split('/').pop();
    // 分片文件是 b<N>-<分片>.json，整本一个文件时是 b<N>.json，两种都算书 N
    const book = name.match(/^b(\d)(?:-|\.json$)/)?.[1] ?? '0';
    const num = item.id.slice(prefix.length + 1);
    if (num.length !== 3) {
      errors.push(`${file} [${item.id}] ${label} ID 应为 3 位数字，便于按书分段`);
      continue;
    }
    if (num[0] !== book) {
      const hint = book === '0' ? '占位种子文件只能用 0xx 段' : `文件名标的是书 ${book}，ID 应落在 ${book}xx 段`;
      errors.push(`${file} [${item.id}] ${label} ID 段不符：${hint}（见 contracts/CONTRACT.md）`);
    }
  }
}

// ---- 轨道 1 产出 ----
const knowledge = collect('content/knowledge');
const beans = collect('content/beans');
const drinks = collect('content/drinks');
validateAll(knowledge, 'knowledge-card', '知识卡');
validateAll(beans, 'coffee-bean', '咖啡豆');
validateAll(drinks, 'drink', '饮品');
const knowledgeIds = assertUniqueIds(knowledge, '知识卡');
const beanIds = assertUniqueIds(beans, '咖啡豆');
const drinkIds = assertUniqueIds(drinks, '饮品');
assertIdRanges(knowledge, 'knowledge', '知识卡');
assertIdRanges(beans, 'bean', '咖啡豆');
// 饮品 ID 不是三位数字分段制（drink-espresso 这类），不参与 assertIdRanges

// 出不了的饮品会让营业流程卡死，所以这里报 error，不像知识卡那样降级成占位
for (const { item: bean, file } of beans) {
  for (const did of bean.usable_drinks ?? []) {
    if (!drinkIds.has(did)) {
      errors.push(`${file} [${bean.id}] usable_drinks 指向不存在的饮品 ${did}，请在 content/drinks/ 里补上`);
    }
  }
}

// ---- 轨道 2 产出 ----
const stages = collect('story/chapters');
validateAll(stages, 'stage', '关卡');
const stageIds = assertUniqueIds(stages, '关卡');

const charactersPath = join(ROOT, 'story/characters.json');
let characterIds = new Set();
if (existsSync(charactersPath)) {
  const chars = readJson(charactersPath).map((item) => ({ item, file: 'story/characters.json' }));
  validateAll(chars, 'character', '角色');
  characterIds = new Set(chars.map((c) => c.item.id));
} else {
  errors.push('缺少 story/characters.json');
}

// ---- 跨轨引用与状态键 ----
const stateKeys = readJson(join(ROOT, 'contracts/state-keys.json'));
const allowedFlags = new Set(stateKeys.flags.known);
const allowedTrust = new Set(stateKeys.trust.characters);

for (const { item: stage, file } of stages) {
  const where = `${file} [${stage.id}]`;

  for (const cid of stage.characters) {
    if (!characterIds.has(cid)) errors.push(`${where} 引用了未定义角色 ${cid}`);
  }

  for (const kid of stage.knowledge_brief ?? []) {
    if (!knowledgeIds.has(kid)) warnings.push(`${where} knowledge_brief 指向尚未产出的 ${kid}`);
  }

  for (const kid of stage.reward?.unlock_knowledge ?? []) {
    if (!knowledgeIds.has(kid)) warnings.push(`${where} reward.unlock_knowledge 指向尚未产出的 ${kid}`);
  }

  for (const choice of stage.choices) {
    const cw = `${where}.${choice.id}`;
    if (choice.knowledge_id && !knowledgeIds.has(choice.knowledge_id)) {
      warnings.push(`${cw} knowledge_id 指向尚未产出的 ${choice.knowledge_id}`);
    }
    for (const flag of choice.set_flags ?? []) {
      if (!allowedFlags.has(flag)) {
        errors.push(`${cw} 使用了未登记的 flag「${flag}」，请先加入 contracts/state-keys.json`);
      }
    }
    for (const cid of Object.keys(choice.effects.trust ?? {})) {
      if (!allowedTrust.has(cid)) errors.push(`${cw} effects.trust 键「${cid}」不在白名单内`);
    }
    for (const bid of Object.keys(choice.effects.inventory ?? {})) {
      if (!beanIds.has(bid)) errors.push(`${cw} effects.inventory 引用了不存在的豆子 ${bid}`);
    }
    if (choice.next_stage && !stageIds.has(choice.next_stage)) {
      errors.push(`${cw} next_stage 指向不存在的关卡 ${choice.next_stage}`);
    }
    if (choice.drink_id && !drinkIds.has(choice.drink_id)) {
      errors.push(`${cw} drink_id 指向不存在的饮品 ${choice.drink_id}`);
    }
  }

  if (stage.next_stage && !stageIds.has(stage.next_stage)) {
    errors.push(`${where} next_stage 指向不存在的关卡 ${stage.next_stage}`);
  }
  if (stage.type === 'knowledge_decision' && !(stage.knowledge_brief ?? []).length) {
    errors.push(`${where} knowledge_decision 类型必须提供 knowledge_brief`);
  }
  if (!stage.choices.some((c) => c.result !== 'wrong')) {
    errors.push(`${where} 至少要有一个非 wrong 的选项，否则玩家无路可走`);
  }
  if (stage.choices.some((c) => c.result === 'wrong') && !stage.recovery) {
    errors.push(`${where} 存在 wrong 选项但缺少 recovery（方案 §5 要求错误可恢复）`);
  }
}

// 内容红线：非 placeholder 的卡必须有真实来源，placeholder 的卡不得伪装真实来源
for (const { item: card, file } of [...knowledge, ...beans, ...drinks]) {
  const where = `${file} [${card.id}]`;
  const isPlaceholder = card.confidence === 'placeholder' || card.confidence === undefined;
  const looksReal = card.source_book && card.source_book !== '示例内容，待替换';
  if (isPlaceholder && looksReal) {
    errors.push(`${where} confidence=placeholder 但 source_book 填了具体书名，会误导玩家`);
  }
  if (!isPlaceholder && !looksReal) {
    errors.push(`${where} confidence=${card.confidence} 必须填写真实 source_book`);
  }
}

// ---- 输出 ----
const pad = (n) => String(n).padStart(2, ' ');
console.log(`知识卡 ${pad(knowledge.length)} 张 | 咖啡豆 ${pad(beans.length)} 种 | 饮品 ${pad(drinks.length)} 款 | 关卡 ${pad(stages.length)} 个 | 角色 ${pad(characterIds.size)} 个`);

if (warnings.length) {
  console.log(`\n待补齐（${warnings.length}）:`);
  for (const w of warnings) console.log(`  · ${w}`);
}

if (errors.length) {
  console.error(`\n校验失败（${errors.length}）:`);
  for (const e of errors) console.error(`  x ${e}`);
  process.exit(1);
}

console.log('\n契约校验通过');
