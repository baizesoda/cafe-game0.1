# 书籍蒸馏作业手册（轨道 1）

依据《方案-余温咖啡馆-产品方案.md》第 9 节。**只写 `content/**`，不碰 `contracts/`、`story/`、`game/`。**

## 文本可用性（已实测）

`tools/probe_books.py` 探测结果：

- 书 2《咖啡全书》docx — 可抽，18.1 万字 → `content/raw/b2.txt`（92 个 block）
- 书 3《左手咖啡，右手世界》PDF — 可抽，39.0 万字 → `content/raw/b3.txt`（567 页）
- 书 4《咖啡原來是這樣的啊》PDF — 可抽，9.5 万字 → `content/raw/b4.txt`（235 页）
- 书 1《咖啡沖煮的科學》PDF — **扫描件，无文字层，184 页，需 OCR**
- 书 5《寻豆师》PDF — **扫描件，无文字层，251 页，需 OCR**

重抽命令：`python3 tools/extract_book.py <书号> [--range 起页-止页]`
产出带 `=== p.<页码> ===` 标记，写 `source_locator` 时直接用这个页码。

`content/raw/` 与 `books/` 已加入 `.gitignore`——书籍原文不入库，仓库里只留蒸馏后的知识卡。

## 多 agent 并行的两条硬规则

1. **一个 agent 一个文件**：产出文件名必须是 `content/knowledge/b<书号>-<分片>.json`，
   分片就是自己负责的页码段，例如 `b3-p1-190.json`。不同 agent 永不写同一个文件。
2. **ID 段按书预分配**：书 N 的卡只能用 `knowledge-N**` / `bean-N**`。
   同一本书拆多个 agent 时再切细分段（见下表）。校验器会拦住写错段的卡。

段位表见 `contracts/CONTRACT.md`「ID 段分配」。

## 可立即并行的分片（3 本可抽文本的书）

- **A** 书 3 p.1–190 → `b3-p1-190.json`，ID `knowledge-300`~`329`
- **B** 书 3 p.191–380 → `b3-p191-380.json`，ID `knowledge-330`~`359`
- **C** 书 3 p.381–567 → `b3-p381-567.json`，ID `knowledge-360`~`389`
- **D** 书 4 全书 → `b4.json`，ID `knowledge-400`~`449`
- **E** 书 2 block 1–46 → `b2-b1-46.json`，ID `knowledge-200`~`239`（+ `bean-2xx`）
- **F** 书 2 block 47–92 → `b2-b47-92.json`，ID `knowledge-240`~`279`（+ `bean-2xx`）

书 3 偏商业史 → `人物`/`故事线索`；书 4 偏入门术语 → `冲煮`/`器具`；
书 2 偏产地处理法 → `咖啡豆`/`产地`，也是 `bean-2xx` 的主要来源。

## 单个 agent 的工单模板

把 `{{}}` 换成上表某一行，即可开一个会话：

```text
你负责《余温咖啡馆》内容轨道的一个分片。只允许写 content/knowledge/{{产出文件名}}
和 content/beans/{{产出文件名}}（不产豆子就不建），以及往 content/ocr-issues.md 追加。
禁止修改任何其他文件，尤其不要碰 contracts/、story/、game/ 和别人的分片文件。

原文在 content/raw/{{原文文件}}，你的范围是 {{页码或 block 区间}}。
字段契约读 contracts/knowledge-card.schema.json 和 contracts/coffee-bean.schema.json。

任务：从这段原文提取咖啡知识卡，目标 {{张数}} 张，ID 严格落在
{{knowledge-XXX ~ knowledge-YYY}} 段内，顺序递增，不得越界。

每张卡：
- plain_explanation 用白话，10~120 字，不堆术语
- source_quote 从原文逐字摘录，200 字内，禁止改写或编造
- source_book 填真实书名，source_chapter 填该页所属章节名，
  source_locator 填 p.<页码>（用原文里的 === p.N === 标记）
- 逐字核对无误的写 confidence: "high"；基于原理推断的写 "medium" 并填 inference_note；
  拿不准的整张卡不要写，改为记入 content/ocr-issues.md
- related_stages 留空数组，剧情轨道会反向补
- category 只能用六个枚举值之一，优先产出 {{建议 category}}

断行错乱、字符可疑、表格错位的内容一律进 content/ocr-issues.md，不要猜。

写完跑 npm run validate，确认 error 为 0（warning 是正常的），然后汇报：
产出几张卡、ID 区间、confidence 分布、记了几条存疑。
```

## 两本扫描件怎么办

书 1 是第一章知识卡的主要来源，但它是扫描件，当前无法脚本抽取。三个选项：

1. 装 OCR（`ocrmypdf` + `tesseract`，需 Homebrew，约 200MB 依赖），跑完就能并入上面的流水线
2. 用支持视觉的 agent 直接读 PDF 页面图，逐页转写——慢且贵，适合只取关键章节
3. 先放着。用书 4 的冲煮/器具内容顶替第一章的知识卡，书 1 后补

我的建议是 3 → 1：先用书 4 把第一章跑通，同时装 OCR 处理书 1，别让扫描件卡住主线。

## 当前状态

`content/knowledge/chapter-01.json`（3 张）与 `content/beans/chapter-01.json`（5 种）是**占位种子**，
ID 在 `0xx` 段，用于让轨道 3 先跑通界面。真实卡片进来后，把关卡里的 `knowledge_id`
指向真实 ID，再删掉种子文件即可。
