import { useEffect, useState } from 'react';
import type { Choice, Drink, KnowledgeCard, PlayerSave, Stage, UpgradeId } from '../../contracts/types';
import { beans, getCard, getCharacterName, getDrink, getStage, knowledgeCards, stages } from './data/loader';
import {
  UPGRADES,
  applyEffects,
  availableDrinks,
  brewableWith,
  buyUpgrade,
  clearSave,
  closeDay,
  createSave,
  loadSave,
  numericLabels,
  persistSave,
  serveDrink,
  settleStage,
} from './state';
import './styles.css';

type View = 'home' | 'cafe' | 'map' | 'stage' | 'serve' | 'archive' | 'storage' | 'upgrade' | 'clues' | 'settlement';

interface Outcome {
  choice: Choice;
  changes: string[];
  stage: Stage;
}

/** 桌面上能看到的线索，key 对应 contracts/state-keys.json 的 flags.known */
const CLUE_TEXT: Record<string, string> = {
  read_linshu_letter_1: '林叔的第一封信：「不要相信那张旧菜单。」',
  grinder_repaired: '磨豆机的旧刀盘换掉了，出粉终于均匀。',
  old_menu_examined: '旧菜单背面有被刮掉的字迹。',
  chapter_01_cleared: '第一天营业撑过去了。',
};

const ZONES: { view: View; name: string; hint: string }[] = [
  { view: 'serve', name: '吧台', hint: '选豆、选饮品、出杯' },
  { view: 'stage', name: '门口', hint: '接待今天上门的客人' },
  { view: 'upgrade', name: '菜单黑板', hint: '店里的设备与菜单升级' },
  { view: 'storage', name: '仓库', hint: '查看咖啡豆库存' },
  { view: 'clues', name: '桌面', hint: '摊着林叔留下的东西' },
  { view: 'map', name: '后门', hint: '进入章节地图' },
];

export default function App() {
  const [save, setSave] = useState<PlayerSave | null>(() => loadSave());
  const [view, setView] = useState<View>('home');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [toast, setToast] = useState('');
  /** 当前关卡是否已经端出过一杯。客人关卡要先出杯才能做决定。 */
  const [servedStage, setServedStage] = useState<string | null>(null);

  useEffect(() => {
    if (save) persistSave(save);
  }, [save]);

  const stage = save ? getStage(save.current_stage) : undefined;

  function start(fresh: boolean) {
    setSave(fresh || !save ? createSave() : save);
    setToast('');
    setView('cafe');
  }

  function choose(current: Stage, choice: Choice) {
    if (!save) return;
    const { save: afterEffects, changes } = applyEffects(save, choice.effects);
    setSave(afterEffects);
    setOutcome({ choice, changes, stage: current });
  }

  function advance() {
    if (!save || !outcome) return;
    const { save: next } = settleStage(save, outcome.stage, outcome.choice);
    setSave(next);
    setOutcome(null);
    setServedStage(null);
    setView(next.current_stage ? 'stage' : 'settlement');
  }

  function serve(drink: Drink, beanId: string) {
    if (!save) return;
    const { save: next, ok, reason } = serveDrink(save, drink, beanId);
    if (ok) {
      setSave(next);
      setServedStage(save.current_stage);
    }
    setToast(reason);
  }

  function purchase(id: UpgradeId) {
    if (!save) return;
    const { save: next, ok, reason } = buyUpgrade(save, id);
    if (ok) setSave(next);
    setToast(reason);
  }

  function finishDay() {
    if (!save) return;
    setSave({ ...closeDay(save), flags: { ...save.flags, chapter_01_cleared: true } });
    setToast('新的一天，店门重新打开。');
    setView('cafe');
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setView(save ? 'cafe' : 'home')}>余温咖啡馆</button>
        {save && (
          <ul className="stats">
            {numericLabels.map(({ key, label }) => (
              <li key={key}>
                <span>{label}</span>
                <strong>{save[key]}</strong>
              </li>
            ))}
          </ul>
        )}
      </header>

      {toast && <p className="toast" role="status">{toast}</p>}

      <main className="content">
        {view === 'home' && <Home hasSave={!!save} onStart={start} onArchive={() => setView('archive')} />}
        {view === 'cafe' && save && <Cafe save={save} stage={stage} onGo={(v) => { setToast(''); setView(v); }} />}
        {view === 'map' && save && <ChapterMap save={save} />}
        {view === 'storage' && save && <Storage save={save} />}
        {view === 'clues' && save && <Clues save={save} />}
        {view === 'upgrade' && save && <Upgrades save={save} onBuy={purchase} />}
        {view === 'archive' && <Archive save={save} />}
        {view === 'settlement' && save && <Settlement save={save} onFinish={finishDay} onRestart={() => { clearSave(); setSave(null); setView('home'); }} />}
        {view === 'serve' && save && <ServeDesk save={save} onServe={serve} />}
        {view === 'stage' && stage && save && !outcome && (
          <StageView
            stage={stage}
            save={save}
            served={servedStage === stage.id}
            onServe={serve}
            onChoose={choose}
          />
        )}
        {view === 'stage' && outcome && <Result outcome={outcome} onNext={advance} />}
        {view === 'stage' && !stage && (
          <section className="panel">
            <p className="empty">今天没有待办的关卡了。剧情轨道产出新章节后会自动接上。</p>
            <div className="actions"><button onClick={() => setView('cafe')}>回到店里</button></div>
          </section>
        )}
      </main>

      {save && view !== 'home' && view !== 'cafe' && (
        <nav className="bottombar">
          <button onClick={() => setView('cafe')}>回到店里</button>
          <button onClick={() => setView('archive')}>知识档案</button>
        </nav>
      )}
    </div>
  );
}
function Home({ hasSave, onStart, onArchive }: { hasSave: boolean; onStart: (fresh: boolean) => void; onArchive: () => void }) {
  return (
    <section className="panel">
      <h1>余温咖啡馆</h1>
      <p className="lead">老街上的店，昨天还有师傅。今天只剩一封信和一台旧磨豆机。</p>
      <div className="actions">
        {hasSave && <button className="primary" onClick={() => onStart(false)}>继续营业</button>}
        <button className={hasSave ? '' : 'primary'} onClick={() => onStart(true)}>{hasSave ? '重新开始' : '开始营业'}</button>
        <button onClick={onArchive}>知识档案</button>
      </div>
      <p className="meta">
        已接入：关卡 {stages.length} 个 · 知识卡 {knowledgeCards.length} 张 · 咖啡豆 {beans.length} 种
      </p>
    </section>
  );
}

