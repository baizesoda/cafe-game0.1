/* 吧台：选豆 → 选饮品 → 冲煮交互 → 出杯（自 App.tsx 迁出，并接上应急豆与配方预设）。
 * 只列有库存的豆子；一杯都出不了时亮出应急豆（M1.3），不留死胡同。
 */
import { useState } from 'react';
import type { Drink, PlayerSave } from '../../contracts/types';
import { type BrewGrade, type BrewParams, deriveBrewParams } from './brew';
import BrewInteraction from './BrewInteraction';
import { beans } from './data/loader';
import { drinkImage } from './pictures';
import { EMERGENCY_BEAN, availableDrinks, brewableWith, canBrewAnything } from './state';

/** 「按这配方来一杯」传进来的预设（M7.5）：饮品必填，豆与参数可选。 */
export interface ServePreset {
  drinkId: string;
  beanId?: string;
  params?: Partial<BrewParams>;
}

export default function ServeDesk({
  save,
  onServe,
  preset,
  embedded,
  onGoPurchase,
  onCancel,
}: {
  save: PlayerSave;
  onServe: (drink: Drink, beanId: string, grade: BrewGrade, params: BrewParams) => void;
  preset?: ServePreset;
  embedded?: boolean;
  onGoPurchase: () => void;
  onCancel?: () => void;
}) {
  const owned = beans.filter((b) => (save.inventory[b.id] ?? 0) > 0);
  // 有豆能出杯时不给应急提示（案例表：有豆时不该出现）
  const emergency = !canBrewAnything(save);
  const choices = emergency ? [...owned, EMERGENCY_BEAN] : owned;

  const [picked, setPicked] = useState('');
  const presetBean = preset?.beanId && choices.some((b) => b.id === preset.beanId) ? preset.beanId : '';
  const beanId = choices.some((b) => b.id === picked) ? picked : presetBean || (choices[0]?.id ?? '');
  const bean = choices.find((b) => b.id === beanId);

  const options = bean ? brewableWith(save, bean) : [];
  const presetDrink = preset ? options.find((d) => d.id === preset.drinkId) : undefined;

  /** 配方指定的豆不在仓库里：提示一行，落回任意能用的豆，不阻塞（M7.5）。 */
  const missingPresetBean =
    preset?.beanId && !choices.some((b) => b.id === preset.beanId)
      ? (beans.find((b) => b.id === preset.beanId)?.name ?? preset.beanId)
      : '';

  const [step, setStep] = useState<'pick' | 'brew'>(presetDrink ? 'brew' : 'pick');
  const [activeId, setActiveId] = useState(presetDrink?.id ?? '');
  // 预设参数只对它自己那款饮品生效（同参数 ⇒ 同判定，M8.1）
  const active = options.find((d) => d.id === activeId);
  const params = active && bean ? deriveBrewParams(bean, active, active.id === preset?.drinkId ? preset?.params : undefined) : null;
  const menuSize = availableDrinks(save).length;

  const head = (
    <>
      {!embedded && <h2>吧台</h2>}
      <p className="meta">菜单上有 {menuSize} 款饮品。先选豆，再选要做的那杯。</p>
      {missingPresetBean && (
        <p className="recovery">配方指定的「{missingPresetBean}」不在仓库里，先拿手边的豆做这一杯。</p>
      )}
    </>
  );

  if (!bean) {
    const empty = (
      <>
        {head}
        <p className="empty">仓库里什么也没有，也没亮出可用的豆子。</p>
      </>
    );
    return embedded ? <div className="servedesk">{empty}</div> : <section className="panel">{empty}</section>;
  }

  if (step === 'brew' && active && params) {
    return embedded ? (
      <div className="servedesk">
        {head}
        <BrewInteraction
          bean={bean}
          drink={active}
          params={params}
          onDone={(grade) => onServe(active, bean.id, grade, params)}
          onCancel={() => setStep('pick')}
        />
      </div>
    ) : (
      <section className="panel">
        {head}
        <BrewInteraction
          bean={bean}
          drink={active}
          params={params}
          onDone={(grade) => onServe(active, bean.id, grade, params)}
          onCancel={() => setStep('pick')}
        />
      </section>
    );
  }

  const body = (
    <>
      {head}

      {emergency && (
        <div className="emergency">
          <strong>应急豆</strong>
          <span className="meta">
            店里常备的最后一小袋——成本 0、份数不限，先把客人这一杯端上，攒够钱再进一整袋。
          </span>
        </div>
      )}

      <p className="crumb">选豆</p>
      <div className="choices">
        {choices.map((b) => (
          <button
            key={b.id}
            className={b.id === beanId ? 'primary' : ''}
            onClick={() => {
              setPicked(b.id);
              setStep('pick');
              setActiveId('');
            }}
          >
            {b.id === EMERGENCY_BEAN.id
              ? `${b.name}（无限份 · 成本 0）`
              : `${b.name}（剩 ${save.inventory[b.id]} 份 · 进价 ${b.purchase_price}）`}
          </button>
        ))}
      </div>

      <p className="crumb">选饮品</p>
      {options.length === 0 ? (
        <p className="empty">{bean.name}现在做不出东西：菜单上没有它能做的饮品，或者库存不够一杯的用量。</p>
      ) : (
        <div className="drinkcards">
          {options.map((d) => (
            <button
              key={d.id}
              className={`drinkcard ${preset?.drinkId === d.id ? 'primary' : ''}`}
              onClick={() => {
                setActiveId(d.id);
                setStep('brew');
              }}
            >
              {drinkImage(d.id) && <img src={drinkImage(d.id)} alt="" aria-hidden="true" />}
              <strong>{d.name}</strong>
              <span className="meta">{d.method} · 卖 {d.price} · 用 {d.bean_cost} 份 · {d.speed}</span>
            </button>
          ))}
        </div>
      )}

      <p className="meta">{bean.name}：{bean.origin} · {bean.roast_level} · {bean.flavor_tags.join('／') || '没有标注风味'}</p>

      {emergency && (
        <div className="actions">
          <button className="primary" onClick={onGoPurchase}>去进货</button>
        </div>
      )}
      {onCancel && (
        <div className="actions">
          <button onClick={onCancel}>先回店里</button>
        </div>
      )}
    </>
  );

  return embedded ? <div className="servedesk">{body}</div> : <section className="panel">{body}</section>;
}
