// 把知识卡和关卡拼成一个自带数据的单文件 HTML：双击就能开，不用起服务。
// 数据源和游戏、和 validate.mjs 完全一致，所以内容改完重跑一次就是最新的。
// 用法：npm run kb
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 校验器规定占位卡的来源字段必须写成这个哨兵值，等于「还没有真来源」，不该展示 */
const NO_SOURCE = '示例内容，待替换';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

// ---- 装载 ----------------------------------------------------------------
const kbDir = path.join(root, 'content/knowledge');
const cards = [];
for (const f of fs.readdirSync(kbDir).sort()) {
  if (f.endsWith('.json')) cards.push(...readJson(path.join(kbDir, f)));
}

const chDir = path.join(root, 'story/chapters');
const stages = [];
for (const f of fs.readdirSync(chDir).sort()) {
  if (f.endsWith('.json')) stages.push(...readJson(path.join(chDir, f)));
}

// ---- 反向索引：每张卡挂在哪些关卡的哪个位置 --------------------------------
// 三种挂点：brief 是关卡里摊开讲的，choice 是点某个选项时给的解释，reward 是过关入档。
const usage = new Map();
const note = (id, entry) => {
  if (!id) return;
  if (!usage.has(id)) usage.set(id, []);
  usage.get(id).push(entry);
};
for (const st of stages) {
  for (const id of st.knowledge_brief ?? []) note(id, { stage: st.id, how: 'brief' });
  for (const ch of st.choices ?? []) note(ch.knowledge_id, { stage: st.id, how: 'choice', choice: ch.id });
  for (const id of st.reward?.unlock_knowledge ?? []) note(id, { stage: st.id, how: 'reward' });
}

const clean = (v) => (v && v.trim() && v !== NO_SOURCE ? v.trim() : '');

// 页面配图直接引用游戏里已经生成好的那批 JPEG，不再复制一份。
// 相对路径以 content/关卡知识库.html 为基准；文件不在时 onerror 会把图藏掉。
const artDir = path.join(root, 'game/src/assets');
const have = new Set(
  fs.existsSync(artDir) ? fs.readdirSync(artDir).filter((f) => f.endsWith('.jpg')).map((f) => f.slice(0, -4)) : [],
);
const pick = (name) => (have.has(name) ? name + '.jpg' : '');
const CATEGORY_ART = {
  产地: 'kb-altitude',
  咖啡豆: 'kb-natural',
  器具: 'gear-toolset',
  冲煮: 'gear-v60',
  人物: 'char-chenshu',
  故事线索: 'scene-clues',
};
/** 关卡场景图：scene-<scene> 有就用，没有退回本章扉页 */
const sceneArt = (st) => pick('scene-' + st.scene) || pick(st.chapter.replace('chapter-', 'cover-ch'));

const payload = {
  art: {
    base: '../game/src/assets/',
    chapter: Object.fromEntries(
      [...new Set(stages.map((s) => s.chapter))].map((ch) => [ch, pick(ch.replace('chapter-', 'cover-ch'))]),
    ),
    category: Object.fromEntries(Object.entries(CATEGORY_ART).map(([k, v]) => [k, pick(v)])),
    data: {},
  },
  stages: stages.map((st) => ({
    id: st.id,
    chapter: st.chapter,
    title: st.title,
    type: st.type,
    goal: st.goal,
    scene: st.scene,
    art: sceneArt(st),
    characters: st.characters ?? [],
    brief: st.knowledge_brief ?? [],
    reward: st.reward?.unlock_knowledge ?? [],
    choices: (st.choices ?? []).map((c) => ({
      id: c.id,
      text: c.text,
      result: c.result,
      explanation: c.explanation,
      card: c.knowledge_id ?? '',
    })),
  })),
  cards: cards.map((c) => ({
    id: c.id,
    title: c.title,
    category: c.category,
    confidence: c.confidence,
    plain: c.plain_explanation,
    book: clean(c.source_book),
    chapter: clean(c.source_chapter),
    quote: clean(c.source_quote),
    used: usage.get(c.id) ?? [],
  })),
};

