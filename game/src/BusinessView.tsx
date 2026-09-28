/* 自由营业页（M3 / U9）：开门 → 一单一单做 → 收工结算。
 * 页面只读档案、只发事件，生成与判定都在 business.ts 里，所以同一份档案怎么显示都一样。
 */
import type { PlayerSave } from '../../contracts/types';
import { type BusinessRecord, type Order, dayGuestCount } from './business';
import { beans, characters, drinks } from './data/loader';

const nameOf = (id: string) => characters.find((c) => c.id === id)?.name ?? id;

export default function BusinessView({
  save,
  rec,
  onStartDay,
  onBrew,
  onSettle,
  onGoPurchase,
  onBack,
}: {
  save: PlayerSave;
  rec: BusinessRecord;
  onStartDay: () => void;
  onBrew: (order: Order) => void;
  onSettle: () => void;
  onGoPurchase: () => void;
  onBack: () => void;
}) {
  const order: Order | undefined = rec.orders[rec.served];
  const drink = order ? drinks.find((d) => d.id === order.drinkId) : undefined;

  const regulars = Object.entries(save.trust)
    .filter(([, v]) => v > 0)
    .map(([id, v]) => `${nameOf(id)} ${v}`);
  const seen = Object.keys(rec.usedBeans).filter((id) => beans.some((b) => b.id === id));
  const seenNames = seen.map((id) => beans.find((b) => b.id === id)?.name ?? id);

  const stats = (
    <ul className="bizstats">
      <li>
        <strong>今日 {rec.served}／{rec.orders.length} 单</strong>
      </li>
      <li>精力 {save.energy}</li>
      <li>口碑 {save.reputation}</li>
      <li>熟客：{regulars.length ? regulars.join(' · ') : '还没有人熟起来'}</li>
      <li>
        豆种图鉴：{seen.length}／{beans.length} 支
        {seenNames.length ? `（${seenNames.slice(0, 5).join('、')}${seenNames.length > 5 ? '…' : ''}）` : ''}
      </li>
    </ul>
  );

  return (
    <section className="panel">
      <h2>营业第 {rec.day} 天</h2>
      {stats}

      {rec.phase === 'open' && (
        <>
          <p className="meta">
            今天预备 {dayGuestCount(save.reputation)} 位客人。看一眼柜子再开门。
          </p>
          <div className="actions">
            <button className="primary" onClick={onStartDay}>开门营业</button>
            <button onClick={onGoPurchase}>去进货</button>
          </div>
        </>
      )}

      {rec.phase === 'serving' && order && (
        <>
          <div className="ordercard">
            <strong>{order.guestName}</strong>
            <span className="meta">想喝：{drink?.name ?? order.drinkId}</span>
            <span className="meta">
              偏好：{order.preferTags.length ? order.preferTags.join('、') : '随你发挥'}
            </span>
            <span className="meta">
              依据：客人来自身份卡，偏好标签取自带这些风味、又能做{drink?.name ?? '这杯'}的豆
            </span>
          </div>
          <div className="actions">
            <button className="primary" onClick={() => onBrew(order)}>做这一杯</button>
            <button onClick={onGoPurchase}>去进货</button>
          </div>
        </>
      )}

      {rec.phase === 'serving' && !order && (
        <div className="actions">
          <button className="primary" onClick={onSettle}>今天的客人做完了，收工</button>
        </div>
      )}

      {rec.phase === 'settled' && (
        <>
          <p className="meta">
            招待 {rec.served} 位 · 进账 {rec.income}
            {rec.stars.length ? ` · ${rec.stars.map((s) => '★'.repeat(s)).join(' ')}` : ''}
          </p>
          <div className="actions">
            <button className="primary" onClick={onSettle}>收工，看看今天怎么样</button>
          </div>
        </>
      )}

      <div className="actions">
        <button onClick={onBack}>回店里</button>
      </div>
    </section>
  );
}
