# 三轨并发开发说明

剧情主线的持续写作与漏洞检查规则见 `story/WRITING_LOOP.md`。

当前新悬疑主线设计稿见 `story/余温主线故事圣经.md`。新主线尚未迁移到现有 `story/chapters/*.json`；迁移前必须完成故事圣经审计，并单独处理旧版“林叔—咖啡农—连锁收购”剧情与新主线之间的冲突。

产品方案见 `方案-余温咖啡馆-产品方案.md`。本文件只讲一件事：**三条轨道怎么同时开工而不互相堵住。**

## 为什么能并发

三轨唯一的耦合点被抽到 `contracts/`（数据契约）。轨道之间不传文件、不等对方交付，各自往自己的目录里写符合契约的 JSON 或代码：

```
books/      原始书籍（只读）
contracts/  冻结的数据契约 —— 三轨只读，改动需三方同意
content/    轨道 1 只写：知识卡、咖啡豆、清洗后的分章正文
story/      轨道 2 只写：关卡、角色
game/       轨道 3 只写：界面与数值逻辑
```

文件零重叠，所以三个 agent 会话可以真正同时跑。

`game/src/data/loader.ts` 用 `import.meta.glob` 扫 `content/` 与 `story/`，
轨道 1、2 新增数据文件后游戏自动收录，界面代码一行都不用改。

## 卡死的两个点，已经解掉

1. **轨道 2 要引用还没产出的知识卡** → 允许。校验器只报 warning，游戏侧 `getCard()` 降级成占位卡，不崩。
2. **轨道 3 要等内容才能开工** → 不用等。`content/` 与 `story/` 里已有可跑通的占位种子（3 张知识卡、5 种豆、4 个关卡），
   真实内容产出后替换同名文件即可。

## 共同的自检门

任一轨道提交前跑：

```bash
npm install      # 首次
npm run validate # 契约校验：schema、ID 唯一、next_stage 可达、effects 键白名单、内容红线
npm run dev      # 本地预览 http://localhost:5173
npm run build    # tsc + vite build，产物在 dist/
```

`validate` 里 `error` 必须清零，`warning` 表示跨轨引用还没补齐，可以暂时存在。

## 三张工单

各开一个独立会话，把对应工单原文贴进去。工单里的目录边界是硬约束。

### 轨道 1 · 书籍 → 内容卡片

这条轨道内部还能继续拆给多个 agent 并行。分片表、ID 段分配和单个 agent 的工单模板都在
`content/EXTRACTION.md`，那里已经按书列好 6 个互不重叠的分片（A~F）。

要点：
- 书 2 / 3 / 4 已抽成 `content/raw/b*.txt`，agent 直接读文本，不用碰 PDF
- 书 1 和书 5 是扫描件无文字层，需要 OCR 才能进流水线
- 每个 agent 一个产出文件、一个 ID 段，靠 `npm run validate` 拦越界

### 轨道 2 · 故事情节

```text
你负责《余温咖啡馆》的剧情轨道。只允许写 story/** ，禁止修改 contracts/、content/、game/。

先读 方案-余温咖啡馆-产品方案.md 的第 2、3、4、5 节，和 contracts/stage.schema.json、
contracts/character.schema.json、contracts/state-keys.json。
再读 story/chapters/chapter-01.json 作为格式范本（已完成的第一章 4 关）。

本轮任务：产出第二章「第一批豆子」的 4 个关卡到 story/chapters/chapter-02.json，
并把陈叔、苏禾补进 story/characters.json。

硬约束：
- 严格按 stage.schema.json 的字段和枚举，对话单条不超过 120 字（手机端要求）
- effects 的键只能用 contracts/state-keys.json 白名单里的；需要新 flag 时先在
  state-keys.json 的 flags.known 登记（这是唯一允许你碰 contracts 的情况，改完在
  contracts/CONTRACT.md 变更记录里写一行）
- 每个有 wrong 选项的关卡必须写 recovery，错误后果可恢复，不许 Game Over
- knowledge_id 可以指向还不存在的知识卡（轨道 1 在做），校验器只报 warning
- 把 chapter-01.json 最后一关的 next_stage 从 null 改成 stage-2-1

跑 npm run validate，error 清零后停下汇报。
```

### 轨道 3 · 游戏

```text
你负责《余温咖啡馆》的游戏轨道。只允许写 game/**、index.html、vite.config.ts、
package.json，禁止修改 contracts/、content/、story/。

现状：已有可跑通的骨架（首页 / 关卡 / 结果 / 知识档案 / 结算 + localStorage 存档），
数据从 game/src/data/loader.ts 自动加载。先跑 npm run dev 看一遍。

本轮任务，按方案 §7.1 和 §12 验收标准补齐：
1. 咖啡馆主界面（吧台/门口/黑板/仓库/桌面/后门六个可点区域）
2. 章节地图（已完成 / 当前可玩 / 未解锁 三态，第一版单线）
3. 营业页面：客人、需求、可选饮品、当前库存、满意度反馈
4. 每日结算页：收入、原料成本、净收益、接待/满意客人数、口碑变化、新获知识
5. 设备升级交互（磨豆机），消耗现金并写入 save.upgrades
6. 手机端走查：360px 宽下文字、按钮、对话框不重叠不溢出

约束：
- 类型只从 contracts/types.ts import，不在 game/ 内重复定义数据结构
- 数值边界只从 contracts/state-keys.json 读，不写魔法数
- 视觉按方案 §7.2：暖白/深绿/砖红/木色，不用大 Hero、渐变、发光球、装饰动画
- 知识卡必须展示 source_book / source_chapter / source_quote / confidence 四个字段，
  占位内容也要显示占位说明，不能留空

跑 npm run build 通过后停下汇报。
```

## 合并节奏

三轨各开一个 git 分支（`content/`、`story/`、`game/`），因为文件不重叠，合并基本不会冲突。
唯一可能撞车的是 `contracts/state-keys.json`——只有轨道 2 在登记新 flag 时会改，改完立刻合。

合并后跑一次 `npm run validate && npm run build` 作为集成门。

## 上线（阿里云双核）

产物是纯静态文件，无后端、无账号系统：

```bash
npm run build
# 把 dist/ 传到服务器，用 nginx 指向该目录即可
```

方案第一版明确不做账号与服务端存档，进度存在浏览器 localStorage，因此没有需要鉴权的接口。
后续若加排行榜等联网功能，需要先补鉴权设计再开工。