// --inline：把页面真正用到的那几张图 base64 塞进 HTML，产出一个能单独发出去的文件。
// 不加这个参数就还是相对路径引用 game/src/assets，文件小但必须待在仓库里才有图。
const INLINE = process.argv.includes('--inline');
if (INLINE) {
  const used = new Set([
    ...Object.values(payload.art.chapter),
    ...Object.values(payload.art.category),
    ...payload.stages.map((s) => s.art),
  ].filter(Boolean));
  for (const file of used) {
    const b64 = fs.readFileSync(path.join(artDir, file)).toString('base64');
    payload.art.data[file] = 'data:image/jpeg;base64,' + b64;
  }
  payload.art.base = ''; // 全内联了，别在文件里留一条指向仓库的死路径
  console.log(`内联 ${used.size} 张图`);
}

const CSS = String.raw`
:root {
  --paper: #f3e8d0; --paper-l: #fdf8ea; --ink: #4e3a2a; --muted: #8a755b;
  --line: rgba(107, 74, 50, .26); --coffee: #6b4a32; --clay: #c08767;
  --leaf: #6c8462; --leaf-d: #4f6549; --leaf-bg: #eef3e4;
  --sh: 0 1px 0 rgba(255, 255, 255, .5), 0 10px 22px -14px rgba(107, 74, 50, .4);
}
* { box-sizing: border-box; }
body {
  margin: 0; color: var(--ink); background: #e9dcc2;
  font: 15px/1.7 "Songti SC", "Noto Serif CJK SC", Georgia, serif;
}
header {
  position: sticky; top: 0; z-index: 5; padding: 14px 20px 12px;
  background: linear-gradient(176deg, var(--paper-l), var(--paper));
  border-bottom: 1px solid var(--line); box-shadow: var(--sh);
}
h1 { margin: 0; font-size: 20px; letter-spacing: .04em; }
.sub { margin: 2px 0 10px; font-size: 12.5px; color: var(--muted); }
.bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
button {
  font: inherit; font-size: 13.5px; color: var(--ink); cursor: pointer;
  padding: 4px 14px; background: linear-gradient(176deg, #fff9ec, var(--paper));
  border: 1px solid var(--line); border-radius: 3px 10px 3px 10px;
}
button.on { color: var(--paper-l); background: linear-gradient(176deg, #7d5738, var(--coffee)); }
input[type=search] {
  flex: 1; min-width: 200px; font: inherit; font-size: 14px; padding: 5px 12px;
  color: var(--ink); background: var(--paper-l);
  border: 1px solid var(--line); border-radius: 3px 10px 3px 10px;
}
select {
  font: inherit; font-size: 13px; padding: 4px 8px; color: var(--ink);
  background: var(--paper-l); border: 1px solid var(--line); border-radius: 3px;
}
main { display: grid; grid-template-columns: 268px 1fr; gap: 0; align-items: start; }
#nav {
  position: sticky; top: 116px; max-height: calc(100vh - 128px); overflow: auto;
  padding: 14px 10px 40px; border-right: 1px solid var(--line);
}
#panel { padding: 20px 26px 80px; max-width: 860px; }
.group { margin: 0 0 14px; }
.group > h4 {
  margin: 0 0 4px; padding: 0 8px; font-size: 12px; letter-spacing: .12em; color: var(--muted);
}
.navitem {
  display: block; width: 100%; text-align: left; margin: 1px 0; padding: 5px 10px;
  font-size: 13.5px; background: none; border: 1px solid transparent; border-radius: 3px;
}
.navitem:hover { background: rgba(255, 255, 255, .45); }
.navitem.sel { background: var(--paper-l); border-color: var(--line); font-weight: 600; }
.navitem small { display: block; font-size: 11.5px; color: var(--muted); }
.empty { padding: 8px 10px; font-size: 13px; color: var(--muted); }
h2 { margin: 0 0 2px; font-size: 22px; }
.meta { margin: 0 0 16px; font-size: 12.5px; color: var(--muted); }
.goal {
  margin: 0 0 18px; padding: 10px 14px; background: var(--paper-l);
  border: 1px solid var(--line); border-left: 3px solid var(--clay); border-radius: 3px;
}
.lead { margin: 22px 0 8px; font-size: 13px; letter-spacing: .1em; color: var(--muted); }
.choice {
  margin: 0 0 10px; padding: 12px 16px; background: var(--paper-l);
  border: 1px solid var(--line); border-radius: 4px 14px 4px 14px; box-shadow: var(--sh);
}
.choice > b { font-size: 15.5px; }
.choice > p { margin: 6px 0 0; font-size: 14px; color: #5c4733; }
.tag {
  display: inline-block; margin-right: 8px; padding: 1px 9px; font-size: 11.5px;
  border: 1px solid var(--line); border-radius: 999px; background: #fff9ec;
}
.tag.correct { color: #40603a; border-color: rgba(79, 101, 73, .5); background: var(--leaf-bg); }
.tag.acceptable { color: #7a5c2e; border-color: rgba(154, 101, 70, .5); }
.tag.wrong { color: #8d4a3a; border-color: rgba(160, 78, 60, .5); background: #f8e9e2; }
.divider { display: flex; align-items: center; gap: 12px; margin: 26px 0 4px; color: var(--muted); }
.divider::before, .divider::after { content: ''; flex: 1; border-top: 1px solid var(--line); }
.divider span { font-size: 12px; letter-spacing: .16em; }
.card {
  margin: 0 0 10px; padding: 12px 16px; border-radius: 4px 14px 4px 14px;
  background: linear-gradient(176deg, #fdf8ea, var(--paper));
  border: 1px solid var(--line); box-shadow: var(--sh);
}
.card.leaf { background: linear-gradient(176deg, #f2f5e9, #e6eddb); border-color: rgba(79, 101, 73, .32); }
.card.leaf h3 { color: var(--leaf-d); }
.card h3 { margin: 0 0 4px; font-size: 16px; }
.card h3 .id { font-size: 11.5px; font-weight: 400; color: var(--muted); }
.card p { margin: 0; font-size: 14px; }
.card .why { margin: 6px 0 0; font-size: 13px; color: var(--muted); }
.jump {
  padding: 1px 8px; font-size: 12px; background: none;
  border-radius: 999px; border-color: var(--line);
}
details.src { margin: 8px 0 0; font-size: 13px; }
details.src summary { cursor: pointer; color: var(--muted); font-size: 12.5px; }
dl { display: grid; grid-template-columns: 74px 1fr; gap: 2px 10px; margin: 8px 0 0; }
dt { font-size: 12.5px; color: var(--muted); }
dd { margin: 0; font-size: 13px; }
.quote { font-style: italic; color: #5c4733; }
.warn { font-size: 12.5px; color: #8d4a3a; }
.usedlist { display: grid; gap: 4px; margin: 6px 0 0; padding: 0; list-style: none; }
.usedlist li { font-size: 13px; }
@media (max-width: 760px) {
  main { grid-template-columns: 1fr; }
  #nav { position: static; max-height: 320px; border-right: 0; border-bottom: 1px solid var(--line); }
  #panel { padding: 16px; }
}

/* ---- 配图与动效 ---- */
/* 纸张噪点：一层 SVG turbulence 铺在最底，比纯色背景耐看 */
body::before {
  content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none; opacity: .5;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='.16'/%3E%3C/svg%3E");
}
header, main { position: relative; z-index: 1; }

/* 顶部读取进度条 */
#bar {
  position: fixed; left: 0; top: 0; z-index: 9; height: 3px; width: 0;
  background: linear-gradient(90deg, var(--clay), var(--coffee));
  box-shadow: 0 0 8px rgba(107, 74, 50, .45); transition: width .12s linear;
}

/* 关卡场景横幅：图上压一层纸色渐变，标题浮在上面 */
.hero {
  position: relative; margin: 0 0 16px; overflow: hidden;
  border: 1px solid var(--line); border-radius: 4px 16px 4px 16px; box-shadow: var(--sh);
}
.hero img {
  display: block; width: 100%; height: 168px; object-fit: cover; object-position: 50% 42%;
  filter: saturate(.9) contrast(1.02); transform: scale(1.02);
  transition: transform 6s ease-out;
}
.hero:hover img { transform: scale(1.06); }
.hero::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(243, 232, 208, .06) 40%, rgba(243, 232, 208, .92) 100%);
}
.hero .cap {
  position: absolute; left: 16px; right: 16px; bottom: 8px; z-index: 2;
}
.hero .cap b { display: block; font-size: 21px; }
.hero .cap span { font-size: 12.5px; color: #6b563f; }

/* 目录里的章节小图 */
.chapthumb {
  display: block; width: 100%; height: 54px; object-fit: cover; object-position: 50% 40%;
  margin: 0 0 4px; border: 1px solid var(--line); border-radius: 3px 9px 3px 9px;
  filter: saturate(.85); opacity: .92;
}
/* 卡片视图里分类的小圆图 */
.catdot {
  display: inline-block; width: 22px; height: 22px; margin-right: 6px; vertical-align: -6px;
  object-fit: cover; border: 1px solid var(--line); border-radius: 50%;
}

/* 卡片抬起 */
.card, .choice { transition: transform .18s ease, box-shadow .18s ease; }
.card:hover, .choice:hover {
  transform: translateY(-2px);
  box-shadow: 0 1px 0 rgba(255, 255, 255, .6), 0 16px 30px -16px rgba(107, 74, 50, .5);
}
.navitem { transition: background .15s ease, padding-left .15s ease; }
.navitem:hover { padding-left: 14px; }

/* 换屏/滚入时的淡入上移 */
@keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
#panel > *, #nav .group { animation: rise .32s ease both; }
.reveal { opacity: 0; transform: translateY(14px); transition: opacity .5s ease, transform .5s ease; }
.reveal.in { opacity: 1; transform: none; }

/* 搜索命中词 */
mark { padding: 0 2px; color: inherit; background: rgba(192, 135, 103, .38); border-radius: 2px; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
  .reveal { opacity: 1; transform: none; }
}
`;

