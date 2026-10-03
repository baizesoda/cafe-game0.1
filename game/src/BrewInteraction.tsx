/* 冲煮交互（M8 / U7 / U8）：参数提示行 + 进度条 + 按住或点按手势。
 * 不出「硬失败」：超时或没动手都自动取值出杯，组件只把评级交回去，不扣任何资源。
 */
import { useEffect, useRef, useState } from 'react';
import type { CoffeeBean, Drink } from '../../contracts/types';
import {
  AUTO_VALUE,
  type BrewGrade,
  type BrewParams,
  gradeOverall,
  gradeRound,
  interactionFor,
  staticQuiz,
  staticQuizChoices,
} from './brew';

/** U8：系统要求减少动效、或设备压根没有指针能力时，切静态三选一。 */
function prefersStatic(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.matchMedia('(pointer: none)').matches;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export default function BrewInteraction({
  bean,
  drink,
  params,
  onDone,
  onCancel,
}: {
  bean: CoffeeBean;
  drink: Drink;
  params: BrewParams;
  onDone: (grade: BrewGrade) => void;
  onCancel: () => void;
}) {
  const spec = interactionFor(drink.method);
  const [reduced] = useState(prefersStatic);
  const [round, setRound] = useState(0);
  const fillRef = useRef<HTMLSpanElement | null>(null);
  const [pressed, setPressed] = useState(false);
  const [marks, setMarks] = useState<BrewGrade[]>([]);
  const [pick, setPick] = useState<0 | 1 | 2 | null>(null);

  const startRef = useRef(0);
  const rafRef = useRef(0);
  const settledRef = useRef(true);
  const roundRef = useRef(0);

  const result: BrewGrade | null = reduced
    ? pick === null
      ? null
      : staticQuiz(params, pick)
    : marks.length >= spec.rounds
      ? gradeOverall(marks)
      : null;

  /** 一轮结束：记成绩，没到最后一轮就换下一轮。 */
  function settleRound(v: number, index: number) {
    if (roundRef.current !== index) return;
    settledRef.current = true;
    cancelAnimationFrame(rafRef.current);
    setPressed(false);
    if (fillRef.current) fillRef.current.style.width = `${clamp01(v) * 100}%`;
    setMarks((prev) => [...prev, gradeRound(v, spec.band)]);
    roundRef.current = index + 1;
    setRound(index + 1);
  }

  // 每轮都挂一个超时：到点就按 AUTO_VALUE 收，保证不动手也能出杯
  useEffect(() => {
    if (reduced || result !== null) return;
    const index = round;
    const timer = window.setTimeout(() => settleRound(AUTO_VALUE, index), spec.timeoutMs);
    return () => window.clearTimeout(timer);
    // settleRound 只读 ref 与 spec，所以随 round 重挂即可
  }, [round, reduced, spec.timeoutMs, result]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  /** 按住 / 点按：从按下开始计时，松手时的时长就是这一轮的读数。 */
  function pressStart() {
    if (reduced || result !== null || !settledRef.current) return;
    settledRef.current = false;
    startRef.current = performance.now();
    setPressed(true);
    const tick = () => {
      const v = (performance.now() - startRef.current) / spec.valueMs;
      if (fillRef.current) fillRef.current.style.width = `${clamp01(v) * 100}%`;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function pressEnd() {
    if (reduced || result !== null || settledRef.current) return;
    const v = (performance.now() - startRef.current) / spec.valueMs;
    settleRound(v, roundRef.current);
  }

  const method = drink.method;
  const hint = [
    `水温 ${params.tempC[0]}–${params.tempC[1]}℃`,
    `粉量 ${params.doseG}g`,
    `水量 ${params.waterMl}ml`,
    params.milkMl ? `牛奶 ${params.milkMl}ml` : '',
    `时长 ${params.timeS} 秒`,
    `研磨 ${params.grind}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="brew">
      <header className="brew-head">
        <p className="crumb">
          {bean.name} · {drink.name} · {method}
        </p>
        <h3>{spec.title}</h3>
        <p className="meta">{hint}</p>
      </header>

      <ul className="brew-notes">
        {params.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>

      {reduced ? (
        <div className="brew-static">
          <p className="meta">动画已按系统偏好关闭，改成看参数判断。</p>
          <p className="crumb">这一杯的水温该是多少？</p>
          <div className="choices">
            {staticQuizChoices(params).map((c) => (
              <button key={c.pick} disabled={pick !== null} onClick={() => setPick(c.pick)}>
                {c.tempC[0]}–{c.tempC[1]}℃
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="brew-stage">
          <p className="crumb">
            {spec.kind === 'taps' ? `第 ${Math.min(round + 1, spec.rounds)}／${spec.rounds} 拍` : `一轮到底`}
          </p>
          <div className="brew-gauge" aria-hidden="true">
            <span className="brew-fill" ref={fillRef} />
            {/* 好评带：位置与判定口径同源——带宽取自 brew.ts 的 spec.band */}
            <span
              className="brew-target"
              style={{ left: `${(0.5 - spec.band) * 100}%`, width: `${spec.band * 200}%` }}
            />
          </div>
          <p className="meta">{spec.prompt}</p>
          <button
            className={`brew-pad ${pressed ? 'pressing' : ''}`}
            onPointerDown={pressStart}
            onPointerUp={pressEnd}
            onPointerLeave={pressEnd}
            onPointerCancel={pressEnd}
            disabled={result !== null}
          >
            {pressed ? '松手' : spec.kind === 'taps' ? '点按' : '按住'}
          </button>
          <p className="meta">分不清手感也没关系：不动手也会照常出杯，只是拿不到好评。</p>
        </div>
      )}

      {marks.length > 0 && result === null && (
        <p className="meta">本轮：{marks.map((m, i) => `第 ${i + 1} 轮 ${m}`).join(' · ')}</p>
      )}

      {result !== null ? (
        <div className="actions">
          <p className={`verdict brew-verdict grade-${result}`}>这一杯：{result}</p>
          <button className="primary" onClick={() => onDone(result)}>出杯</button>
        </div>
      ) : (
        <div className="actions">
          <button onClick={onCancel}>不做了</button>
        </div>
      )}
    </section>
  );
}
