// AI 生成的场景/人物/章节配图。用 glob 装载：图缺了不报错，页面自动退回纯手绘的 art.tsx。
// 文件名即用途：scene-<view> / char-<角色id> / cover-ch0N / drink-<id> / kb-<关键词>。
// 生图出来是 ~3MB 的 PNG，落库前统一压成 JPEG（sips -Z + q62），否则静态站体积撑爆。
const files = import.meta.glob('./assets/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const pick = (name: string): string | undefined => files[`./assets/${name}.jpg`];

/** 每屏的场景底图，压在手绘 SVG 之下当底子 */
export const sceneImage = (view: string) => pick(`scene-${view}`);

/** 角色半身像，对话框头像用；player 和没画的角色返回 undefined，退回陶土色块 */
export const charImage = (id: string) => pick(`char-${id}`);

/** 章节扉页图，chapter-02 → cover-ch02 */
export const coverImage = (chapter: string) => pick(chapter.replace('chapter-', 'cover-ch'));

/** 饮品插画，drink-espresso 这类 ID 直接当文件名 */
export const drinkImage = (id: string) => pick(id);

/** 知识/器具配图：natural washed honey altitude grinder siphon */
export const kbImage = (key: string) => pick(`kb-${key}`);

/** 图鉴条目：图 + 名 + 一句话。图没生成出来的条目在下面 gallery() 里会被滤掉 */
export interface Plate {
  key: string;
  name: string;
  note: string;
}

/** 咖啡类型图鉴。前三条复用饮品插画，后面是这一批新画的 */
const DRINK_PLATES: Plate[] = [
  { key: 'drink-espresso', name: '浓缩', note: '高压萃取，一小杯打底' },
  { key: 'drink-pourover', name: '手冲', note: '重力滴滤，风味最透' },
  { key: 'drink-latte', name: '拿铁', note: '浓缩兑大量热牛奶' },
  { key: 'drink-americano', name: '美式', note: '浓缩加水稀释' },
  { key: 'drink-cappuccino', name: '卡布奇诺', note: '奶泡厚，奶量少' },
  { key: 'drink-flatwhite', name: '馥芮白', note: '薄奶泡，咖啡味更前' },
  { key: 'drink-mocha', name: '摩卡', note: '加巧克力与奶油' },
  { key: 'drink-macchiato', name: '玛奇朵', note: '浓缩上点一勺奶泡' },
  { key: 'drink-cortado', name: '柯塔多', note: '浓缩与牛奶一比一' },
  { key: 'drink-coldbrew', name: '冷萃', note: '冷水长时间浸泡' },
  { key: 'drink-icelatte', name: '冰拿铁', note: '冷牛奶上淋浓缩' },
  { key: 'drink-frenchpress', name: '法压', note: '浸泡后压下滤网' },
  { key: 'drink-mokapot', name: '摩卡壶', note: '蒸汽压力往上顶' },
  { key: 'drink-aeropress', name: '爱乐压', note: '手压加压，快而干净' },
  { key: 'drink-cezve', name: '土耳其壶', note: '细粉连粉一起煮' },
];

/** 咖啡馆场景图集 */
const CAFE_PLATES: Plate[] = [
  { key: 'cafe-storefront', name: '门面', note: '街边的木门与遮阳篷' },
  { key: 'cafe-counter', name: '吧台', note: '一整面墙的罐子和杯子' },
  { key: 'cafe-window', name: '窗边', note: '晨光切在木桌上' },
  { key: 'cafe-shelf', name: '豆架', note: '密封罐、量勺与麻布' },
  { key: 'cafe-corner', name: '角落', note: '旧沙发和一盆绿植' },
  { key: 'cafe-roasting', name: '烘豆角', note: '后间的滚筒烘豆机' },
  { key: 'cafe-rain', name: '雨天', note: '玻璃挂满雨痕' },
  { key: 'cafe-crowd', name: '满座', note: '午后安静的人声' },
  { key: 'cafe-terrace', name: '街座', note: '门外两张小铁桌' },
  { key: 'cafe-night', name: '打烊', note: '只剩一盏吊灯' },
];

/** 器具设备图鉴 */
const GEAR_PLATES: Plate[] = [
  { key: 'gear-espressomachine', name: '意式机', note: '九个大气压的活儿' },
  { key: 'gear-electricgrinder', name: '电动磨', note: '刻度决定粗细' },
  { key: 'kb-grinder', name: '手摇磨', note: '慢，但发热少' },
  { key: 'gear-portafilter', name: '手柄粉碗', note: '粉饼要压平' },
  { key: 'gear-tamper', name: '压粉锤', note: '力道稳过力道大' },
  { key: 'gear-scale', name: '电子秤', note: '粉水比的靠山' },
  { key: 'gear-kettle', name: '鹅颈壶', note: '细水流才控得住' },
  { key: 'gear-v60', name: '锥形滤杯', note: '滤纸先润湿' },
  { key: 'gear-chemex', name: '沙漏壶', note: '厚滤纸，口感干净' },
  { key: 'kb-siphon', name: '虹吸壶', note: '靠蒸汽压水上行' },
  { key: 'gear-roaster', name: '烘豆机', note: '一爆二爆听声音' },
  { key: 'gear-milkpitcher', name: '奶泡壶', note: '尖嘴才画得出花' },
  { key: 'gear-cupping', name: '杯测组', note: '同一标准下打分' },
  { key: 'gear-toolset', name: '零碎工具', note: '布粉针、毛刷、温度计' },
];

/** 取一组图鉴条目，自动滤掉还没生成出图的那些 */
const gallery = (plates: Plate[]) =>
  plates.map((p) => ({ ...p, src: pick(p.key) })).filter((p): p is Plate & { src: string } => !!p.src);

export const drinkGallery = () => gallery(DRINK_PLATES);
export const cafeGallery = () => gallery(CAFE_PLATES);
export const gearGallery = () => gallery(GEAR_PLATES);