function Cafe({ save, stage, onGo }: { save: PlayerSave; stage?: Stage; onGo: (v: View) => void }) {
  return (
    <section className="panel">
      <p className="crumb">{save.current_chapter}</p>
      <h2>店里</h2>
      <p className="goal">{stage ? `今日目标：${stage.goal}` : '今天的活儿干完了，去后门看看章节地图。'}</p>

      <div className="zones">
        {ZONES.map((z) => (
          <button key={z.name} onClick={() => onGo(z.view)}>
            <strong>{z.name}</strong>
            <span>{z.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ChapterMap({ save }: { save: PlayerSave }) {
  const ordered = [...stages].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  return (
    <section className="panel">
      <h2>章节地图</h2>
      <ol className="mapline">
        {ordered.map((s) => {
          const done = save.completed_stages.includes(s.id);
          const current = save.current_stage === s.id;
          const state = done ? 'done' : current ? 'current' : 'locked';
          const label = done ? '已完成' : current ? '当前可玩' : '未解锁';
          return (
            <li key={s.id} className={state}>
              <span className="node">{label}</span>
              <span>{done || current ? s.title : '???'}</span>
            </li>
          );
        })}
      </ol>
      <p className="meta">第一版是单线路线，后续章节由剧情轨道产出后自动出现在这里。</p>
    </section>
  );
}
function Storage({ save }: { save: PlayerSave }) {
  const owned = beans.filter((b) => (save.inventory[b.id] ?? 0) > 0);
  return (
    <section className="panel">
      <h2>仓库</h2>
      {owned.length === 0 && <p className="empty">豆子见底了。</p>}
      <ul className="beanlist">
        {owned.map((b) => (
          <li key={b.id}>
            <strong>{b.name}</strong>
            <span className="meta">{b.origin} · {b.process} · {b.roast_level} · {b.flavor_tags.join('／')}</span>
            <span className="count">剩 {save.inventory[b.id]} 份</span>
          </li>
        ))}
      </ul>
      <p className="crumb">已完成的升级</p>
      <p>{save.upgrades.length ? save.upgrades.map((u) => UPGRADES.find((x) => x.id === u)?.name ?? u).join('、') : '还没有升级过任何设备。'}</p>
    </section>
  );
}

function Clues({ save }: { save: PlayerSave }) {
  const found = Object.keys(save.flags).filter((f) => save.flags[f] && CLUE_TEXT[f]);
  return (
    <section className="panel">
      <h2>桌面</h2>
      {found.length === 0 && <p className="empty">桌上还是空的。先去营业。</p>}
      <ul className="changes">
        {found.map((f) => <li key={f}>{CLUE_TEXT[f]}</li>)}
      </ul>
    </section>
  );
}

function Upgrades({ save, onBuy }: { save: PlayerSave; onBuy: (id: UpgradeId) => void }) {
  return (
    <section className="panel">
      <h2>菜单黑板</h2>
      <p className="meta">现金 {save.money}。升级一次性生效，买不起会明确告诉你还差多少。</p>
      <ul className="upgradelist">
        {UPGRADES.map((u) => {
          const owned = save.upgrades.includes(u.id);
          return (
            <li key={u.id}>
              <div>
                <strong>{u.name}</strong>
                <span className="meta">{u.effect}</span>
              </div>
              <button disabled={owned} onClick={() => onBuy(u.id)}>
                {owned ? '已完成' : `花 ${u.cost}`}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
/**
 * 吧台：选豆 → 选饮品 → 出杯。
 * 只列有库存的豆子；饮品按菜单、升级条件和库存够不够过滤（state.brewableWith）。
 */
function ServeDesk({ save, onServe }: { save: PlayerSave; onServe: (drink: Drink, beanId: string) => void }) {
  const owned = beans.filter((b) => (save.inventory[b.id] ?? 0) > 0);
  const [picked, setPicked] = useState('');
  const beanId = owned.some((b) => b.id === picked) ? picked : owned[0]?.id ?? '';
  const bean = owned.find((b) => b.id === beanId);
  const options = bean ? brewableWith(save, bean) : [];
  const menuSize = availableDrinks(save).length;

  if (!bean) {
    return (
      <section className="panel">
        <h2>吧台</h2>
        <p className="empty">豆子见底了，今天出不了杯。</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>吧台</h2>
      <p className="meta">菜单上有 {menuSize} 款饮品。先选豆，再选要做的那杯。</p>

      <p className="crumb">选豆</p>
      <div className="choices">
        {owned.map((b) => (
          <button key={b.id} className={b.id === beanId ? 'primary' : ''} onClick={() => setPicked(b.id)}>
            {b.name}（剩 {save.inventory[b.id]} 份 · 进价 {b.purchase_price}）
          </button>
        ))}
      </div>

      <p className="crumb">选饮品</p>
      {options.length === 0 ? (
        <p className="empty">{bean.name}现在做不出东西：菜单上没有它能做的饮品，或者库存不够一杯的用量。</p>
      ) : (
        <div className="choices">
          {options.map((d) => (
            <button key={d.id} onClick={() => onServe(d, beanId)}>
              {d.name}（{d.method} · 卖 {d.price} · 用 {d.bean_cost} 份 · {d.speed}）
            </button>
          ))}
        </div>
      )}
      <p className="meta">{bean.name}：{bean.origin} · {bean.roast_level} · {bean.flavor_tags.join('／')}</p>
    </section>
  );
}

function StageView({
  stage,
  save,
  served,
  onServe,
  onChoose,
}: {
  stage: Stage;
  save: PlayerSave;
  served: boolean;
  onServe: (drink: Drink, beanId: string) => void;
  onChoose: (stage: Stage, choice: Choice) => void;
}) {
  // 有客人上门的关卡先得端出一杯，才能做决定
  const needsCup = stage.characters.includes('customer');
  return (
    <section className="panel">
      <p className="crumb">{stage.chapter} · {stage.title}</p>
      <p className="goal">今日目标：{stage.goal}</p>

      <ol className="dialogue">
        {stage.dialogue.map((line, i) => (
          <li key={i}>
            <span className="speaker">{getCharacterName(line.speaker)}</span>
            <p>{line.text}</p>
          </li>
        ))}
      </ol>

      {!!stage.knowledge_brief?.length && (
        <div className="briefs">
          {stage.knowledge_brief.map((id) => {
            const card = getCard(id);
            return (
              <article key={id} className="brief">
                <h3>{card.title}</h3>
                <p>{card.plain_explanation}</p>
              </article>
            );
          })}
        </div>
      )}

      {needsCup && !served && <ServeDesk save={save} onServe={onServe} />}

      {needsCup && !served ? (
        <p className="recovery">客人还等着，先在吧台做一杯再决定怎么答。</p>
      ) : (
        <div className="choices">
          {stage.choices.map((choice) => (
            <button key={choice.id} onClick={() => onChoose(stage, choice)}>{choice.text}</button>
          ))}
        </div>
      )}
    </section>
  );
}
const RESULT_LABEL = { correct: '做对了', acceptable: '还行', wrong: '出了岔子' } as const;

function Result({ outcome, onNext }: { outcome: Outcome; onNext: () => void }) {
  const { choice, changes, stage } = outcome;
  const card = choice.knowledge_id ? getCard(choice.knowledge_id) : null;

  return (
    <section className="panel">
      <p className={`verdict ${choice.result}`}>{RESULT_LABEL[choice.result]}</p>
      <p className="lead">{choice.explanation}</p>

      {changes.length > 0 ? (
        <ul className="changes">
          {changes.map((c) => <li key={c}>{c}</li>)}
        </ul>
      ) : (
        <p className="meta">本次选择没有产生数值变化。</p>
      )}

      {choice.result === 'wrong' && stage.recovery && <p className="recovery">{stage.recovery}</p>}

      {card && <KnowledgeCardView card={card} />}

      <div className="actions">
        <button className="primary" onClick={onNext}>继续</button>
      </div>
    </section>
  );
}

function KnowledgeCardView({ card }: { card: KnowledgeCard }) {
  return (
    <article className="card">
      <header>
        <h3>{card.title}</h3>
        <span className={`tag ${card.confidence}`}>{card.category} · {card.confidence}</span>
      </header>
      <p>{card.plain_explanation}</p>
      {card.inference_note && <p className="note">{card.inference_note}</p>}
      <dl className="source">
        <dt>来源书籍</dt><dd>{card.source_book}</dd>
        <dt>来源章节</dt><dd>{card.source_chapter}</dd>
        <dt>原文依据</dt><dd>{card.source_quote}</dd>
      </dl>
    </article>
  );
}
function Archive({ save }: { save: PlayerSave | null }) {
  const unlocked = save ? knowledgeCards.filter((c) => save.unlocked_knowledge.includes(c.id)) : [];
  const categories = [...new Set(unlocked.map((c) => c.category))];

  return (
    <section className="panel">
      <h2>知识档案</h2>
      {unlocked.length === 0 && <p className="empty">还没有解锁任何知识卡。先去营业。</p>}
      {categories.map((cat) => (
        <div key={cat}>
          <p className="crumb">{cat}</p>
          {unlocked.filter((c) => c.category === cat).map((c) => <KnowledgeCardView key={c.id} card={c} />)}
        </div>
      ))}
    </section>
  );
}

function Settlement({ save, onFinish, onRestart }: { save: PlayerSave; onFinish: () => void; onRestart: () => void }) {
  const t = save.today;
  const net = t.revenue - t.cost;
  const cups = Object.entries(t.drinks_served ?? {}).filter(([, n]) => n > 0);
  const rows: [string, string][] = [
    ['今日收入', String(t.revenue)],
    ['原料成本', String(t.cost)],
    ['净收益', String(net)],
    ['接待客人', `${t.customers} 位`],
    ['满意客人', `${t.satisfied} 位`],
    ['今日出杯', cups.length ? cups.map(([id, n]) => `${getDrink(id).name} ${n} 杯`).join('、') : '一杯没出'],
    ['浪费豆量', `${t.wasted} 份`],
    ['当前口碑', String(save.reputation)],
    ['今日满意度', String(save.satisfaction_today)],
    ['新获知识', t.knowledge_gained.length ? t.knowledge_gained.map((id) => getCard(id).title).join('、') : '无'],
    ['设备升级', save.upgrades.length ? save.upgrades.map((u) => UPGRADES.find((x) => x.id === u)?.name ?? u).join('、') : '无'],
  ];

  return (
    <section className="panel">
      <h2>今日结算</h2>
      <ul className="ledger">
        {rows.map(([k, v]) => (
          <li key={k}><span>{k}</span><strong>{v}</strong></li>
        ))}
      </ul>
      <p className="meta">下一章内容由剧情轨道产出后会自动接上，界面代码无需改动。</p>
      <div className="actions">
        <button className="primary" onClick={onFinish}>收工，明天见</button>
        <button onClick={onRestart}>清档重来</button>
      </div>
    </section>
  );
}
