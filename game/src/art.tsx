/* 手绘插画层：所有图形都是手写的内联 SVG 路径，没有 emoji、没有图标字体。
   共同规则——
   · 描边 2~2.6px，圆头圆角，端点故意出头 1~2px 模拟手抖
   · 至少两层：底色块偏移到描边之外，模拟上色没涂准
   · 每张图至少一处白色高光（opacity .5）和一处棕色暗部（opacity .18）
   颜色一律走 ArtDefs 里的同色系微渐变，不做纯色平涂。 */

/** 手绘描边的统一属性 */
const ink = {
  fill: 'none',
  stroke: '#5A4231',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** 高光：一小段白弧 */
const hi = { fill: 'none', stroke: '#fff', strokeOpacity: 0.5, strokeLinecap: 'round' } as const;

/** 暗部：淡棕，比描边粗一点，压在色块边上 */
const sh = { fill: 'none', stroke: '#6B4A32', strokeOpacity: 0.18, strokeLinecap: 'round' } as const;

/** 粉笔：黑板上的白色涩线 */
const chalk = { fill: 'none', stroke: '#F1E5CC', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const GRADIENTS: [string, string, string][] = [
  ['g-clay', '#D9AC8C', '#C08767'],
  ['g-cream', '#F8EED9', '#E8D8B8'],
  ['g-coffee', '#84603F', '#5C3F28'],
  ['g-wood', '#B48E61', '#8E6C44'],
  ['g-brass', '#C9AC74', '#A0834F'],
  ['g-leaf', '#8CA47F', '#61785A'],
  ['g-paper', '#F7ECD8', '#E6D5B5'],
  ['g-slate', '#5E6358', '#43473F'],
  ['g-fur', '#EFD8B4', '#D6AE79'],
];

/** 渐变定义整个应用只渲染一次 */
export function ArtDefs() {
  return (
    <svg className="art-defs" aria-hidden="true" focusable="false">
      <defs>
        {GRADIENTS.map(([id, from, to]) => (
          <linearGradient key={id} id={id} x1="0.07" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
        ))}
      </defs>
    </svg>
  );
}

/* ---------- 六块分区牌子上的小插画 ---------- */

/** 吧台：哑光陶瓷杯，杯口三缕热气 */
function CupArt() {
  return (
    <svg className="art art-cup" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M12.4 20.8h21.2v6.4c0 5.6-3.8 9.8-9.6 9.8h-1.9c-5.9 0-9.7-4.2-9.7-9.8z" fill="url(#g-clay)" />
      <path d="M13.2 19.6c0-.8.6-1.5 1.4-1.5h18.9c.8 0 1.4.7 1.4 1.5v7.3c0 6-4 10.1-10 10.1h-1.8c-6 0-9.9-4.1-9.9-10.1z" {...ink} strokeWidth="2.4" />
      <path d="M35.4 21.6c4-1.3 7.3.6 7.4 3.9.1 3.3-3.3 5.3-7.1 4.3" {...ink} strokeWidth="2.2" />
      <path d="M8.4 40.4h31.4" {...ink} strokeWidth="2.4" />
      <path d="M17.8 22.6c-.5 4 .1 7.1 1.8 9.5" {...hi} strokeWidth="2.2" />
      <path d="M29.6 23.2c1.2 4.2.6 7.5-1.3 10.3" {...sh} strokeWidth="3.2" />
      <path className="steam s1" d="M17.9 13.8c-1.7-2.3.6-3.5-.7-5.8" {...ink} strokeWidth="2" opacity=".5" />
      <path className="steam s2" d="M24 12.4c-1.9-2.7.7-4.1-.7-6.8" {...ink} strokeWidth="2" opacity=".68" />
      <path className="steam s3" d="M30.1 13.8c-1.7-2.3.6-3.5-.7-5.8" {...ink} strokeWidth="2" opacity=".5" />
    </svg>
  );
}

/** 门口：木门 + 歪挂的小木牌 */
function DoorArt() {
  return (
    <svg className="art" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M12.6 9.4h22.4v32.2H12.6z" fill="url(#g-wood)" />
      <path d="M13.4 8.2h21.4c.7 0 1.2.5 1.2 1.2v32.6H12.2V9.4c0-.7.5-1.2 1.2-1.2z" {...ink} strokeWidth="2.4" />
      <path d="M4.6 42.6h38.8" {...ink} strokeWidth="2.4" />
      <path d="M16.6 12.4h7.4v8h-7.4z" fill="url(#g-cream)" />
      <path d="M16.2 12h7.8v8.4h-7.8z" {...ink} strokeWidth="2.1" />
      <path d="M17.6 13.6c-.3 2.6-.2 4.6.2 5.6" {...hi} strokeWidth="2.1" />
      <path d="M32.2 13c.6 8.8.5 17.4-.4 25.6" {...sh} strokeWidth="3.4" />
      <path d="M30.4 25.6c1.8.1 3 .2 3.6.2" {...ink} strokeWidth="2.6" />
      <g transform="rotate(-8 28 34)">
        <path d="M23.6 31.8h9.2v6h-9.2z" fill="url(#g-paper)" />
        <path d="M23.2 31.4h9.8v6.4h-9.8z" {...ink} strokeWidth="2" />
        <path d="M25.8 34.2h4.6" {...ink} strokeWidth="2" opacity=".55" />
      </g>
    </svg>
  );
}

/** 菜单黑板：黑板 + 边角的粉笔涂鸦 */
function BoardArt() {
  return (
    <svg className="art" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M7.4 10.6h33v22H7.4z" fill="url(#g-slate)" />
      <path d="M6.8 9.6h34.4c.9 0 1.6.7 1.6 1.6v20.6c0 .9-.7 1.6-1.6 1.6H6.8c-.9 0-1.6-.7-1.6-1.6V11.2c0-.9.7-1.6 1.6-1.6z" {...ink} strokeWidth="2.5" />
      <path d="M12.6 17.2c5.8-.5 11.6-.6 17.4-.3" {...chalk} strokeOpacity=".76" strokeWidth="2.2" />
      <path d="M12.8 22.4c4 .2 8 .1 12-.2" {...chalk} strokeOpacity=".56" strokeWidth="2.1" />
      <path d="M30.4 24.8c0 3.2 1.4 4.8 3.4 4.8s3.2-1.6 3.2-4.8zm6.6 1.2c1.6-.6 2.6.1 2.6 1.2s-1 1.8-2.4 1.5" {...chalk} strokeOpacity=".6" strokeWidth="2" />
      <path d="M9.2 12.4c-.4 6.6-.3 12.8.1 18.4" {...hi} strokeWidth="2.2" />
      <path d="M38.8 13c.5 6.2.4 12.2-.2 18.2" {...sh} strokeWidth="3.4" />
      <path d="M16.4 36.6l3.2-3.6M31.6 36.8l-3.2-3.8" {...ink} strokeWidth="2.4" />
      <path d="M10.2 42.4h27.8" {...ink} strokeWidth="2.4" />
    </svg>
  );
}

/** 仓库：麻袋 + 散落两颗豆子 */
function SackArt() {
  return (
    <svg className="art" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M15.4 17.6h17.8c1.6 5 2.4 11.2 2.4 18.2H13c0-7 .8-13.2 2.4-18.2z" fill="url(#g-cream)" />
      <path d="M14.8 16.4c-1.8 5.6-2.7 12.2-2.7 19.6h23.8c0-7.4-.9-14-2.7-19.6" {...ink} strokeWidth="2.4" />
      <path d="M14.4 16.6c1.4-2.3 3.6-3.3 6-2.5 1.8.6 2.4 2.1 4 2.1 1.4 0 2.2-1.5 4-2.1 2.4-.8 4.4.2 5.8 2.5" {...ink} strokeWidth="2.3" />
      <path d="M17.4 20.6c-1 4.8-1.4 9.6-1.2 14.4" {...hi} strokeWidth="2.2" />
      <path d="M31 21c1 4.8 1.4 9.6 1.2 14.2" {...sh} strokeWidth="3.4" />
      <path d="M19.8 27.4h8.6M20.8 31.6h6.8" {...ink} strokeWidth="2" opacity=".45" />
      <path d="M8.8 41.6h30.8" {...ink} strokeWidth="2.4" />
      <path d="M6.2 37.8c0-1.7 1.4-3 3.1-3s3.1 1.3 3.1 3-1.4 3-3.1 3-3.1-1.3-3.1-3z" fill="url(#g-coffee)" />
      <path d="M5.8 37.6c0-1.8 1.5-3.2 3.3-3.2s3.3 1.4 3.3 3.2-1.5 3.2-3.3 3.2-3.3-1.4-3.3-3.2zM9.1 34.2v6.8" {...ink} strokeWidth="2.1" />
      <g transform="rotate(20 41 38)">
        <path d="M38.2 37.8c0-1.7 1.4-3 3.1-3s3.1 1.3 3.1 3-1.4 3-3.1 3-3.1-1.3-3.1-3z" fill="url(#g-coffee)" />
        <path d="M37.8 37.6c0-1.8 1.5-3.2 3.3-3.2s3.3 1.4 3.3 3.2-1.5 3.2-3.3 3.2-3.3-1.4-3.3-3.2zM41.1 34.2v6.8" {...ink} strokeWidth="2.1" />
      </g>
    </svg>
  );
}

/** 桌面：摊着的两张纸 + 别在上面的图钉 */
function DeskArt() {
  return (
    <svg className="art" viewBox="0 0 48 48" aria-hidden="true">
      <g transform="rotate(-6 22 26)">
        <path d="M9.6 12.4h22.2v25.4H9.6z" fill="url(#g-paper)" />
        <path d="M9 11.8h22.8v26.4H9z" {...ink} strokeWidth="2.3" />
        <path d="M10.8 14c-.4 7.4-.3 14.6.2 21.4" {...hi} strokeWidth="2.2" />
        <path d="M14 19h13.4M14 24h11M14 29h7.6" {...ink} strokeWidth="2" opacity=".5" />
      </g>
      <g transform="rotate(7 33 28)">
        <path d="M26.6 18.4h14.2v20.2H26.6z" fill="url(#g-cream)" />
        <path d="M26 17.8h14.8v21h-14.8z" {...ink} strokeWidth="2.2" />
        <path d="M29.6 24h8.2M29.6 28.6h5.6" {...ink} strokeWidth="2" opacity=".5" />
        <path d="M39.2 20c.6 5.8.5 11.4-.2 16.8" {...sh} strokeWidth="3.4" />
      </g>
      <path d="M20.6 11c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 3.4-4 3.4-4-1.2-4-3.4z" fill="url(#g-clay)" />
      <path d="M20.2 10.8c0-2.4 2-4.3 4.4-4.3s4.4 1.9 4.4 4.3-2 3.7-4.4 3.7-4.4-1.3-4.4-3.7z" {...ink} strokeWidth="2.2" />
      <path d="M24.6 14v6.2" {...ink} strokeWidth="2.2" />
      <path d="M22.4 8.8c-.6.8-.8 1.6-.6 2.4" {...hi} strokeWidth="2.1" />
    </svg>
  );
}

/** 后门：半开的门 + 门外两块踏脚石 */
function PathArt() {
  return (
    <svg className="art" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M8.6 8.6h13.8v32.4H8.6z" fill="url(#g-wood)" />
      <path d="M8 8h14.6v33.4H8z" {...ink} strokeWidth="2.4" />
      <path d="M9.8 11c-.4 8.6-.3 17-.1 24.8" {...hi} strokeWidth="2.2" />
      <path d="M21 11c.5 8.8.4 17.4-.2 25.4" {...sh} strokeWidth="3.4" />
      <path d="M18.6 25.2c1.4.1 2.4.2 3 .2" {...ink} strokeWidth="2.5" />
      <path d="M22.8 12.4l8.4 4.4v20.4l-8.4 4" {...ink} strokeWidth="2.3" fill="url(#g-brass)" fillOpacity=".5" />
      <path d="M27.6 33.2c3.6-.6 7.2-.4 10.8.6" {...ink} strokeWidth="2.2" opacity=".55" />
      <path d="M34.2 39.4c0-1.4 2-2.4 4.4-2.4s4.4 1 4.4 2.4-2 2.4-4.4 2.4-4.4-1-4.4-2.4z" fill="url(#g-cream)" />
      <path d="M33.8 39.2c0-1.5 2.1-2.6 4.8-2.6s4.8 1.1 4.8 2.6-2.1 2.6-4.8 2.6-4.8-1.1-4.8-2.6z" {...ink} strokeWidth="2.1" />
      <path d="M27.4 44.4c0-1.2 1.8-2.2 4-2.2s4 1 4 2.2" {...ink} strokeWidth="2.1" opacity=".7" />
    </svg>
  );
}

/** 分区牌子上的插画，按分区名取；没有对应插画时不画东西 */
export function ZoneArt({ kind }: { kind: string }) {
  switch (kind) {
    case 'serve': return <CupArt />;
    case 'stage': return <DoorArt />;
    case 'upgrade': return <BoardArt />;
    case 'storage': return <SackArt />;
    case 'clues': return <DeskArt />;
    case 'map': return <PathArt />;
    default: return null;
  }
}

/* ---------- 生活化细节：每屏角落里放一个 ---------- */

/** 吧台上打呼的猫，尾巴垂在外面 */
function SleepingCat() {
  return (
    <svg className="art art-cat" viewBox="0 0 96 52" aria-hidden="true">
      <path d="M13.6 40.6c-1.6-9.6 5.4-18.4 15.4-18.8 6.4-.2 9.6 3.4 16.4 3.4 7.2 0 11.4-4.2 18.4-3 9.4 1.6 14.4 10 12.6 18.6z" fill="url(#g-fur)" />
      <path d="M12.6 41.4c-1.8-10.2 5.4-19.6 16-20 6.6-.2 9.8 3.5 16.8 3.5 7.4 0 11.6-4.3 18.8-3.1 9.8 1.7 15.2 10.6 13.2 19.8" {...ink} strokeWidth="2.5" />
      <path d="M10.4 42.2h76.2" {...ink} strokeWidth="2.4" />
      {/* 耳朵 */}
      <path d="M20.4 24.6l-1.6-7.4 7.4 4.2M35 21.6l2.6-7 4.4 6.6" {...ink} strokeWidth="2.3" />
      {/* 闭着的眼和胡须 */}
      <path d="M23.4 30.4c1.4 1.4 3 1.4 4.4 0M32.4 30.2c1.4 1.4 3 1.4 4.4 0" {...ink} strokeWidth="2.2" />
      <path d="M18.6 34.2l-6.4-1.8M18.8 36.6l-6.2 1.4" {...ink} strokeWidth="2" opacity=".6" />
      {/* 垂在吧台外的尾巴 */}
      <path d="M76.2 40c6.6 1.4 10.6 5.6 9.4 10.2" {...ink} strokeWidth="2.5" />
      <path d="M22 27.6c-4.4 3-6.6 7.4-6.4 12.4" {...hi} strokeWidth="2.3" />
      <path d="M62 28.4c5.4 3 8 7.4 7.6 12.6" {...sh} strokeWidth="3.6" />
      {/* 呼吸的两小段气 */}
      <path d="M50.4 20.8c2.2-1.6 1.2-3.4-.6-4.4M57.6 18.2c2-1.4 1-3-.6-3.8" {...ink} strokeWidth="2" opacity=".4" />
    </svg>
  );
}

/** 叶片下垂的绿植，缺一次浇水 */
function PottedPlant() {
  return (
    <svg className="art art-plant" viewBox="0 0 60 84" aria-hidden="true">
      <path d="M19.6 54.4h21.6l-2.8 24.4H22.4z" fill="url(#g-clay)" />
      <path d="M18.6 53.6h22.8l-2.9 25.6H21.5z" {...ink} strokeWidth="2.4" />
      <path d="M16.6 53.4h26.8" {...ink} strokeWidth="2.5" />
      <path d="M22.4 58c-.6 6.4-.5 12.6.2 18.4" {...hi} strokeWidth="2.3" />
      <path d="M36.6 58.4c.7 6.4.6 12.6-.2 18.4" {...sh} strokeWidth="3.6" />
      <path d="M30 53.2c-.6-9.4-.4-18.4.6-27" {...ink} strokeWidth="2.4" />
      {/* 三片往下垂的叶子 */}
      <path d="M30 33.6c-7.4-3.4-13.6-1.6-15.2 5.2 5.8 3.8 11.6 2.2 15.2-5.2z" fill="url(#g-leaf)" />
      <path d="M30.2 33c-7.8-3.8-14.4-1.8-16 5.4 6.2 4 12.4 2.2 16-5.4z" {...ink} strokeWidth="2.3" />
      <path d="M30 27.6c7.6-4 14-2 15.6 5.4-6 4-12.2 2.2-15.6-5.4z" fill="url(#g-leaf)" />
      <path d="M30.4 27c7.8-4.2 14.6-2 16.2 5.6-6.4 4.2-12.6 2.2-16.2-5.6z" {...ink} strokeWidth="2.3" />
      <path d="M30.6 20.4c1.8-8 7-11.6 13-8.8-.8 7.6-5.4 11.4-13 8.8z" fill="url(#g-leaf)" />
      <path d="M30.8 19.8c1.8-8.4 7.4-12.2 13.6-9.2-.8 8-5.8 11.8-13.6 9.2z" {...ink} strokeWidth="2.3" />
      <path d="M20 35.6c1.4-1.8 3.4-2.6 6-2.4" {...hi} strokeWidth="2.2" />
      <path d="M38 30.4c2.6.2 4.6 1 6 2.6" {...sh} strokeWidth="3.4" />
    </svg>
  );
}

/** 停在三点四十的旧挂钟 */
function WallClock() {
  return (
    <svg className="art art-clock" viewBox="0 0 60 60" aria-hidden="true">
      <path d="M6.6 30.4c0-13 10.4-23.4 23.4-23.4s23.4 10.4 23.4 23.4S43 53.8 30 53.8 6.6 43.4 6.6 30.4z" fill="url(#g-brass)" />
      <path d="M5.8 30c0-13.4 10.8-24.2 24.2-24.2S54.2 16.6 54.2 30 43.4 54.2 30 54.2 5.8 43.4 5.8 30z" {...ink} strokeWidth="2.5" />
      <path d="M11.6 30c0-10.2 8.2-18.4 18.4-18.4S48.4 19.8 48.4 30 40.2 48.4 30 48.4 11.6 40.2 11.6 30z" fill="url(#g-cream)" />
      <path d="M11 29.8c0-10.5 8.5-19 19-19s19 8.5 19 19-8.5 19-19 19-19-8.5-19-19z" {...ink} strokeWidth="2.2" />
      {/* 指针停在 3:40 */}
      <path d="M30 30l10.4 3.8M30 30l-15.6 9.2" {...ink} strokeWidth="2.5" />
      <path d="M30 15.2v3.4M44.6 30h-3.4M30 44.6v-3.4M15.4 30h3.4" {...ink} strokeWidth="2.2" opacity=".6" />
      <path d="M17.4 20.6c-3 3.6-4.4 7.4-4.2 11.6" {...hi} strokeWidth="2.3" />
      <path d="M45 21.6c3 4 4.2 8.2 3.6 12.8" {...sh} strokeWidth="3.6" />
    </svg>
  );
}

/** 歪挂的旧相框，里头一道远山 */
function TiltedFrame() {
  return (
    <svg className="art art-frame" viewBox="0 0 68 60" aria-hidden="true">
      <path d="M7.6 9.6h53.2v40.2H7.6z" fill="url(#g-wood)" />
      <path d="M6.8 8.8h54.4v41.6H6.8z" {...ink} strokeWidth="2.5" />
      <path d="M13.4 15.4h41.4v28.6H13.4z" fill="url(#g-cream)" />
      <path d="M12.8 14.8h42.6v29.8H12.8z" {...ink} strokeWidth="2.2" />
      <path d="M16.4 36.6c4.6-8 8.2-8.2 12.4-1.4 3.4-9.8 7.6-10.4 12.8-2 2.4-4.4 5-4.6 8.2-.8" {...ink} strokeWidth="2.2" opacity=".7" />
      <path d="M43.4 22.6c0-2.4 1.8-4.2 4-4.2s4 1.8 4 4.2" {...ink} strokeWidth="2.1" opacity=".55" />
      <path d="M15.4 18.6c-.6 8-.5 15.4.2 22" {...hi} strokeWidth="2.3" />
      <path d="M58.6 12.6c.8 12 .6 23.4-.4 34.8" {...sh} strokeWidth="3.6" />
      {/* 挂钩上的一段线 */}
      <path d="M34 8.6l-6.4-6.2M34 8.6l7-6" {...ink} strokeWidth="2.1" opacity=".65" />
    </svg>
  );
}

/** 散落的三颗咖啡豆 */
function CoffeeBeans() {
  return (
    <svg className="art art-beans" viewBox="0 0 72 40" aria-hidden="true">
      {[
        { x: 6, y: 10, r: -14 },
        { x: 26, y: 16, r: 22 },
        { x: 47, y: 8, r: 6 },
      ].map((b) => (
        <g key={`${b.x}-${b.y}`} transform={`translate(${b.x} ${b.y}) rotate(${b.r} 9 9)`}>
          <path d="M.8 9.4C.8 4.6 4.6.6 9.4.6s8.6 4 8.6 8.8-3.8 8.8-8.6 8.8S.8 14.2.8 9.4z" fill="url(#g-coffee)" />
          <path d="M.2 9.2C.2 4.2 4.2 0 9.2 0s9 4.2 9 9.2-4 9.2-9 9.2-9-4.2-9-9.2z" {...ink} strokeWidth="2.2" />
          <path d="M9.2-.4c-1.6 6.2-1.6 12.6 0 19" {...ink} strokeWidth="2.1" />
          <path d="M4.4 4.4c-1.6 1.8-2.4 3.8-2.4 6" {...hi} strokeWidth="2.1" />
          <path d="M14.6 5c1.6 2.2 2.2 4.6 1.8 7.2" {...sh} strokeWidth="3" />
        </g>
      ))}
    </svg>
  );
}

/** 写了一半的便签，最后一行断在中途 */
function HalfNote() {
  return (
    <svg className="art art-note" viewBox="0 0 72 64" aria-hidden="true">
      <path d="M8.6 8.6h54v46.2l-8 8.2H8.6z" fill="url(#g-paper)" />
      <path d="M8 8h55.2v46.6l-8.4 8.6H8z" {...ink} strokeWidth="2.4" />
      {/* 右下角自然卷起的一角 */}
      <path d="M63.2 54.6l-8.4-.2.2 8.8" {...ink} strokeWidth="2.2" />
      <path d="M15.4 20.6h38M15.4 28.4h34.4M15.4 36.2h39.6M15.4 44h14.6" {...ink} strokeWidth="2.1" opacity=".52" />
      <path d="M10.4 12c-.6 11.6-.5 22.8.2 33.6" {...hi} strokeWidth="2.3" />
      <path d="M60 12.6c.7 11.8.6 23-.4 33.8" {...sh} strokeWidth="3.6" />
    </svg>
  );
}

/** 别在纸上的回形针 */
function Paperclip() {
  return (
    <svg className="art art-clip" viewBox="0 0 32 56" aria-hidden="true">
      <path d="M11.4 7.6c0-3 2.2-5.4 5-5.4s5 2.4 5 5.4v36c0 5-3.6 9-8.2 9s-8.2-4-8.2-9V17.4" fill="none" stroke="url(#g-brass)" strokeWidth="5.4" strokeLinecap="round" />
      <path d="M11 7.2c0-3.2 2.3-5.8 5.4-5.8s5.4 2.6 5.4 5.8v36.2c0 5.2-3.8 9.4-8.6 9.4s-8.6-4.2-8.6-9.4V17" {...ink} strokeWidth="2.2" />
      <path d="M14 10c-.4 10.4-.3 20.6.2 30.4" {...hi} strokeWidth="2.2" />
      <path d="M19.6 12c.5 10.2.4 20.2-.2 30" {...sh} strokeWidth="3" />
    </svg>
  );
}

/** 压出凹陷的图钉 */
function Pushpin() {
  return (
    <svg className="art art-pin" viewBox="0 0 32 40" aria-hidden="true">
      <path d="M6.4 12.4c0-4.8 4-8.6 8.8-8.6s8.8 3.8 8.8 8.6-4 7.6-8.8 7.6-8.8-2.8-8.8-7.6z" fill="url(#g-clay)" />
      <path d="M5.8 12c0-5 4.3-9.2 9.4-9.2s9.4 4.2 9.4 9.2-4.2 8-9.4 8-9.4-3-9.4-8z" {...ink} strokeWidth="2.4" />
      <path d="M15.2 19.6v17.8" {...ink} strokeWidth="2.4" />
      <path d="M10.4 8.4c-1.4 1.8-2 3.6-1.8 5.6" {...hi} strokeWidth="2.2" />
      <path d="M21 9c1.4 2.2 1.8 4.4 1.2 6.6" {...sh} strokeWidth="3.2" />
    </svg>
  );
}

/** 每屏角落里的一处生活痕迹，按屏取；找不到就不画 */
export function ViewDetail({ view }: { view: string }) {
  const pick = () => {
    switch (view) {
      case 'home': return <WallClock />;
      case 'map': return <Pushpin />;
      case 'stage': return <HalfNote />;
      case 'serve': return <CoffeeBeans />;
      case 'storage': return <SleepingCat />;
      case 'upgrade': return <CoffeeBeans />;
      case 'clues': return <Paperclip />;
      case 'archive': return <Paperclip />;
      case 'settlement': return <TiltedFrame />;
      default: return null;
    }
  };
  const art = pick();
  return art ? <span className={`view-detail vd-${view}`}>{art}</span> : null;
}

/**
 * 店内主界面的那一格画面：墙上歪着的相框和停摆的挂钟，
 * 吧台上一杯冒热气的咖啡、打呼的猫、缺水的绿植和洒出来的豆子。
 * 台面本身用 CSS 画（木纹微渐变），这里只放插画。
 */
export function CafeScene() {
  return (
    <div className="cafe-scene" aria-hidden="true">
      <div className="scene-wall">
        <span className="on-wall frame"><TiltedFrame /></span>
        <span className="on-wall clock"><WallClock /></span>
      </div>
      <div className="scene-counter">
        <span className="on-counter plant"><PottedPlant /></span>
        <span className="on-counter cup"><CupArt /></span>
        <span className="on-counter cat"><SleepingCat /></span>
        <span className="on-counter beans"><CoffeeBeans /></span>
      </div>
    </div>
  );
}

