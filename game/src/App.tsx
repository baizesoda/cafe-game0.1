import { Fragment, useEffect, useState } from 'react';
import type { Choice, Drink, KnowledgeCard, PlayerSave, Stage, UpgradeId } from '../../contracts/types';
import { ArtDefs, CafeScene, ViewDetail, ZoneArt } from './art';
import { beans, getCard, getCharacterName, getDrink, getStage, knowledgeCards, stages } from './data/loader';
import { cafeGallery, charImage, coverImage, drinkGallery, drinkImage, gearGallery, kbImage, sceneImage } from './pictures';
import {
  UPGRADES,
  activeProfileId,
  applyEffects,
  availableDrinks,
  brewableWith,
  buyUpgrade,
  closeDay,
  createProfile,
  createSave,
  deleteProfile,
  listProfiles,
  loadSave,
  migrateLegacySave,
  numericLabels,
  persistSave,
  serveDrink,
  setActiveProfile,
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
  chenshu_deal_signed: '陈叔留下的进货单，上面有他自己写的批号。',
  origin_lesson_learned: '记了一页产地笔记：海拔、坡向、处理法各自管什么。',
  chapter_02_cleared: '进货这条线走通了，仓库里换了新豆。',
  brew_method_mastered: '一张手写的冲煮参数表，压在吧台玻璃下面。',
  siphon_repaired: '柜子深处那把虹吸壶擦干净了，下座不再漏气。',
  chapter_03_cleared: '出杯稳定下来，熟客回头了。',
  old_menu_restored: '旧菜单被刮掉的那几行补回来了。',
  linshu_past_known: '林叔当年为什么改菜单，现在说得通了。',
  chapter_04_cleared: '顾言那篇专栏见报了。',
  fake_bluemountain_exposed: '那批假蓝山的包装袋，留了一只作证。',
  linshu_returned: '林叔回来了，围裙挂回原来那个钩子上。',
  chapter_05_cleared: '店还开着。',
};

/** 分区牌子上挂哪张手绘插画，key 对应 art.tsx 里的 ZoneArt */
const ZONES: { view: View; name: string; hint: string }[] = [
  { view: 'serve', name: '吧台', hint: '选豆、选饮品、出杯' },
  { view: 'stage', name: '门口', hint: '接待今天上门的客人' },
  { view: 'upgrade', name: '菜单黑板', hint: '店里的设备与菜单升级' },
  { view: 'storage', name: '仓库', hint: '查看咖啡豆库存' },
  { view: 'clues', name: '桌面', hint: '摊着林叔留下的东西' },
  { view: 'map', name: '后门', hint: '进入章节地图' },
];


