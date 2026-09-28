/* 配方墙（M7.5 / U13 之外的三段式）：编辑器 → 生成提交码 / 收录；收录台 → 粘贴读出；配方墙 → 列表与「按这配方来一杯」。
 * 校验与去重都走 recipes.ts 的纯函数，界面只负责收集输入与显示理由。
 */
import { useState } from 'react';
import { type BrewParams, deriveBrewParams } from './brew';
import { beans, drinks } from './data/loader';
import { type Recipe, type RecipeDraft, addRecipe, encodeRecipe, decodeRecipe, validateRecipe } from './recipes';
import { copyText, downloadText, shareText } from './share';

/** 「刚做的那杯」草稿（本局内存，刷新即失效，D15）。 */
export interface LastBrew {
  beanId: string;
  drinkId: string;
  params: BrewParams;
}

const beanName = (id: string) => (id ? (beans.find((b) => b.id === id)?.name ?? id) : '任意');
const drinkName = (id: string) => drinks.find((d) => d.id === id)?.name ?? id;

/** 参数摘要：只列填了的项，配方墙上能一眼看完。 */
function paramSummary(p: Partial<BrewParams>): string {
  const parts: string[] = [];
  if (p.tempC) parts.push(`水温 ${p.tempC[0]}–${p.tempC[1]}℃`);
  if (p.grind) parts.push(`研磨 ${p.grind}`);
  if (p.doseG !== undefined) parts.push(`粉量 ${p.doseG}g`);
  if (p.waterMl !== undefined) parts.push(`水量 ${p.waterMl}ml`);
  if (p.milkMl !== undefined) parts.push(`牛奶 ${p.milkMl}ml`);
  if (p.timeS !== undefined) parts.push(`时长 ${p.timeS} 秒`);
  return parts.length ? parts.join(' · ') : '没填参数，按豆子派生';
}

