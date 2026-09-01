// 关卡知识库导出页的浏览器端脚本。由 tools/export-knowledge-html.mjs 原样内联进 HTML。
// 单独成文件是为了不用再跟模板字符串的反引号和插值语法打架。
var DATA = JSON.parse(document.getElementById('data').textContent);
var CARD = {};
DATA.cards.forEach(function (c) { CARD[c.id] = c; });
var STAGE = {};
DATA.stages.forEach(function (s) { STAGE[s.id] = s; });

var HOW = { brief: '关卡讲解', choice: '选项解释', reward: '过关入档' };
var RESULT = { correct: '做对了', acceptable: '还行', wrong: '出了岔子' };

var view = 'stages';
// 落地页别挑到 stage-1-1 那种一张卡都没挂的纯教学关，否则一开屏全是「没挂知识卡」
var firstRich = DATA.stages.filter(function (s) {
  return s.brief.length || s.reward.length || s.choices.some(function (c) { return c.card; });
})[0] || DATA.stages[0] || {};
var sel = firstRich.id || '';
var q = '';
var filters = { category: '', book: '', confidence: '' };

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
  });
}

var ART = DATA.art;
/** 有内联的 base64 就用它，否则拼相对路径；图不存在返回空串，调用处整块跳过 */
function art(file) {
  if (!file) return '';
  return (ART.data && ART.data[file]) || ART.base + file;
}

/** 转义之后再把命中的关键词包成 mark，顺序反了会把标签本身也高亮掉 */
function hl(s) {
  var t = esc(s);
  if (!q) return t;
  var needle = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return t.replace(new RegExp(needle, 'gi'), function (m) { return '<mark>' + m + '</mark>'; });
}

function hit(text) { return !q || String(text || '').toLowerCase().indexOf(q) >= 0; }

/** 关卡命中：标题、目标、选项文案，以及它挂的任何一张卡的内容 */
function stageHit(st) {
  if (hit(st.id) || hit(st.title) || hit(st.goal) || hit(st.chapter)) return true;
  var ok = st.choices.some(function (c) { return hit(c.text) || hit(c.explanation); });
  if (ok) return true;
  var ids = st.brief.concat(st.reward, st.choices.map(function (c) { return c.card; }));
  return ids.some(function (id) { return CARD[id] && cardHit(CARD[id], true); });
}

function cardHit(c, skipFilters) {
  if (!skipFilters) {
    if (filters.category && c.category !== filters.category) return false;
    if (filters.book && c.book !== filters.book) return false;
    if (filters.confidence && c.confidence !== filters.confidence) return false;
  }
  return hit(c.id) || hit(c.title) || hit(c.plain) || hit(c.quote) || hit(c.chapter);
}

function cardHtml(c, opts) {
  if (!c) return '<div class="card"><p class="warn">卡片缺失</p></div>';
  var o = opts || {};
  var cls = 'card' + (o.leaf ? ' leaf' : '');
  var h = '<article class="' + cls + '" id="c-' + c.id + '">';
  var dot = art(ART.category[c.category]);
  h += '<h3>';
  if (dot) h += '<img class="catdot" src="' + dot + '" alt="" loading="lazy" onerror="this.remove()">';
  h += hl(c.title) + ' <span class="id">' + esc(c.id) + ' · ' + esc(c.category);
  if (c.confidence === 'placeholder') h += ' · 占位卡';
  h += '</span></h3>';
  h += '<p>' + hl(c.plain) + '</p>';
  if (o.why) h += '<p class="why">' + esc(o.why) + '</p>';
  var rows = '';
  if (c.book) rows += '<dt>来源书籍</dt><dd>' + esc(c.book) + '</dd>';
  if (c.chapter) rows += '<dt>来源章节</dt><dd>' + hl(c.chapter) + '</dd>';
  if (c.quote) rows += '<dt>原文依据</dt><dd class="quote">' + hl(c.quote) + '</dd>';
  h += '<details class="src"><summary>来源与去处（' + c.used.length + ' 处挂点）</summary>';
  h += rows ? '<dl>' + rows + '</dl>' : '<p class="warn">这张卡还没有真实来源，是占位内容。</p>';
  if (c.used.length) {
    h += '<ul class="usedlist">';
    c.used.forEach(function (u) {
      var st = STAGE[u.stage];
      var label = st ? st.chapter + ' · ' + st.title : u.stage;
      h += '<li>' + esc(HOW[u.how]) + (u.choice ? '（' + esc(u.choice) + '）' : '') + '：';
      h += '<button class="jump" data-stage="' + u.stage + '">' + esc(label) + '</button></li>';
    });
    h += '</ul>';
  }
  h += '</details></article>';
  return h;
}

function stagePanel(st) {
  if (!st) return '<p class="empty">左边挑一关。</p>';
  var h = '';
  var pic = art(st.art);
  if (pic) {
    h += '<div class="hero"><img src="' + pic + '" alt="" loading="lazy" onerror="this.closest(\'.hero\').remove()">';
    h += '<div class="cap"><b>' + hl(st.title) + '</b><span>' + esc(st.chapter) + ' · ' + esc(st.id) + '</span></div></div>';
  } else {
    h += '<h2>' + hl(st.chapter) + ' · ' + hl(st.title) + '</h2>';
  }
  h += '<p class="meta">' + esc(st.id) + ' · ' + esc(st.type) + ' · 场景 ' + esc(st.scene);
  h += ' · 出场 ' + esc(st.characters.join('、')) + '</p>';
  h += '<p class="goal">今日目标：' + hl(st.goal) + '</p>';
  h += '<p class="lead">选项 —— 客人提要求时先自己拿主意</p>';
  st.choices.forEach(function (c) {
    h += '<div class="choice"><span class="tag ' + c.result + '">' + esc(RESULT[c.result] || c.result) + '</span>';
    h += '<b>' + hl(c.text) + '</b><p>' + hl(c.explanation) + '</p>';
    h += c.card
      ? '<div style="margin-top:10px">' + cardHtml(CARD[c.card], { why: '点这个选项时给的知识卡' }) + '</div>'
      : '<p class="warn" style="margin-top:8px">这个选项没挂知识卡。</p>';
    h += '</div>';
  });
  if (st.brief.length) {
    h += '<div class="divider"><span>这一关的知识</span></div>';
    st.brief.forEach(function (id) { h += cardHtml(CARD[id], { leaf: true }); });
  }
  if (st.reward.length) {
    h += '<p class="lead">过关入档 ' + st.reward.length + ' 张</p>';
    st.reward.forEach(function (id) { h += cardHtml(CARD[id], {}); });
  }
  return h;
}