export default function App() {
  // 开局先把 v1 时代的单一存档搬进档位系统，再决定进哪一档
  const [profileId, setProfileId] = useState(() => {
    migrateLegacySave();
    const active = activeProfileId();
    return active && loadSave(active) ? active : '';
  });
  const [save, setSave] = useState<PlayerSave | null>(() => (profileId ? loadSave(profileId) : null));
  const [view, setView] = useState<View>('home');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [toast, setToast] = useState('');
  /** 当前关卡是否已经端出过一杯。客人关卡要先出杯才能做决定。 */
  const [servedStage, setServedStage] = useState<string | null>(null);

  useEffect(() => {
    if (save && profileId) persistSave(profileId, save);
  }, [save, profileId]);

  const stage = save ? getStage(save.current_stage) : undefined;

  /** 进入某一档：切当前档位，读它自己的存档 */
  function open(id: string) {
    setActiveProfile(id);
    setProfileId(id);
    setSave(loadSave(id));
    setToast('');
    setView('cafe');
  }

  function newProfile(name: string) {
    open(createProfile(name).id);
  }

  /** 回到档位列表，不动任何存档 */
  function switchProfile() {
    setProfileId('');
    setSave(null);
    setOutcome(null);
    setView('home');
  }

  function removeProfile(id: string) {
    deleteProfile(id);
    if (id === profileId) switchProfile();
    else setToast('存档已删除。');
  }

  /** 同一个档从头再来，名字保留 */
  function restart() {
    if (!save) return;
    setSave(createSave(save.player_name));
    setOutcome(null);
    setServedStage(null);
    setToast('店重新开张了。');
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
    // 收工时给当前章节打通关标记，章节号从存档取，不写死第一章
    const cleared = `${save.current_chapter.replace('-', '_')}_cleared`;
    setSave({ ...closeDay(save), flags: { ...save.flags, [cleared]: true } });
    setToast('新的一天，店门重新打开。');
    setView('cafe');
  }

  return (
    <div className="app">
      <ArtDefs />
      <header className="topbar">
        <button className="brand" onClick={() => setView(save ? 'cafe' : 'home')}>余温咖啡馆</button>
        {save && (
          <ul className="stats">
            {numericLabels.map(({ key, label, max }) => (
              <li key={key} className={max ? 'gauge' : 'counter'}>
                <span>{label}</span>
                <strong>{save[key]}{max ? <em>/{max}</em> : null}</strong>
                {max ? (
                  <span className={`bar ${key}`}>
                    <i style={{ width: `${Math.min(100, Math.round((save[key] / max) * 100))}%` }} />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {save && (
          <button className="who" onClick={switchProfile} title="回到存档列表，换一个人玩">
            {save.player_name} · 换档
          </button>
        )}
      </header>

      {toast && <p className="toast" role="status">{toast}</p>}

      {/* key 让每次换场重放入场动效；scene-* 决定这一屏的环境色 */}
      <main className={`content scene-${view}`} key={`${view}${outcome ? '-result' : ''}`}>
        {/* 这一屏的场景横幅。图缺了就不渲染，页面退回纯手绘 */}
        {sceneImage(view) && <img className="scene-band" src={sceneImage(view)} alt="" aria-hidden="true" />}
        <ViewDetail view={view} />
        {view === 'home' && <Home onOpen={open} onCreate={newProfile} onDelete={removeProfile} onArchive={() => setView('archive')} />}
        {view === 'cafe' && save && <Cafe save={save} stage={stage} onGo={(v) => { setToast(''); setView(v); }} />}
        {view === 'map' && save && <ChapterMap save={save} />}
        {view === 'storage' && save && <Storage save={save} />}
        {view === 'clues' && save && <Clues save={save} />}
        {view === 'upgrade' && save && <Upgrades save={save} onBuy={purchase} />}
        {view === 'archive' && <Archive save={save} />}
        {view === 'settlement' && save && <Settlement save={save} onFinish={finishDay} onRestart={restart} />}
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

        {/* 内容底下的一道关卡图，居中当区隔：上面是这一屏的正事，下面是导航 */}
        <SceneBreak chapter={save?.current_chapter} view={view} stage={stage} />
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
/**
 * 页面下半部的区隔：一道横线中间嵌一张关卡图。
 * 图优先用当前章节的扉页，没有就退回这一屏的场景图；两张都没有就只剩一条线。
 */
function SceneBreak({ chapter, view, stage }: { chapter?: string; view: string; stage?: Stage }) {
  const src = (chapter && coverImage(chapter)) ?? sceneImage(view);
  if (!src) return null;
  return (
    <div className="scene-break" aria-hidden="true">
      <img src={src} alt="" loading="lazy" />
      {stage && <span className="mark">{stage.chapter} · {stage.title}</span>}
    </div>
  );
}

/**
 * 首页 = 存档位列表。每个档一行，点进去接着玩，也能删。
 * 档位只存在这台浏览器的 localStorage 里，换设备带不走——这一点在页面上明说，
 * 免得玩家以为是在线账号。
 */
function Home({
  onOpen,
  onCreate,
  onDelete,
  onArchive,
}: {
  onOpen: (id: string) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
  onArchive: () => void;
}) {
  const [name, setName] = useState('');
  /** 删档要二次确认，记住待确认的是哪一个 */
  const [confirming, setConfirming] = useState('');
  // 列表在本组件内自己重算：删档/建档都会让 App 换 view 或重渲染
  const profiles = listProfiles();

  return (
    <section className="panel">
      <h1>余温咖啡馆</h1>
      <p className="lead">老街上的店，昨天还有师傅。今天只剩一封信和一台旧磨豆机。</p>

      <p className="crumb">选一个存档</p>
      {profiles.length === 0 && <p className="empty">还没有存档。在下面起个名字，就能开店。</p>}
      <ul className="profiles">
        {profiles.map((p) => {
          const s = loadSave(p.id);
          return (
            <li key={p.id}>
              <button className="slot" onClick={() => onOpen(p.id)}>
                <strong>{p.name}</strong>
                <span>
                  {s ? `${getStage(s.current_stage)?.chapter.replace('chapter-0', '第') ?? '第'}章 · 现金 ${s.money} · 知识卡 ${s.unlocked_knowledge.length} 张` : '存档读不出来'}
                </span>
              </button>
              {confirming === p.id ? (
                <span className="slot-danger">
                  <button className="danger" onClick={() => { onDelete(p.id); setConfirming(''); }}>确认删除</button>
                  <button onClick={() => setConfirming('')}>算了</button>
                </span>
              ) : (
                <button className="slot-del" onClick={() => setConfirming(p.id)} aria-label={`删除存档 ${p.name}`}>删除</button>
              )}
            </li>
          );
        })}
      </ul>

      <form
        className="new-profile"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(name);
          setName('');
        }}
      >
        <input
          value={name}
          maxLength={12}
          placeholder="给自己起个名字"
          aria-label="新存档的名字"
          onChange={(e) => setName(e.target.value)}
        />
        <button className="primary" type="submit">开一家新店</button>
      </form>

      <div className="actions">
        <button onClick={onArchive}>知识档案</button>
      </div>
      <p className="meta">
        已接入：关卡 {stages.length} 个 · 知识卡 {knowledgeCards.length} 张 · 咖啡豆 {beans.length} 种
      </p>
      <p className="meta">存档只留在这台设备的浏览器里，换电脑或清缓存都会没。</p>
    </section>
  );
}

/**
 * 图鉴条：一排图 + 名字 + 一句话说明。
 * items 由 pictures.ts 过滤过，没生成出图的条目根本不会进来；一条都没有就整块不渲染。
 */
function Plates({ title, items }: { title: string; items: { key: string; name: string; note: string; src: string }[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <p className="crumb">{title} · {items.length} 张</p>
      <div className="plates">
        {items.map((p) => (
          <figure key={p.key} className="plate">
            <img src={p.src} alt={p.name} loading="lazy" />
            <figcaption><strong>{p.name}</strong><span>{p.note}</span></figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}

function Cafe({ save, stage, onGo }: { save: PlayerSave; stage?: Stage; onGo: (v: View) => void }) {
  return (
    <section className="panel">
      <p className="crumb">{save.current_chapter}</p>

      {/* 店里的那一格画面：墙上、吧台上都有各自的生活痕迹 */}
      <CafeScene />

      <h2>店里</h2>
      <p className="goal">{stage ? `今日目标：${stage.goal}` : '今天的活儿干完了，去后门看看章节地图。'}</p>

      <div className="zones">
        {ZONES.map((z) => (
          <button key={z.name} onClick={() => onGo(z.view)}>
            <ZoneArt kind={z.view} />
            <strong>{z.name}</strong>
            <span>{z.hint}</span>
          </button>
        ))}
      </div>

      {/* 店里店外的样子。跟玩法无关，是这一屏的空气 */}
      <Plates title="店里店外" items={cafeGallery()} />
    </section>
  );
}

function ChapterMap({ save }: { save: PlayerSave }) {
  const ordered = [...stages].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  // 按章节分段，每段先摆一张扉页图，再列这一章的关卡
  const chapters = [...new Set(ordered.map((s) => s.chapter))];
  return (
    <section className="panel">
      <h2>章节地图</h2>
      {chapters.map((ch) => {
        const own = ordered.filter((s) => s.chapter === ch);
        const reached = own.some((s) => save.completed_stages.includes(s.id) || save.current_stage === s.id);
        const cover = coverImage(ch);
        return (
          <div key={ch} className={`chapter-block ${reached ? '' : 'sealed'}`}>
            {cover && <img className="chapter-cover" src={cover} alt="" aria-hidden="true" />}
            <p className="crumb">{ch} · 共 {own.length} 关</p>
            <ol className="mapline">
              {own.map((s) => {
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
          </div>
        );
      })}
      <p className="meta">单线路线，走完一章自动接上下一章。没走到的章节封面是压暗的。</p>
    </section>
  );
}
/** 处理法 → 晒床/水槽配图。豆子数据里的处理法是中文，这里做一层映射 */
const PROCESS_ART: Record<string, string> = { 日晒: 'natural', 水洗: 'washed', 蜜处理: 'honey' };

function Storage({ save }: { save: PlayerSave }) {
  const owned = beans.filter((b) => (save.inventory[b.id] ?? 0) > 0);
  // 库存里出现过的处理法，各配一张晒床/水槽的图，让仓库这屏不只是列表
  const processes = [...new Set(owned.map((b) => b.process))].filter((p) => PROCESS_ART[p]);
  return (
    <section className="panel">
      <h2>仓库</h2>
      {owned.length === 0 && <p className="empty">豆子见底了。</p>}

      {processes.length > 0 && (
        <div className="figures">
          {processes.map((p) => (
            <figure key={p}>
              <img src={kbImage(PROCESS_ART[p])} alt="" aria-hidden="true" />
              <figcaption>{p}</figcaption>
            </figure>
          ))}
        </div>
      )}

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

/** 升级项 → 器具配图，只有画了图的才配 */
const UPGRADE_ART: Record<string, string> = { grinder: 'grinder', brewer: 'siphon' };

function Upgrades({ save, onBuy }: { save: PlayerSave; onBuy: (id: UpgradeId) => void }) {
  return (
    <section className="panel">
      <h2>菜单黑板</h2>
      <p className="meta">现金 {save.money}。升级一次性生效，买不起会明确告诉你还差多少。</p>
      <ul className="upgradelist">
        {UPGRADES.map((u) => {
          const owned = save.upgrades.includes(u.id);
          const art = UPGRADE_ART[u.id] ? kbImage(UPGRADE_ART[u.id]) : undefined;
          return (
            <li key={u.id}>
              {art && <img className="gear" src={art} alt="" aria-hidden="true" />}
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

      {/* 器具图鉴：能买的只有几样，但这一行让人知道行当里有多少家伙事 */}
      <Plates title="器具图鉴" items={gearGallery()} />
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
        <div className="drinkcards">
          {options.map((d) => (
            <button key={d.id} className="drinkcard" onClick={() => onServe(d, beanId)}>
              {drinkImage(d.id) && <img src={drinkImage(d.id)} alt="" aria-hidden="true" />}
              <strong>{d.name}</strong>
              <span className="meta">{d.method} · 卖 {d.price} · 用 {d.bean_cost} 份 · {d.speed}</span>
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
        {stage.dialogue.map((line, i) => {
          const name = getCharacterName(line.speaker);
          const face = charImage(line.speaker);
          return (
            <li key={i}>
              {/* 有画好的半身像就贴脸，没画的（比如玩家自己）退回陶土色块加姓氏 */}
              {face ? (
                <img className="avatar portrait" src={face} alt="" aria-hidden="true" />
              ) : (
                <span className="avatar" aria-hidden="true">{[...name][0]}</span>
              )}
              <span className="speaker">{name}</span>
              <p>{line.text}</p>
            </li>
          );
        })}
      </ol>

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

      {/* 讲解压在选项后面：客人提要求时先自己拿主意，往下才是这一关的知识 */}
      {!!stage.knowledge_brief?.length && (
        <>
          <BriefBreak stageId={stage.id} />
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
        </>
      )}
    </section>
  );
}

/**
 * 选项与讲解之间的图片区隔。图按关卡 id 定长挑一张器具/店景，
 * 同一关每次进来都是同一张；一张图都没生成出来就只留下面的知识块。
 */
function BriefBreak({ stageId }: { stageId: string }) {
  const pool = [...gearGallery(), ...cafeGallery()];
  if (pool.length === 0) return null;
  const seed = [...stageId].reduce((n, ch) => n + ch.codePointAt(0)!, 0);
  return (
    <div className="scene-break brief-break">
      <img src={pool[seed % pool.length].src} alt="" loading="lazy" />
      <span className="mark">这一关的知识</span>
    </div>
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

/** 校验器规定占位卡的来源字段必须写成这个哨兵值，等于「还没有真来源」，不该给玩家看 */
const NO_SOURCE = '示例内容，待替换';

function KnowledgeCardView({ card }: { card: KnowledgeCard }) {
  // 只留有真来源的行；一行都没有就整块不渲染，免得留个空的凹陷框
  const rows = [
    ['来源书籍', card.source_book],
    ['来源章节', card.source_chapter],
    ['原文依据', card.source_quote],
  ].filter(([, value]) => value && value.trim() && value !== NO_SOURCE);

  return (
    <article className="card">
      <header>
        <h3>{card.title}</h3>
        <span className={`tag ${card.confidence}`}>{card.category} · {card.confidence}</span>
      </header>
      <p>{card.plain_explanation}</p>
      {card.inference_note && <p className="note">{card.inference_note}</p>}
      {rows.length > 0 && (
        <dl className="source">
          {rows.map(([label, value]) => (
            <Fragment key={label}>
              <dt>{label}</dt><dd>{value}</dd>
            </Fragment>
          ))}
        </dl>
      )}
    </article>
  );
}
function Archive({ save }: { save: PlayerSave | null }) {
  const unlocked = save ? knowledgeCards.filter((c) => save.unlocked_knowledge.includes(c.id)) : [];
  const categories = [...new Set(unlocked.map((c) => c.category))];

  return (
    <section className="panel">
      <h2>知识档案</h2>

      {/* 咖啡类型图鉴：不受解锁进度影响，当一本随时能翻的图册 */}
      <Plates title="咖啡类型图鉴" items={drinkGallery()} />

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