// 浏览器端脚本。这里刻意不用反引号和 ${}，免得和外层模板字符串打架。
// 浏览器端脚本单独放在 tools/kb-page.js，原样内联，省掉转义麻烦
const JS = fs.readFileSync(path.join(root, 'tools/kb-page.js'), 'utf8');

const uniq = (list) => [...new Set(list.filter(Boolean))].sort();
const options = (key, label, values) =>
  `<select data-key="${key}"><option value="">${label}（全部）</option>` +
  values.map((v) => `<option value="${v}">${v}</option>`).join('') +
  '</select>';

const stamp = new Date().toISOString().slice(0, 10);
const placeholders = payload.cards.filter((c) => c.confidence === 'placeholder').length;
const noCard = payload.stages.reduce(
  (n, st) => n + st.choices.filter((c) => !c.card).length,
  0,
);

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>余温咖啡馆 · 关卡知识库</title>
<style>${CSS}</style>
</head>
<body>
<div id="bar"></div>
<header>
  <h1>余温咖啡馆 · 关卡知识库</h1>
  <p class="sub">${payload.stages.length} 关 · ${payload.cards.length} 张知识卡 · 占位卡 ${placeholders} 张 · 没挂卡的选项 ${noCard} 个 · 导出于 ${stamp}</p>
  <div class="bar">
    <button data-view="stages" class="on">按关卡</button>
    <button data-view="cards">按知识卡</button>
    <input id="q" type="search" placeholder="搜标题、讲解、原文、卡号、关卡名…">
  </div>
  <div class="bar" id="cardfilters" style="display:none;margin-top:8px">
    ${options('category', '分类', uniq(payload.cards.map((c) => c.category)))}
    ${options('book', '来源书', uniq(payload.cards.map((c) => c.book)))}
    ${options('confidence', '可信度', uniq(payload.cards.map((c) => c.confidence)))}
  </div>
</header>
<main>
  <aside id="nav"></aside>
  <section id="panel"></section>
</main>
<script id="data" type="application/json">${JSON.stringify(payload).replace(/</g, '\\u003c')}</script>
<script>${JS}</script>
</body>
</html>
`;

const out = path.join(root, 'content/关卡知识库.html');
fs.writeFileSync(out, html);
console.log(`WROTE ${out} ${(Buffer.byteLength(html) / 1024).toFixed(1)}KB`);
console.log(`关卡 ${payload.stages.length} · 知识卡 ${payload.cards.length} · 占位 ${placeholders} · 无卡选项 ${noCard}`);
