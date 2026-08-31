# 数据契约（三轨并发的唯一耦合点）

> 本目录是**冻结区**。轨道 1／2／3 都只读这里，不改这里。
> 需要改契约时：停下 → 在本文件底部「变更记录」登记 → 三轨同步。

字段命名严格来自《方案-余温咖啡馆-产品方案.md》第 8 节，不另起别名。

## 目录归属（防冲突）

| 轨道 | 只写 | 只读 |
|---|---|---|
| 轨道 1 书籍→内容卡片 | `content/**`（`knowledge/`、`beans/`、`drinks/`） | `books/**`、`contracts/**` |
| 轨道 2 故事情节 | `story/**` | `content/index.json`、`contracts/**` |
| 轨道 3 游戏 | `game/**`、`index.html`、`package.json` | `contracts/**`、`content/**`、`story/**` |

三轨文件零重叠，可同时开工，不会互相覆盖。

## 契约文件

- `knowledge-card.schema.json` — 知识卡（轨道 1 产出，写在 `content/knowledge/`）
- `coffee-bean.schema.json` — 咖啡豆（轨道 1 产出，写在 `content/beans/`）
- `drink.schema.json` — 饮品（轨道 1 产出，写在 `content/drinks/`）
- `stage.schema.json` — 关卡（轨道 2 产出）
- `character.schema.json` — 角色（轨道 2 产出）
- `state-keys.json` — **经营数值键白名单**，`effects` / `flags` 只能用这里列出的键
- `types.ts` — 上述结构的 TypeScript 类型，轨道 3 直接 import

## 跨轨引用规则（关键）

轨道 2 写关卡时会引用轨道 1 还没产出的知识卡 ID，这是允许的：

- `stage.choices[].knowledge_id` 允许指向尚不存在的知识卡 → 校验器报 **warning**，不报 error
- 轨道 1 产出后，`npm run validate` 的 warning 自动消失
- 轨道 3 的加载器遇到缺失 ID 时降级为占位卡，不崩溃

反向不成立：轨道 1 的知识卡 `related_stages` 可以留空数组，由轨道 2 反向补。

## ID 段分配（轨道 1 内部多 agent 并行的关键）

多个 agent 同时写知识卡时，唯一会撞车的是 ID。按书预分配号段，各 agent 只在自己段内递增，互不干扰：

- `knowledge-0xx` / `bean-0xx` — 占位种子，文件名不带 `b<N>-` 前缀
- `knowledge-1xx` / `bean-1xx` — 书 1《咖啡沖煮的科學》
- `knowledge-2xx` / `bean-2xx` — 书 2《咖啡全书》
- `knowledge-3xx` / `bean-3xx` — 书 3《左手咖啡，右手世界》
- `knowledge-4xx` / `bean-4xx` — 书 4《咖啡原來是這樣的啊》
- `knowledge-5xx` / `bean-5xx` — 书 5《寻豆师》

文件命名必须是 `content/knowledge/b<书号>-<分片>.json`，例如 `b3-p1-120.json`。
校验器会检查 ID 段与文件名书号一致，写错段直接报 error。

同一本书再拆多个 agent 时，按分片继续切号段（如书 3 拆三片：310-339 / 340-369 / 370-399），
在下面的变更记录里登记一行即可。

## 自检

任一轨道提交前跑：

```bash
npm run validate
```

校验内容：schema 合规、ID 唯一、`next_stage` 可达、`effects` 键在白名单内、跨轨引用完整性。

## 变更记录

- 2026-08-31 初版冻结，依据产品方案 §8。
- 2026-08-31 新增 ID 段分配规则，支撑轨道 1 内部多 agent 并行。
- 2026-08-31 `PlayerSave` 增加 `upgrades: UpgradeId[]` 与 `today: DailyLedger`。
  仅轨道 3 运行时使用，不影响 `content/` 与 `story/` 的数据格式，轨道 1、2 无需改动。
  `today` 对应方案 §6.4 的每日营业结算字段。
- 2026-08-31 新增饮品：`drink.schema.json`、`Drink` 类型、`content/drinks/**` 归轨道 1。
  同时 `Choice` 增加可选 `drink_id`、`DailyLedger` 增加 `drinks_served`、`PlayerSave` 增加 `menu`。
  跨轨引用规则的例外：咖啡豆 `usable_drinks` 与关卡 `choices[].drink_id` 指向不存在的饮品报 **error**，
  不像知识卡那样降级成占位——出不了的饮品会让营业流程卡死。
  饮品 ID 用 `drink-<英文名>` 形式，不参与按书分配的三位数号段。
- 2026-08-31 为第 2~5 章开工，`state-keys.json` 的 `flags.known` 从 4 个扩到 16 个，
  新增：`chenshu_deal_signed`、`origin_lesson_learned`、`chapter_02_cleared`、
  `brew_method_mastered`、`siphon_repaired`、`chapter_03_cleared`、
  `old_menu_restored`、`linshu_past_known`、`chapter_04_cleared`、
  `fake_bluemountain_exposed`、`linshu_returned`、`chapter_05_cleared`。
  每章各自只用分配给它的那几个 flag，`chapter_0N_cleared` 由轨道 3 在收工结算时按当前章节号自动置位。
  轨道 3 的线索面板需要为每个新 flag 配一句文案，缺文案不影响运行，只是线索页少一行。
- 2026-08-31 `story/characters.json` 补齐 3 个角色：`chenshu`（豆商）、`suhe`（对街连锁店长）、`guyan`（写专栏的熟客）。
  这三个 ID 早已在 `character.schema.json` 与 `state-keys.json` 的 `trust.characters` 白名单里，
  但角色文件一直没落地，第一章又已经在写 `trust.chenshu`——补上前校验器抓不到这个洞。
