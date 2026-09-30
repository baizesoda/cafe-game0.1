import { Fragment, useEffect, useLayoutEffect, useState } from 'react';
import type { Choice, Drink, KnowledgeCard, PlayerSave, Stage, UpgradeId } from '../../contracts/types';
import { ArtDefs, CafeScene, ViewDetail, ZoneArt } from './art';
import BusinessView from './BusinessView';
import {
  type BusinessRecord,
  type Order,
  applyServe,
  freshRecord,
  loadBusiness,
  nextDay,
  persistBusiness,
  planDay,
  rateOrder,
  recordUsedBean,
} from './business';
import { type BrewGrade, type BrewParams, GRADE_SATISFACTION } from './brew';
import { beans, getCard, getCharacterName, getDrink, getStage, knowledgeCards, stages } from './data/loader';
import FeedbackPanel from './FeedbackPanel';
import {
  type FeedbackItem,
  type FeedbackKind,
  type SnapshotInput,
  describeOf,
  installErrorCapture,
  lastErrorOf,
  loadFeedback,
  makeFeedback,
  persistFeedback,
  recentActions,
  recordAction,
} from './feedback';
import { type View, screenKeyOf } from './nav';
import NavMenu from './NavMenu';
import { cafeGallery, charImage, coverImage, drinkGallery, gearGallery, kbImage, sceneImage } from './pictures';
import { applyPwaUpdate, onPwaUpdate } from './pwa';
import Purchase from './Purchase';
import RecipesPanel, { type LastBrew } from './RecipesPanel';
import { type Recipe, type RecipeDraft, addRecipe, loadRecipes, persistRecipes, removeRecipe, validateRecipe } from './recipes';
import ServeDesk, { type ServePreset } from './ServeDesk';
import { type Settings, loadSettings, saveSettings, withRelaxedEconomy } from './settings';
import { buildSaveCode, copyText, downloadText, planImport, profileProgressLabel, shareText } from './share';
import {
  EMERGENCY_BEAN,
  UPGRADES,
  activeProfileId,
  applyEffects,
  buyBean,
  buyUpgrade,
  closeDay,
  createProfile,
  createSave,
  deleteProfile,
  displayMoney,
  isStoryComplete,
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
  { view: 'business', name: '门店', hint: '开门做生意，接一天的客人' },
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
  /** 体验期设置（M2）、配方库（M7）、反馈（M6）各有自己的键，与存档解耦 */
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [recipes, setRecipes] = useState<Recipe[]>(() => loadRecipes());
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>(() => loadFeedback());
  /** 自由营业档案（M3）：按档位存，没开过业就是 null */
  const [bizRec, setBizRec] = useState<BusinessRecord | null>(() => (profileId ? loadBusiness(profileId) : null));
  /** 「按这配方来一杯」带进吧台的预设 */
  const [servePreset, setServePreset] = useState<ServePreset | null>(null);
  /** 正在为哪一单出杯：只有从营业页「做这一杯」进来才有，避免别的入口误判星级 */
  const [brewingOrder, setBrewingOrder] = useState<Order | null>(null);
  /** 刚做的那杯，本局内存、刷新即失效（D15），给配方墙当草稿 */
  const [lastBrew, setLastBrew] = useState<LastBrew | null>(null);
  /** 进货屏从哪儿进来的，返回就回哪儿 */
  const [purchaseBack, setPurchaseBack] = useState<View>('cafe');
  /** 结算页的营业日副标题（U10）；也兼作「这次结算来自营业」的标志 */
  const [dayLabel, setDayLabel] = useState<string | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const unlimited = settings.relaxedEconomy;
  const eco = { unlimited };

  useEffect(() => {
    if (save && profileId) persistSave(profileId, save);
  }, [save, profileId]);

  // 新版就绪才亮更新条（U14）
  useEffect(() => onPwaUpdate(() => setUpdateReady(true)), []);

  // 错误捕获（M6.2）：快照存最近一次；环形缓冲另记一条操作（M6.1）
  useEffect(() => {
    const stop = installErrorCapture(window);
    const onError = (e: ErrorEvent) => recordAction('error', e.message || '未知错误');
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = (e as { reason?: unknown }).reason;
      const message = typeof reason === 'string' ? reason : ((reason as { message?: string })?.message ?? '未处理的 Promise 拒绝');
      recordAction('error', message);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      stop();
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  const stage = save ? getStage(save.current_stage) : undefined;

  /** 屏幕键（M9.2）：换屏即变——比 `main` 的 key 多带 `stage.id`（下一关切换要置顶，见 `nav.ts`）；同屏浮层与提示条不参与 */
  const screenKey = screenKeyOf(view, !!outcome, stage?.id);

  // 每次换屏回到页首（M9.2）：滚动承载面就是视口本身
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [screenKey]);

  // 最近操作（M6.1）：切屏与选关各记一条
  useEffect(() => {
    recordAction('view', view);
  }, [view]);
  useEffect(() => {
    if (view === 'stage' && stage) recordAction('stage', `${stage.id} ${stage.title}`);
  }, [view, stage]);

  /** 进入某一档：切当前档位，读它自己的存档与营业档案 */
  function open(id: string) {
    setActiveProfile(id);
    setProfileId(id);
    setSave(loadSave(id));
    setBizRec(loadBusiness(id));
    setServePreset(null);
    setBrewingOrder(null);
    setDayLabel(null);
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
    setBizRec(null);
    setServePreset(null);
    setBrewingOrder(null);
    setDayLabel(null);
    setOutcome(null);
    setView('home');
  }

  function removeProfile(id: string) {
    deleteProfile(id);
    if (id === profileId) switchProfile();
    else setToast('存档已删除。');
  }

  /** 同一个档从头再来，名字保留；营业档案也回到第 1 天 */
  function restart() {
    if (!save) return;
    const rec = freshRecord();
    setSave(createSave(save.player_name));
    setBizRec(rec);
    if (profileId) persistBusiness(profileId, rec);
    setServePreset(null);
    setBrewingOrder(null);
    setDayLabel(null);
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
    recordAction('stage', `${outcome.stage.id} → ${next.current_stage || '收工'}`);
    setSave(next);
    setOutcome(null);
    setServedStage(null);
    setView(next.current_stage ? 'stage' : 'settlement');
  }

  /**
   * 出杯（M8 结果 → 存档）。两条路：从营业页进来赌那一单按订单判星级（M3.5），
   * 其余（吧台随手一杯、配方墙按配方来一杯）按主线记满意度（M8.2）。
   * 判定在进这里之前就做完了（手势/静态题的评级 = `grade`，题面与提示由 `params` 派生，
   * 见 `BrewInteraction`）；到这一步 `params` 只用于配方墙的「刚做的那杯」草稿。
   */
  function serve(drink: Drink, beanId: string, grade: BrewGrade, params: BrewParams) {
    if (!save) return;
    const current = bizRec;
    const order = brewingOrder;
    const pending =
      order && current && current.phase === 'serving' && current.orders[current.served]?.id === order.id ? order : undefined;
    const bean = beans.find((b) => b.id === beanId) ?? (beanId === EMERGENCY_BEAN.id ? EMERGENCY_BEAN : undefined);

    if (pending && current && bean) {
      const rated = rateOrder(pending, drink, bean, grade);
      if (!rated.ok) {
        setToast(rated.reason);
        return;
      }
      const { save: next, ok, reason } = serveDrink(save, drink, beanId, {
        eco,
        incomeOverride: rated.income,
        // 一位客人耗 1 点精力（M3.3）：精力见底就当日收工，余下的客人「改天再来」
        extraEffects: { ...rated.extraEffects, energy: (rated.extraEffects.energy ?? 0) - 1 },
      });
      if (!ok) {
        setToast(reason);
        return;
      }
      const rec = applyServe(current, { stars: rated.stars, income: rated.income, beanId, energyLeft: next.energy });
      setSave(next);
      setBizRec(rec);
      persistBusiness(profileId, rec);
      setLastBrew({ beanId, drinkId: drink.id, params });
      setServePreset(null);
      setBrewingOrder(null);
      setView('business');
      recordAction('business', `${pending.guestName} ${drink.name} ${rated.stars}★`);
      setToast([`${rated.stars}★`, ...rated.lines].join(' · '));
      return;
    }

    const { save: next, ok, reason } = serveDrink(save, drink, beanId, {
      eco,
      extraEffects: { satisfaction_today: GRADE_SATISFACTION[grade] },
    });
    if (ok) {
      setSave(next);
      setServedStage(save.current_stage);
      setLastBrew({ beanId, drinkId: drink.id, params });
      // 豆种图鉴（M3.8）：主线出杯也记一笔，与营业日共用同一份 usedBeans
      const rec = recordUsedBean(bizRec ?? freshRecord(), beanId);
      setBizRec(rec);
      if (profileId) persistBusiness(profileId, rec);
      recordAction('serve', `${drink.name}·${beanId}·${grade}`);
    }
    setToast(reason);
  }

  function purchase(id: UpgradeId) {
    if (!save) return;
    const { save: next, ok, reason } = buyUpgrade(save, id, eco);
    if (ok) {
      setSave(next);
      recordAction('upgrade', id);
    }
    setToast(reason);
  }

  /** 进一袋豆（M1.2）：进货屏与吧台空态两个入口都走它 */
  function purchaseBean(beanId: string) {
    if (!save) return;
    const { save: next, ok, reason } = buyBean(save, beanId, eco);
    if (ok) {
      setSave(next);
      recordAction('buy', beanId);
    }
    setToast(reason);
  }

  /** 宽松模式开关（M2.5 / U16）：体验期设置，随时可关，不写入存档 */
  function toggleRelaxed() {
    const next = withRelaxedEconomy(settings, !settings.relaxedEconomy);
    setSettings(next);
    saveSettings(next);
    setToast(next.relaxedEconomy ? '宽松模式开着：体验期设置，随时可关。' : '宽松模式关掉了：现金按真实收支算。');
  }

  /** 开门：日计划这一刻固化并落盘（M3.2），同一天怎么玩都一致 */
  function openBusinessDay() {
    if (!save || !profileId) return;
    const planned = planDay(bizRec ?? freshRecord(), save);
    setBizRec(planned);
    persistBusiness(profileId, planned);
    recordAction('business', `第 ${planned.day} 天开门`);
    setToast(`第 ${planned.day} 天：${planned.orders.length} 位客人。`);
  }

  /** 营业页「做这一杯」：带上订单想去吧台，出杯后按订单判星级 */
  function brewForOrder(order: Order) {
    setServePreset({ drinkId: order.drinkId });
    setBrewingOrder(order);
    setToast('');
    setView('serve');
  }

  /** 营业页收工：记一条流水，交给结算页（U10） */
  function settleBusinessDay() {
    if (!bizRec) return;
    setDayLabel(`营业第 ${bizRec.day} 天`);
    recordAction('business', `第 ${bizRec.day} 天收工`);
    setToast('');
    setView('settlement');
  }

  function finishDay() {
    if (!save) return;
    if (dayLabel) {
      // 自由营业收工（M3.7）：翻到下一日，不碰剧情标记
      if (bizRec && profileId) {
        const rec = nextDay(bizRec);
        setBizRec(rec);
        persistBusiness(profileId, rec);
      }
      setSave(closeDay(save));
      setDayLabel(null);
      setToast('新的一天，店门重新打开。');
      setView('business');
      return;
    }
    // 收工时给当前章节打通关标记，章节号从存档取，不写死第一章
    const cleared = `${save.current_chapter.replace('-', '_')}_cleared`;
    setSave({ ...closeDay(save), flags: { ...save.flags, [cleared]: true } });
    setToast('新的一天，店门重新打开。');
    setView('cafe');
  }

  /** 导出这一档的存档码（M5.2）：存档 + 营业档案一起带走 */
  function exportCode(id: string) {
    const s = loadSave(id);
    if (!s) return '';
    const profile = listProfiles().find((p) => p.id === id);
    recordAction('share', `导出 ${profile?.name ?? id}`);
    return buildSaveCode(s, profile?.name ?? s.player_name, loadBusiness(id));
  }

  /** 导入存档码（M5.3）：永远新建档位，不覆盖现有的 */
  function importProfile(planned: { name: string; save: PlayerSave; business: BusinessRecord | null }) {
    const created = createProfile(planned.name);
    persistSave(created.id, planned.save);
    if (planned.business) persistBusiness(created.id, planned.business);
    recordAction('share', `导入 ${planned.name}`);
    open(created.id);
    setToast(`「${planned.name}」已经导入，接着往下玩。`);
  }

  /** 收录一条配方：面板先过一遍好即时反馈，落库仍以这里的校验为单源 */
  function addDraft(draft: RecipeDraft) {
    const checked = validateRecipe(draft);
    if (!checked.ok) {
      setToast(checked.reason);
      return;
    }
    const added = addRecipe(recipes, checked.recipe);
    if (!added.ok) {
      setToast(added.reason);
      return;
    }
    persistRecipes(added.list);
    setRecipes(added.list);
    setToast(`「${checked.recipe.name}」收进配方墙了。`);
  }

  function removeOne(id: string) {
    const list = removeRecipe(recipes, id);
    persistRecipes(list);
    setRecipes(list);
  }

  /** 提交一条反馈（M6.4）：快照在提交这一刻现做，时间就是本地时钟 */
  function submitFeedback(kind: FeedbackKind, text: string) {
    const item = makeFeedback(kind, describeOf(text), text);
    setFeedbackList(persistFeedback([item, ...feedbackList]));
  }

  /** 反馈快照的现场（M6.3）：没开局的字段一律 null / 空 */
  function snapshotInput(): SnapshotInput {
    return {
      now: Date.now(),
      ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      language: typeof navigator !== 'undefined' ? navigator.language : '',
      screen: typeof window !== 'undefined' ? `${window.innerWidth}×${window.innerHeight}` : '',
      profileName: save?.player_name ?? null,
      chapter: save?.current_chapter ?? null,
      stageId: stage?.id ?? null,
      stageTitle: stage?.title ?? null,
      completedStages: save?.completed_stages.length ?? 0,
      totalStages: stages.length,
      money: save?.money ?? null,
      energy: save?.energy ?? null,
      reputation: save?.reputation ?? null,
      satisfactionToday: save?.satisfaction_today ?? null,
      inventory: save
        ? beans
            .filter((b) => (save.inventory[b.id] ?? 0) > 0)
            .map((b) => ({ beanId: b.id, name: b.name, portions: save.inventory[b.id] }))
        : [],
      businessDay: bizRec?.day ?? null,
      recipeCount: recipes.length,
      recentActions: recentActions(),
      lastError: lastErrorOf(),
    };
  }

  /** 配方墙「按这配方来一杯」（M7.5）：参数带进吧台预设，判定照走，不占营业订单 */
  function brewWithRecipe(recipe: Recipe) {
    setBrewingOrder(null);
    setServePreset({
      drinkId: recipe.drinkId,
      beanId: recipe.beanId || undefined,
      params: recipe.params,
    });
    setToast(`按「${recipe.name}」来一杯。`);
    setView('serve');
  }

  /** 去另一屏并记住回程：进货屏从店务栏 / 仓库 / 吧台 / 营业页四处都能进（U6） */
  function openDesk(to: View, back: View) {
    setToast('');
    setPurchaseBack(back);
    setView(to);
  }

  return (
    <div className="app">
      <ArtDefs />
      {/* 顶栏 + 更新条 + 提示条同容器吸顶（U18）：提示条的位置由结构保证，不再靠顶栏高度魔数 */}
      <div className="topbar-sticky">
        <header className="topbar">
          <button className="brand" onClick={() => setView(save ? 'cafe' : 'home')}>余温咖啡馆</button>
          {save && (
            <ul className="stats">
              {numericLabels.map(({ key, label, max }) => (
                <li key={key} className={max ? 'gauge' : 'counter'}>
                  <span>{label}</span>
                  <strong>
                    {/* 现金位在宽松模式显示 ∞（U2 / M2.4） */}
                    {key === 'money' ? displayMoney(save, unlimited) : save[key]}
                    {max ? <em>/{max}</em> : null}
                  </strong>
                  {max ? (
                    <span className={`bar ${key}`}>
                      <i style={{ width: `${Math.min(100, Math.round((save[key] / max) * 100))}%` }} />
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {/* 反馈入口（U1）：无档也能点，任意界面一下就到 */}
          <button className="ghost" onClick={() => setShowFeedback(true)}>反馈</button>
          {save && (
            <button className="who" onClick={switchProfile} title="回到存档列表，换一个人玩">
              {save.player_name} · 换档
            </button>
          )}
          {/* 目录栏（U17 / M9.1）：深屏一下回首页 / 店内；无档时也留着「首页」签 */}
          <NavMenu
            view={view}
            hasSave={!!save}
            onGo={(to) => {
              setToast('');
              if (to === 'home') switchProfile();
              else setView('cafe');
            }}
          />
        </header>

        {/* 新版本就绪（U14）：点一下让 waiting 的 SW 接管，接管完自动刷新 */}
        {updateReady && (
          <button className="updatebar" onClick={() => applyPwaUpdate()}>有新版本，点这里更新</button>
        )}

        {toast && <p className="toast" role="status">{toast}</p>}
      </div>

      {/* key 让每次换场重放入场动效；scene-* 决定这一屏的环境色 */}
      <main className={`content scene-${view}`} key={`${view}${outcome ? '-result' : ''}`}>
        {/* 这一屏的场景横幅。图缺了就不渲染，页面退回纯手绘 */}
        {sceneImage(view) && <img className="scene-band" src={sceneImage(view)} alt="" aria-hidden="true" />}
        <ViewDetail view={view} />
        {view === 'home' && (
          <Home
            onOpen={open}
            onCreate={newProfile}
            onDelete={removeProfile}
            onExport={exportCode}
            onImport={importProfile}
            onArchive={() => setView('archive')}
          />
        )}
        {view === 'cafe' && save && (
          <Cafe
            save={save}
            stage={stage}
            unlocked={isStoryComplete(save)}
            unlimited={unlimited}
            onGo={(v) => { setToast(''); setView(v); }}
            onPurchase={() => openDesk('purchase', 'cafe')}
            onRecipes={() => { setToast(''); setView('recipes'); }}
            onToggleRelaxed={toggleRelaxed}
            onFeedback={() => setShowFeedback(true)}
          />
        )}
        {view === 'map' && save && <ChapterMap save={save} />}
        {view === 'storage' && save && <Storage save={save} onPurchase={() => openDesk('purchase', 'storage')} />}
        {view === 'clues' && save && <Clues save={save} />}
        {view === 'upgrade' && save && <Upgrades save={save} unlimited={unlimited} onBuy={purchase} />}
        {view === 'archive' && <Archive save={save} />}
        {view === 'settlement' && save && (
          <Settlement save={save} unlimited={unlimited} dayLabel={dayLabel} onFinish={finishDay} onRestart={restart} />
        )}
        {view === 'serve' && save && (
          <ServeDesk
            save={save}
            preset={servePreset ?? undefined}
            onServe={serve}
            onGoPurchase={() => openDesk('purchase', 'serve')}
            onCancel={
              servePreset || brewingOrder
                ? () => {
                    setToast('');
                    setServePreset(null);
                    setBrewingOrder(null);
                    setView('cafe');
                  }
                : undefined
            }
          />
        )}
        {view === 'purchase' && save && (
          <Purchase
            save={save}
            unlimited={unlimited}
            onBuy={purchaseBean}
            onBack={() => { setToast(''); setView(purchaseBack); }}
          />
        )}
        {view === 'business' && save && (
          <BusinessView
            save={save}
            rec={bizRec ?? freshRecord()}
            onStartDay={openBusinessDay}
            onBrew={brewForOrder}
            onSettle={settleBusinessDay}
            onGoPurchase={() => openDesk('purchase', 'business')}
            onBack={() => setView('cafe')}
          />
        )}
        {view === 'recipes' && (
          <RecipesPanel
            recipes={recipes}
            lastBrew={lastBrew}
            onAdd={addDraft}
            onRemove={removeOne}
            onBrewWith={brewWithRecipe}
            onBack={() => setView('cafe')}
          />
        )}
        {view === 'stage' && stage && save && !outcome && (
          <StageView
            stage={stage}
            save={save}
            served={servedStage === stage.id}
            onServe={serve}
            onGoPurchase={() => openDesk('purchase', 'stage')}
            onChoose={choose}
          />
        )}
        {view === 'stage' && outcome && <Result outcome={outcome} onNext={advance} />}
        {view === 'stage' && !stage && (
          // 末关之后的落点（设计 §1 M3.1）：不再摆「等新章节」的死文案，直接把人送去自由营业
          <section className="panel">
            <p className="empty">故事走完了，店还开着。</p>
            <div className="actions">
              <button className="primary" onClick={() => setView('business')}>开门营业</button>
              <button onClick={() => setView('cafe')}>回到店里</button>
            </div>
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

      {/* 反馈面板（U13）：盖在整屏之上，关上就回到原来的位置 */}
      {showFeedback && (
        <div className="overlay">
          <FeedbackPanel
            snapshotInput={snapshotInput()}
            items={feedbackList}
            onSubmit={submitFeedback}
            onClose={() => setShowFeedback(false)}
          />
        </div>
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
  onExport,
  onImport,
  onArchive,
}: {
  onOpen: (id: string) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => string;
  onImport: (planned: { name: string; save: PlayerSave; business: BusinessRecord | null }) => void;
  onArchive: () => void;
}) {
  const [name, setName] = useState('');
  /** 删档要二次确认，记住待确认的是哪一个 */
  const [confirming, setConfirming] = useState('');
  /** 导出：码只算一次摆出来，复制 / 分享 / 下载都读它（U12） */
  const [exported, setExported] = useState<{ name: string; code: string } | null>(null);
  /** 导入：粘贴的码与预览结果，确认了才建档（U12） */
  const [importCode, setImportCode] = useState('');
  const [preview, setPreview] = useState<
    { ok: true; name: string; save: PlayerSave; business: BusinessRecord | null } | { ok: false; reason: string } | null
  >(null);
  const [notice, setNotice] = useState('');
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
                {/* 档位行文案（U11）：未通关报章节与进度，通关后改报自由营业天数 */}
                <span>{s ? profileProgressLabel(s, loadBusiness(p.id)?.day) : '存档读不出来'}</span>
              </button>
              <button
                className="slot-export"
                disabled={!s}
                onClick={() => {
                  if (!s) return;
                  setExported({ name: p.name, code: onExport(p.id) });
                  setNotice('');
                }}
              >
                导出
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

      {/* 导出（M5.2）：码就在页面上，复制 / 分享 / 存文件三条路都给（U12） */}
      {exported && (
        <div className="exportbox">
          <p className="crumb">「{exported.name}」的存档码</p>
          <textarea readOnly rows={4} value={exported.code} aria-label="存档码" />
          <div className="actions">
            <button
              className="primary"
              onClick={async () => {
                setNotice((await copyText(exported.code)) ? '码已经复制走了。' : '这台设备不让自动复制，手动选中再拷吧。');
              }}
            >
              复制
            </button>
            <button
              onClick={async () => {
                const r = await shareText('余温咖啡馆·存档码', exported.code);
                setNotice(r === 'shared' ? '已经发出去了。' : r === 'copied' ? '这台设备没有系统分享，已经换成复制。' : '没分享成，试试复制或下载。');
              }}
            >
              分享
            </button>
            <button onClick={() => { downloadText(`${exported.name}-存档码.txt`, exported.code); setNotice('存成文件了。'); }}>存成文件</button>
            <button onClick={() => { setExported(null); setNotice(''); }}>收起来</button>
          </div>
        </div>
      )}

      {/* 导入（M5.3）：粘贴 → 预览 → 确认，永远新建档，不覆盖现有存档（U12） */}
      <p className="crumb">导入存档码</p>
      <div className="importbox">
        <textarea
          rows={3}
          value={importCode}
          placeholder="把存档码整段粘在这里"
          aria-label="导入的存档码"
          onChange={(e) => {
            setImportCode(e.target.value);
            setPreview(null);
            setNotice('');
          }}
        />
        <div className="actions">
          <button
            disabled={!importCode.trim()}
            onClick={() => setPreview(planImport(importCode, profiles.map((p) => p.name)))}
          >
            先看一眼
          </button>
        </div>
        {preview &&
          (preview.ok ? (
            <div className="preview">
              <p className="crumb">码里是这些</p>
              <p>
                名字 <strong>{preview.name}</strong> · {profileProgressLabel(preview.save, preview.business?.day)}
              </p>
              {/* 未通关的码也带着营业档案（主线出杯会建一份），营业天数单独报一行（M5.3） */}
              {preview.business && !isStoryComplete(preview.save) && (
                <p className="meta">带着营业档案：第 {preview.business.day} 天</p>
              )}
              <div className="actions">
                <button
                  className="primary"
                  onClick={() => {
                    onImport(preview);
                    setImportCode('');
                    setPreview(null);
                  }}
                >
                  就用这个，开一份
                </button>
                <button onClick={() => { setPreview(null); setNotice('那就先放着。'); }}>算了</button>
              </div>
            </div>
          ) : (
            <p className="recovery">这个码读不出来：{preview.reason}</p>
          ))}
        {notice && <p className="meta">{notice}</p>}
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

function Cafe({
  save,
  stage,
  unlocked,
  unlimited,
  onGo,
  onPurchase,
  onRecipes,
  onToggleRelaxed,
  onFeedback,
}: {
  save: PlayerSave;
  stage?: Stage;
  unlocked: boolean;
  unlimited: boolean;
  onGo: (v: View) => void;
  onPurchase: () => void;
  onRecipes: () => void;
  onToggleRelaxed: () => void;
  onFeedback: () => void;
}) {
  return (
    <section className="panel">
      <p className="crumb">{save.current_chapter}</p>

      {/* 店里的那一格画面：墙上、吧台上都有各自的生活痕迹 */}
      <CafeScene />

      <h2>店里</h2>
      <p className="goal">{stage ? `今日目标：${stage.goal}` : '今天的活儿干完了，去后门看看章节地图。'}</p>

      <div className="zones">
        {ZONES.map((z) => {
          // 门店要通关才开（U4）：没通关就禁用，理由直接写在原位
          const locked = z.view === 'business' && !unlocked;
          return (
            <button key={z.name} disabled={locked} onClick={() => onGo(z.view)}>
              <ZoneArt kind={z.view} />
              <strong>{z.name}</strong>
              <span>{locked ? '走完第五章开门营业' : z.hint}</span>
            </button>
          );
        })}
      </div>

      {/* 店务栏（U3）：进货 / 配方墙 / 宽松模式 / 反馈，四个入口一屏内可达 */}
      <p className="crumb">店务</p>
      <div className="deskbar">
        <button onClick={onPurchase}>进货</button>
        <button onClick={onRecipes}>配方墙</button>
        <button
          role="switch"
          aria-checked={unlimited}
          className={unlimited ? 'primary' : ''}
          onClick={onToggleRelaxed}
        >
          宽松模式{unlimited ? '：开' : '：关'}
        </button>
        <button onClick={onFeedback}>反馈</button>
      </div>
      <p className="meta">宽松模式是体验期设置，随时可关；开着的时候花钱不掉现金，流水照记。</p>

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

function Storage({ save, onPurchase }: { save: PlayerSave; onPurchase: () => void }) {
  const owned = beans.filter((b) => (save.inventory[b.id] ?? 0) > 0);
  // 库存里出现过的处理法，各配一张晒床/水槽的图，让仓库这屏不只是列表
  const processes = [...new Set(owned.map((b) => b.process))].filter((p) => PROCESS_ART[p]);
  return (
    <section className="panel">
      <h2>仓库</h2>
      {/* 进货入口（U6）：仓库是玩家发现「空了」的地方，出路就摆在这里 */}
      <div className="actions">
        <button className="primary" onClick={onPurchase}>去进货</button>
      </div>
      {owned.length === 0 && (
        <p className="empty">豆子见底了。吧台还有店里常备的应急豆——先出杯攒钱，再来进一整袋。</p>
      )}

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

function Upgrades({ save, unlimited, onBuy }: { save: PlayerSave; unlimited: boolean; onBuy: (id: UpgradeId) => void }) {
  return (
    <section className="panel">
      <h2>菜单黑板</h2>
      <p className="meta">现金 {displayMoney(save, unlimited)}。升级一次性生效，买不起会明确告诉你还差多少。</p>
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
function StageView({
  stage,
  save,
  served,
  onServe,
  onGoPurchase,
  onChoose,
}: {
  stage: Stage;
  save: PlayerSave;
  served: boolean;
  onServe: (drink: Drink, beanId: string, grade: BrewGrade, params: BrewParams) => void;
  onGoPurchase: () => void;
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

      {/* 客人关的吧台：嵌在关卡里，没豆子时同样亮应急豆与进货口（U5） */}
      {needsCup && !served && <ServeDesk save={save} embedded onServe={onServe} onGoPurchase={onGoPurchase} />}

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

function Settlement({
  save,
  unlimited,
  dayLabel,
  onFinish,
  onRestart,
}: {
  save: PlayerSave;
  unlimited: boolean;
  dayLabel: string | null;
  onFinish: () => void;
  onRestart: () => void;
}) {
  const t = save.today;
  const net = t.revenue - t.cost;
  const cups = Object.entries(t.drinks_served ?? {}).filter(([, n]) => n > 0);
  const rows: [string, string][] = [
    ['今日收入', String(t.revenue)],
    ['原料成本', String(t.cost)],
    ['净收益', String(net)],
    ['当前现金', displayMoney(save, unlimited)],
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
      {/* 营业日结算多一行天数（U10）；主线结算不传就保持原样 */}
      {dayLabel && <p className="crumb">{dayLabel}</p>}
      <ul className="ledger">
        {rows.map(([k, v]) => (
          <li key={k}><span>{k}</span><strong>{v}</strong></li>
        ))}
      </ul>
      <p className="meta">
        {dayLabel
          ? '今天的账记在这里。明天店门照常开，客人还会来。'
          : '下一章内容由剧情轨道产出后会自动接上，界面代码无需改动。'}
      </p>
      <div className="actions">
        <button className="primary" onClick={onFinish}>收工，明天见</button>
        <button onClick={onRestart}>清档重来</button>
      </div>
    </section>
  );
}
