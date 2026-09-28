/* 反馈面板（M6 / U13）：三选一 + 描述 → 生成结构化文本 → 复制 / 分享 / 下载；下面列最近 10 条。
 * 面板不联网、不自动上传：只把文本交回给 App 存下来（决策 E）。
 */
import { useState } from 'react';
import {
  type FeedbackItem,
  type FeedbackKind,
  type SnapshotInput,
  buildSnapshot,
  formatFeedback,
} from './feedback';
import { copyText, downloadText, shareText } from './share';

const KINDS: { kind: FeedbackKind; label: string; hint: string }[] = [
  { kind: 'bug', label: '出问题了', hint: '画面或数值不对' },
  { kind: 'stuck', label: '卡住了', hint: '走不下去了' },
  { kind: 'suggestion', label: '有个建议', hint: '想让它更好' },
];

const clock = (at: number) => {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function FeedbackPanel({
  snapshotInput,
  items,
  onSubmit,
  onClose,
}: {
  snapshotInput: SnapshotInput;
  items: FeedbackItem[];
  onSubmit: (kind: FeedbackKind, text: string) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [notice, setNotice] = useState('');

  const copy = (payload: string) =>
    void copyText(payload).then((ok) => setNotice(ok ? '已复制。' : '复制不上，长按选中吧。'));

  function generate() {
    // 时间取点下按钮这一刻，快照里的 time 才是真正提交的时间
    const snap = buildSnapshot({ ...snapshotInput, now: Date.now() });
    const made = formatFeedback({ kind, text }, snap);
    setResult(made);
    onSubmit(kind, made);
    setNotice('已经记在下面「我的反馈」里，复制整段贴给店主就行。');
  }

  return (
    <section className="panel">
      <h2>反馈</h2>
      <p className="meta">文本在这台设备上生成，不会自动上传。带上版本、进度与最近操作，说清问题更快。</p>

      <div className="choices">
        {KINDS.map((k) => (
          <button key={k.kind} className={kind === k.kind ? 'primary' : ''} onClick={() => setKind(k.kind)}>
            {k.label}（{k.hint}）
          </button>
        ))}
      </div>

      <textarea
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="在哪一步、看到什么、本来期待什么"
      />
      <div className="actions">
        <button className="primary" onClick={generate}>生成反馈</button>
        <button onClick={onClose}>关上</button>
      </div>
      {notice && <p className="meta">{notice}</p>}

      {result && (
        <>
          <textarea className="code" rows={10} readOnly value={result} />
          <div className="actions">
            <button onClick={() => copy(result)}>复制</button>
            <button
              onClick={() =>
                void shareText('余温咖啡馆 · 反馈', result).then((r) =>
                  setNotice(
                    r === 'shared' ? '分享出去了。' : r === 'copied' ? '这台机器不能直接分享，已经复制到剪贴板。' : '分享和复制都没成，长按选中吧。',
                  ),
                )
              }
            >
              分享
            </button>
            <button onClick={() => downloadText('yuwen-feedback.txt', result)}>下载 .txt</button>
          </div>
        </>
      )}

      <h3>我的反馈</h3>
      {items.length === 0 ? (
        <p className="empty">还没提交过。上面那一段生成之后就会留在这里。</p>
      ) : (
        <ul className="feedbacklist">
          {items.map((item) => (
            <li key={item.id}>
              <strong>{KINDS.find((k) => k.kind === item.kind)?.label ?? item.kind}</strong>
              <span className="meta">{clock(item.at)} · {item.text.trim() || '（没写描述）'}</span>
              <div className="actions">
                <button onClick={() => copy(item.snapshot)}>复制这段</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