function render() {
  var nav = document.getElementById('nav');
  var panel = document.getElementById('panel');
  document.getElementById('cardfilters').style.display = view === 'cards' ? 'flex' : 'none';

  if (view === 'stages') {
    var byChapter = {};
    var order = [];
    DATA.stages.filter(stageHit).forEach(function (st) {
      if (!byChapter[st.chapter]) { byChapter[st.chapter] = []; order.push(st.chapter); }
      byChapter[st.chapter].push(st);
    });
    var h = '';
    order.forEach(function (ch) {
      h += '<div class="group">';
      var cover = art(ART.chapter[ch]);
      if (cover) h += '<img class="chapthumb" src="' + cover + '" alt="" loading="lazy" onerror="this.remove()">';
      h += '<h4>' + esc(ch) + '（' + byChapter[ch].length + '）</h4>';
      byChapter[ch].forEach(function (st) {
        var n = st.brief.length + st.reward.length + st.choices.filter(function (c) { return c.card; }).length;
        h += '<button class="navitem' + (st.id === sel ? ' sel' : '') + '" data-stage="' + st.id + '">';
        h += hl(st.title) + '<small>' + esc(st.id) + ' · ' + n + ' 处知识</small></button>';
      });
      h += '</div>';
    });
    nav.innerHTML = h || '<p class="empty">没有关卡匹配。</p>';
    panel.innerHTML = stagePanel(STAGE[sel]);
  } else {
    var list = DATA.cards.filter(function (c) { return cardHit(c); });
    var byCat = {};
    var cats = [];
    list.forEach(function (c) {
      if (!byCat[c.category]) { byCat[c.category] = []; cats.push(c.category); }
      byCat[c.category].push(c);
    });
    var nh = '';
    cats.forEach(function (cat) {
      var dot = art(ART.category[cat]);
      nh += '<div class="group"><h4>';
      if (dot) nh += '<img class="catdot" src="' + dot + '" alt="" loading="lazy" onerror="this.remove()">';
      nh += esc(cat) + '（' + byCat[cat].length + '）</h4>';
      byCat[cat].forEach(function (c) {
        nh += '<button class="navitem' + (c.id === sel ? ' sel' : '') + '" data-card="' + c.id + '">';
        nh += hl(c.title) + '<small>' + esc(c.id) + ' · ' + c.used.length + ' 处挂点</small></button>';
      });
      nh += '</div>';
    });
    nav.innerHTML = nh || '<p class="empty">没有卡片匹配。</p>';
    var cur = CARD[sel];
    panel.innerHTML = cur && cardHit(cur)
      ? '<h2>' + hl(cur.title) + '</h2><p class="meta">' + esc(cur.id) + ' · ' + esc(cur.category) + '</p>' + cardHtml(cur, {})
      : '<p class="empty">共 ' + list.length + ' 张卡，左边挑一张。</p>';
  }
  reveal();
}

// 滚到跟前才淡入。第一屏的直接放行，免得开屏一片空白。
var io = window.IntersectionObserver
  ? new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' })
  : null;

function reveal() {
  if (!io) return;
  var items = document.getElementById('panel').querySelectorAll('.card, .choice');
  for (var i = 0; i < items.length; i++) {
    if (i < 3) continue;
    items[i].classList.add('reveal');
    io.observe(items[i]);
  }
}

document.addEventListener('click', function (e) {
  var t = e.target.closest('[data-stage],[data-card],[data-view]');
  if (!t) return;
  if (t.dataset.view) {
    view = t.dataset.view;
    sel = view === 'stages' ? firstRich.id : '';
    document.querySelectorAll('[data-view]').forEach(function (b) { b.classList.toggle('on', b.dataset.view === view); });
  } else if (t.dataset.stage) {
    view = 'stages';
    sel = t.dataset.stage;
    document.querySelectorAll('[data-view]').forEach(function (b) { b.classList.toggle('on', b.dataset.view === 'stages'); });
    window.scrollTo(0, 0);
  } else {
    sel = t.dataset.card;
  }
  render();
});

document.getElementById('q').addEventListener('input', function (e) {
  q = e.target.value.trim().toLowerCase();
  render();
});
document.querySelectorAll('#cardfilters select').forEach(function (s) {
  s.addEventListener('change', function () { filters[s.dataset.key] = s.value; render(); });
});

// 顶部读取进度条
var bar = document.getElementById('bar');
if (bar && window.addEventListener) {
  window.addEventListener('scroll', function () {
    var doc = document.documentElement;
    var max = doc.scrollHeight - doc.clientHeight;
    bar.style.width = (max > 0 ? (doc.scrollTop / max) * 100 : 0) + '%';
  }, { passive: true });
}

render();
