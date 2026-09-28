/* 全局设置（M2.1 + M4.7）。
 * 设置是设备级的，与档位解耦：换档不换设置，旧档也自动吃上新默认值。
 * 这里只管存与取，不判断口径——口径由调用方读出来，当参数传给纯函数（§1.0 第 2 条）。
 */
import { readJson, writeJson } from './store';

/** 应用版本号。发布时与 package.json 同步（D11：不做构建期注入，两处手改）。 */
export const APP_VERSION = '0.2.0';

const SETTINGS_KEY = 'yuwen-cafe-settings-v1';

export interface Settings {
  /** 宽松经济：余额不参与经营，扣钱免扣、收入照记（M2） */
  relaxedEconomy: boolean;
}

/** 缺省宽松开着——需求要的是「能玩下去」，紧经济留给想认真算账的人手动关（决策 A） */
export const DEFAULT_SETTINGS: Settings = { relaxedEconomy: true };

/** 读设置。键不存在 / 解析失败 / 字段不是布尔，一律回落到缺省，不抛。 */
export function loadSettings(): Settings {
  const raw = readJson<Partial<Settings> | null>(SETTINGS_KEY, null);
  const on = raw?.relaxedEconomy;
  return { relaxedEconomy: typeof on === 'boolean' ? on : DEFAULT_SETTINGS.relaxedEconomy };
}

export function saveSettings(s: Settings): void {
  writeJson(SETTINGS_KEY, { relaxedEconomy: s.relaxedEconomy });
}

/** 翻转开关（纯函数，返回新对象，不改入参）。 */
export function withRelaxedEconomy(s: Settings, on: boolean): Settings {
  return { ...s, relaxedEconomy: on };
}
