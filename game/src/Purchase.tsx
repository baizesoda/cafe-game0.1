/* 进货屏（M1.2 / U6）：列全部豆子、按进价排序、买不起的标注差额。
 * 顶部一行说清「现在能出杯的豆有几支」，为 0 时点到应急豆。
 */
import type { PlayerSave } from '../../contracts/types';
import stateKeys from '../../contracts/state-keys.json';
import { beans } from './data/loader';
import { availableDrinks, brewableWith, displayMoney } from './state';

const PORTIONS_PER_BAG = stateKeys.economy.bean_portions_per_bag;

export default function Purchase({
  save,
  unlimited,
  onBuy,
  onBack,
}: {
  save: PlayerSave;
  unlimited: boolean;
  onBuy: (beanId: string) => void;
  onBack: () => void;
}) {
  const menu = availableDrinks(save);
  const sorted = [...beans].sort((a, b) => a.purchase_price - b.purchase_price);
  const brewableNow = beans.filter((b) => (save.inventory[b.id] ?? 0) > 0 && brewableWith(save, b).length > 0).length;

  return (
    <section className="panel">
      <h2>进货</h2>
      <p className="meta">
        现金 {displayMoney(save, unlimited)}。一袋 {PORTIONS_PER_BAG} 份，买回来就能在吧台出杯。
      </p>
      <p className={brewableNow > 0 ? 'meta' : 'recovery'}>
        现在能出杯的豆：{brewableNow} 支
        {brewableNow === 0 ? '——柜子空了，吧台还有应急豆可用，先出杯攒钱。' : ''}
      </p>

      <ul className="beanlist buy">
        {sorted.map((b) => {
          const stock = save.inventory[b.id] ?? 0;
          const makes = menu.filter((d) => b.usable_drinks.includes(d.id));
          const short = unlimited ? 0 : b.purchase_price - save.money;
          return (
            <li key={b.id}>
              <strong>{b.name}</strong>
              <span className="meta">
                {b.origin} · {b.process} · {b.roast_level} · {b.flavor_tags.join('／') || '没有标注风味'}
              </span>
              <span className="meta">
                这袋能出：{makes.length ? makes.map((d) => d.name).join('、') : '菜单上暂时没有它能做的饮品'}
              </span>
              <span className="count">
                {b.purchase_price} / 袋{stock > 0 ? `（剩 ${stock} 份）` : ''}
              </span>
              <button className="primary" disabled={short > 0} onClick={() => onBuy(b.id)}>
                {short > 0 ? `还差 ${short}` : '进货'}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="actions">
        <button onClick={onBack}>回到店里</button>
      </div>
    </section>
  );
}