export default function RecipesPanel({
  recipes,
  lastBrew,
  onAdd,
  onRemove,
  onBrewWith,
  onBack,
}: {
  recipes: Recipe[];
  lastBrew: LastBrew | null;
  onAdd: (draft: RecipeDraft) => void;
  onRemove: (id: string) => void;
  onBrewWith: (recipe: Recipe) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState('');
  const [author, setAuthor] = useState('');
  const [beanId, setBeanId] = useState('');
  const [drinkId, setDrinkId] = useState(drinks[0]?.id ?? '');
  const [tempLo, setTempLo] = useState('');
  const [tempHi, setTempHi] = useState('');
  const [grind, setGrind] = useState('');
  const [dose, setDose] = useState('');
  const [water, setWater] = useState('');
  const [milk, setMilk] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState('');
  const [code, setCode] = useState('');

  const [paste, setPaste] = useState('');
  const [preview, setPreview] = useState<Recipe | null>(null);

  const drink = drinks.find((d) => d.id === drinkId);
  const bean = beans.find((b) => b.id === beanId);
  // 占位提示：选了豆就给出派生值，没选就写「自动」
  const hint = bean && drink ? deriveBrewParams(bean, drink) : null;
  const ph = (v: number | undefined) => (v === undefined ? '自动' : String(v));

  const num = (v: string): number => Number(v.trim());

  function collect(): { ok: true; draft: RecipeDraft } | { ok: false; reason: string } {
    const params: Partial<BrewParams> = {};
    if (grind.trim()) params.grind = grind.trim();
    if (dose.trim()) params.doseG = num(dose);
    if (water.trim()) params.waterMl = num(water);
    if (milk.trim()) params.milkMl = num(milk);
    if (time.trim()) params.timeS = num(time);
    if (tempLo.trim() || tempHi.trim()) {
      if (!tempLo.trim() || !tempHi.trim()) return { ok: false, reason: '水温区间的两个值要一起填，比如 [90, 93]' };
      params.tempC = [num(tempLo), num(tempHi)];
    }
    return { ok: true, draft: { name, author, beanId, drinkId, params, note } };
  }

  function check(): { ok: true; recipe: Recipe } | { ok: false; reason: string } {
    const draft = collect();
    if (!draft.ok) return draft;
    return validateRecipe(draft.draft);
  }

  /** 收录入库前先在本地过一遍 validate + addRecipe，理由当场显示（真入库由 App 落盘）。 */
  function store(recipe: Recipe): boolean {
    const added = addRecipe(recipes, recipe);
    if (!added.ok) {
      setNotice(added.reason);
      return false;
    }
    onAdd(recipe);
    setNotice(`「${recipe.name}」已经贴到墙上。`);
    return true;
  }

  function fillLastBrew() {
    if (!lastBrew) return;
    setName('');
    setBeanId(lastBrew.beanId);
    setDrinkId(lastBrew.drinkId);
    const p = lastBrew.params;
    setTempLo(String(p.tempC[0]));
    setTempHi(String(p.tempC[1]));
    setGrind(p.grind);
    setDose(String(p.doseG));
    setWater(String(p.waterMl));
    setMilk(p.milkMl === undefined ? '' : String(p.milkMl));
    setTime(String(p.timeS));
    setNotice('把刚做的那杯填进来了，起个名字就能贴到墙上。');
  }

  function makeCode() {
    const checked = check();
    if (!checked.ok) {
      setNotice(checked.reason);
      setCode('');
      return;
    }
    setCode(encodeRecipe(checked.recipe));
    setNotice('码生成好了，复制给别人去收录台读。');
  }

  function readPaste() {
    const read = decodeRecipe(paste.trim());
    if (!read.ok) {
      setPreview(null);
      setNotice(`这段码读不出来：${read.reason}`);
      return;
    }
    setPreview(read.recipe);
    setNotice(`读到了「${read.recipe.name}」，确认无误就收录。`);
  }

  return (
    <section className="panel">
      <h2>配方墙</h2>
      <p className="meta">墙上现在 {recipes.length} 条。做法传出去靠码，不联网也能收。</p>

      <h3>编辑器</h3>
      <div className="recipe-form">
        <label>
          名称
          <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="比如：三段的耶加" />
        </label>
        <label>
          署名
          <input value={author} maxLength={12} onChange={(e) => setAuthor(e.target.value)} placeholder="留空就是匿名" />
        </label>
        <label>
          豆子
          <select value={beanId} onChange={(e) => setBeanId(e.target.value)}>
            <option value="">任意</option>
            {beans.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <label>
          饮品
          <select value={drinkId} onChange={(e) => setDrinkId(e.target.value)}>
            {drinks.map((d) => (
              <option key={d.id} value={d.id}>{d.name}（{d.method}）</option>
            ))}
          </select>
        </label>
        <label>
          水温
          <span className="range">
            <input type="number" value={tempLo} onChange={(e) => setTempLo(e.target.value)} placeholder={ph(hint?.tempC[0])} />
            <span>–</span>
            <input type="number" value={tempHi} onChange={(e) => setTempHi(e.target.value)} placeholder={ph(hint?.tempC[1])} />
            <span>℃</span>
          </span>
        </label>
        <label>
          研磨
          <input value={grind} onChange={(e) => setGrind(e.target.value)} placeholder={hint?.grind ?? '自动'} />
        </label>
        <label>
          粉量
          <input type="number" value={dose} onChange={(e) => setDose(e.target.value)} placeholder={ph(hint?.doseG)} />
        </label>
        <label>
          水量
          <input type="number" value={water} onChange={(e) => setWater(e.target.value)} placeholder={ph(hint?.waterMl)} />
        </label>
        {drink?.method === '奶咖' && (
          <label>
            牛奶
            <input type="number" value={milk} onChange={(e) => setMilk(e.target.value)} placeholder={ph(hint?.milkMl)} />
          </label>
        )}
        <label>
          时长
          <input type="number" value={time} onChange={(e) => setTime(e.target.value)} placeholder={ph(hint?.timeS)} />
        </label>
        <label className="wide">
          风味笔记
          <textarea value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} placeholder="这一杯喝起来像什么" />
        </label>
      </div>
      <p className="meta">留空的项按豆子与做法派生（水温看烘焙度，粉水比看做法）。</p>
      <div className="actions">
        <button onClick={() => (lastBrew ? fillLastBrew() : setNotice('吧台还没做过一杯，先去做一杯再回来。'))}>
          填入刚做的那杯
        </button>
        <button
          className="primary"
          onClick={() => {
            const checked = check();
            if (!checked.ok) {
              setNotice(checked.reason);
              return;
            }
            store(checked.recipe);
          }}
        >
          收录到配方墙
        </button>
        <button onClick={makeCode}>生成提交码</button>
      </div>
      {code && (
        <>
          <textarea className="code" readOnly value={code} rows={3} />
          <div className="actions">
            <button onClick={() => void copyText(code).then((ok) => setNotice(ok ? '已复制。' : '复制不上，长按选中吧。'))}>
              复制
            </button>
            <button
              onClick={() =>
                void shareText('余温咖啡馆 · 配方', code).then((r) =>
                  setNotice(r === 'shared' ? '分享出去了。' : r === 'copied' ? '这台机器不能直接分享，已经复制到剪贴板。' : '分享和复制都没成，长按选中吧。'),
                )
              }
            >
              分享
            </button>
            <button onClick={() => downloadText('yuwen-recipe.txt', code)}>下载</button>
          </div>
        </>
      )}

      <h3>收录台</h3>
      <textarea
        className="code"
        rows={3}
        value={paste}
        onChange={(e) => {
          setPaste(e.target.value);
          setPreview(null);
        }}
        placeholder="把别人给的配方码贴在这里"
      />
      <div className="actions">
        <button disabled={!paste.trim()} onClick={readPaste}>读一读</button>
        {preview && (
          <button
            className="primary"
            onClick={() => {
              if (store(preview)) {
                setPaste('');
                setPreview(null);
              }
            }}
          >
            收录这条
          </button>
        )}
      </div>
      {preview && (
        <div className="recipecard">
          <strong>{preview.name}</strong>
          <span className="meta">署名：{preview.author || '匿名'}</span>
          <span className="meta">豆：{beanName(preview.beanId)} · 饮品：{drinkName(preview.drinkId)}</span>
          <span className="meta">{paramSummary(preview.params)}</span>
          {preview.note && <span className="meta">{preview.note}</span>}
        </div>
      )}

      <h3>墙上</h3>
      {notice && <p className="meta">{notice}</p>}
      {recipes.length === 0 ? (
        <p className="empty">墙上还空着。上面写一份，或者把朋友给的码读到收录台。</p>
      ) : (
        <ul className="recipelist">
          {recipes.map((r) => (
            <li key={r.id}>
              <strong>{r.name}</strong>
              <span className="meta">{r.author || '匿名'} · 豆：{beanName(r.beanId)} · {drinkName(r.drinkId)}</span>
              <span className="meta">{paramSummary(r.params)}</span>
              {r.note && <span className="meta">{r.note}</span>}
              <div className="actions">
                <button className="primary" onClick={() => onBrewWith(r)}>按这配方来一杯</button>
                <button onClick={() => onRemove(r.id)}>删掉</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="actions">
        <button onClick={onBack}>回店里</button>
      </div>
    </section>
  );
}
