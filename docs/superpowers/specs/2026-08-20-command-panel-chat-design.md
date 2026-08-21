# 命令面板改成多轮对话（贴角面板 + 圆形气泡入口）

> 建立：2026-08-20
> 状态：设计已确认，待出实现计划
> 影响范围：`src/components/intent/`、`src/app/api/intent/route.ts`、`src/lib/intent/parser.ts`、`messages/{zh,en,ja}.json`、`docs/design-system.md` §3
> 相关：`docs/design-system.md`（UI 唯一权威）

## 1. 背景与问题

现有「用文字操作」是单轮命令条：`src/components/intent/CommandBar.tsx` 用一个 `<Input>` 收一句话，POST `/api/intent`，把返回的单个 `result` 渲染在输入框下方。它有三个具体问题：

1. **新结果顶掉旧结果**。`setResult(json)` 覆盖式赋值，上一轮问答不留痕，用户无法对照前后两次查询。
2. **应用成功就关窗**。`applied()` 里 `setOpen(false)`，一次写操作结束即中断，接着要再改一笔得从头点开。
3. **placeholder 承担了教学职责**。`intent.placeholder` 是一条塞满示例的长文案（「用一句话操作（v1 仅支持支出管理）。例：Q3 薪资中 MC 占了多少 / 新增差旅费 5月10日打车 320 元」），在窄输入框里被截断，实际读不到。

要的结果：交互形态是标准多轮对话——消息流累积、面板不因单次操作结束而关闭、示例作为可点的空态引导而非 placeholder。

## 2. 已确认的四个决策

| 决策点 | 选定 | 放弃的选项与原因 |
|---|---|---|
| 「多轮」的语义 | **视觉消息流 + 轻上下文**（后端只多收上一轮） | 纯视觉流不懂「那再加一笔」；完整历史上下文对当前场景过量，且成本随轮数线性涨 |
| 面板形态 | **右下角贴角面板**（非阻断） | 居中弹窗气质仍偏临时且遮页面；右侧全高抽屉气质偏 IDE 工具栏，与右下角入口连贯感最弱 |
| 入口形态 | **48px 圆形气泡** | 药丸保留文案与 ⌘K 可发现性更好，但与贴角面板是两个物件；本轮取「标准聊天挂件」的气质，文案与 ⌘K 降级到 tooltip |
| 历史寿命 | **收起保留，刷新清空**（组件内存） | 关闭即清空会打断多轮；跨刷新持久化需额外处理已过期的待确认卡片，收益不抵复杂度；后端会话表是另一个量级的需求 |

## 3. 形态与层级

新建 `src/components/intent/CommandPanel.tsx`。`CommandBar.tsx` 的对外契约**不变**：默认导出、`openCommandBar(initialText?)`、`registerVenueIntent()`、`OPEN_EVENT` 名称全部保留，`src/app/[locale]/(app)/expenses/page.tsx` 的调用点与 `(app)/layout.tsx` 的挂载点都不用改。

### 3.1 气泡

- 48px 圆形，`bg-primary` 实色 + 白色 `Sparkles`（`strokeWidth 1.5`，§5），`shadow-pop`，`right-5` / `bottom: calc(env(safe-area-inset-bottom, 0px) + 1.25rem)`。
- 不用 `primary-gradient`：§1.2 限定渐变仅主 CTA 按钮与进度条填充，全局悬浮入口不在其列。
- 文案与快捷键降级到 `title` + `aria-label`（「用文字操作 (⌘K)」）。§5 要求图标不单独承载语义，`aria-label` 是这条的落实而非可选项。
- 面板打开时图标换成 `X`，点击收起。
- **留在 z-30**，语义不变（内容层浮动按钮，开任何遮罩层时被压住是期望行为）。

### 3.2 面板

- `w-[420px]`、`h-[560px]`、`max-h-[calc(100vh-7rem)]`，`bottom: 5.5rem`（压在气泡上方，两者不重叠），`right-5`。
- `rounded-card`、`shadow-pop`、`border border-line`、`bg-surface`。portal 到 `document.body`。
- **z-40**。理由：贴角面板语义上是锚定在气泡上的 popover，取 40 后所有该压住它的层都自然压住——移动端抽屉 50、Modal 60、Toast 80。取保留位 70 会反向出事：`PendingActionCard` 的编辑 Modal 硬编码 z-60，会被面板盖住而不可用。
- 与页面内 popover 同层（都是 40），同屏时靠 portal 挂载顺序压对（面板挂在 body 末尾，压在页面内下拉之上）。气泡在右下角，实际重叠概率低。
- **不加遮罩、不上滚动锁**。非阻断是选贴角面板的全部意义；顺带完全避开 `src/lib/ui/scrollLock.ts` 那一类坑。
- 键盘与焦点：Escape 关闭，关闭后焦点归还气泡。**不做焦点圈定**，`role="dialog"` + `aria-modal="false"` + `aria-label`——不是 modal，圈定焦点反而是错的。这是不夸大能力的诚实子集，与 `DiscussionPanel` 同一处理口径。
- `prefers-reduced-motion` 下关闭展开/收起的位移（§4）。

### 3.3 移动端

`<768px` 退化成底部 sheet：全宽、`h-[85vh]`、`rounded-t-card`、`padding-bottom: env(safe-area-inset-bottom)`。sheet 打开时隐藏气泡（sheet 已覆盖右下角），由 sheet 头部的关闭按钮承担收起。

### 3.4 设计系统登记

`docs/design-system.md` §3 的 z-index 层级表是唯一登记处，必须在同一个 PR 里补「CommandBar 贴角面板 40」一行，并注明：与页面内 popover 同层、靠挂载顺序压对；保留位 70 仍不启用，原因是嵌套编辑 Modal 的 z-60 会被反压。

## 4. 消息流

### 4.1 数据模型

面板内部状态由单值 `result` 换成 `turns: Turn[]`：

```ts
type Turn =
  | { id: string; role: 'user';   text: string }
  | { id: string; role: 'agent';  result: ServerResult }
  | { id: string; role: 'system'; kind: 'applied' | 'cancelled' }
```

`ServerResult` 的五个 `kind`（`pending` / `query_result` / `clarification` / `venue_preview` / `error`）**原样复用**，不改后端返回结构。

`id` 用单调递增计数器生成，不用 `Date.now()`（同一毫秒内两次 push 会撞 key）。

### 4.2 行为

- 提交：先 push user turn（乐观显示），发请求，再 push agent turn。请求失败 push 一条 `kind: 'error'` 的 agent turn，与服务端错误同一渲染路径。
- **应用成功不再关面板**：`applied()` 改为追加 `system: 'applied'` 气泡 + `notifyIntentApplied()`，面板留着继续下一轮。取消同理，追加 `system: 'cancelled'`。这是当前行为里最不像对话的一处。
- 加载态：agent 侧三点 typing 动画，照 `src/app/[locale]/(app)/workspace/page.tsx` 已有那套（该文件是站内 Slack/Cursor 式扁平消息流的参照实现）。
- 空态：agent 侧一条开场白 + 3 个可点示例 chip，点击填入 composer 并聚焦（不自动发送——用户可能要改数字）。
- composer：`Textarea`（§6.2 契约：`size` 只调 `min-h`），Enter 发送 / Shift+Enter 换行，右侧发送按钮。placeholder 换成一句短的，长示例文案从 placeholder 迁到空态 chip。
- 自动滚到底：新 turn 追加后 `scrollIntoView`。
- venue scope 激活时（`registerVenueIntent` 注册了 provider），面板头部显示 `Tag variant="soft" tone="violet"` 的 scope 标记（tone 取 §1.3 的品牌语义），composer placeholder 换成场地版。

### 4.3 历史寿命

`turns` 活在组件内存里。组件挂在 `(app)/layout.tsx`，收起面板与切换页面都不重挂载，所以历史不丢；刷新页面重开一轮。不写任何存储。

## 5. 窄面板里的结果卡重排

面板 420px 宽，比原先弹窗的 672px 窄一半。两处宽表格要处理：

| 结果 | 现状 | 改成 | 依据 |
|---|---|---|---|
| `query_result` 分组表（分组/值/条数，3 列） | `Table` 撑满 672px | 保留 `Table` + `minWidth` + 外层 `overflow-x-auto` | §6.1：多列数值对比用 `Table`；`minWidth` 是 `Table` 已有的横向滚动阈值 prop |
| `clarification` 候选表（日期/名称/金额/经办人，4 列） | `Table` | 换 `RecordRow`，`payment_status` 过 `src/lib/ui/status-tone.ts` 取 tone | §6.1：记录浏览为主、每行有身份用 `RecordRow`；4 列表在 420px 里横向滚动是真的难用 |

`pending` / `venue_preview` / `error` / `EmptyHint` 已经是卡片形态，只收窄内边距，内容不动。

滚动容器内的 focus ring 要用 §4 第二配方（`ring-inset`）：消息流是 `overflow-y-auto`，`ring-offset-1` 会被裁切。

## 6. 轻上下文（后端）

### 6.1 改动

- `ParserContext` 增加可选字段 `priorTurn?: { text: string; outcome: string }`。
- `buildExtractPrompt` 与 `classifyEntity` 各增加一段「上一轮用户说 X，系统回了 Y」。**`classifyEntity` 也必须拿到**——否则「改成 350」这种紧邻追问会被实体分类器误路由。
- `/api/intent` 请求体增加 `prior?: { text, outcome }`。
- 只带**上一轮**，不带全量历史。

### 6.2 输入闸

`prior` 的两个字段跟主 `text` 走**同一道**输入闸：`normalize('NFKC')`、`CONTROL_CHARS` 清洗、长度上限（`text` 沿用 `MAX_INPUT_CHARS`，`outcome` 单独收紧到 300 字）。越界一样 `logIntentViolation`，`stage: 'input_gate'`。

### 6.3 信任边界

客户端传上来的 `prior` 是不可信输入。它**只进 prompt**，不影响任何授权判断，不绕过 executor 的字段校验和 per-op 闸门——写操作照旧走 `pending_actions` 暂存 + 显式确认。这一点在实现里写成代码注释，因为它是「为什么可以接受客户端传上下文」的唯一理由。

## 7. 文案与 i18n

新增键（`intent` 命名空间下），三语齐（`check-i18n` + `check-no-bare-han` 门禁）：

- `panelTitle`、`panelCollapse`
- `composerPlaceholder`、`composerPlaceholderVenue`
- `emptyGreeting`、`examples`（3 条数组）
- `appliedNote`、`cancelledNote`
- `bubbleLabel`（气泡 `aria-label` / `title`，含 ⌘K）

保留：`venuePlaceholder`（场地 scope 仍用长示例文案，画布操作的词汇量小、示例价值高）、`sendButtonLabel`（发送按钮 `aria-label`，composer 继续用）。移除：`modalTitle`（被 `panelTitle` 取代）、`openButtonLabel` / `openButtonTooltip`（被 `bubbleLabel` 取代）——已 grep 确认这三个键的唯一调用方是 `CommandBar.tsx` 自己。

改动是用户可感知功能，补一条 `src/lib/changelog/entries.ts`。

## 8. 明确不做

- 跨刷新持久化、后端会话表、会话列表、历史会话回看。
- 上一轮以外的完整对话历史。
- 附件 / @提及 / 斜杠命令（`workspace/page.tsx` 里那三个 `disabled` 占位按钮不搬过来——搬过来就是三个假按钮）。
- **模型不动**。查询路径换 DeepSeek 单独开一个 PR：抽共享 LLM transport（顺手消掉 `parser.ts` 与 `venue/venue-intent.ts` 里两份 `geminiJson` 拷贝）+ query/classify 换 `deepseek-chat` + env 开关可回滚 + 真实句式 A/B。已知坑记在这儿供下一轮参考：① DeepSeek 的 `json_object` 模式必须返回对象，Gemini 的 `responseMimeType: 'application/json'` 可返回裸值（`venue/translate.ts` 包 `{"result":[...]}` 就是为此）；② deepseek-chat 延迟通常高于 gemini-flash，交互式面板能感觉到；③ 相对时间推理（「Q3」「上个月」）是最脆的一环，错了不报错、只给错数字；④ 降级阶梯要重定（现在是 flash 失败重试 pro）。写操作在查询路径证明稳定前不动。

## 9. 验证

门禁：`npm run test:copy`（i18n + no-bare-han + style-tokens + lint --max-warnings=0 四合一）、`npm run test`（单测）。

> `check-style-tokens` 必须在**最后一次编辑之后**跑：注释里写 `(#123)` 形式的 PR 编号会被判成裸 hex。

实机（worktree 手动起 `npx next dev` 换端口，`preview_start` 会跑主仓）跑四条路径：

1. 查询占比（`query_result` + 分组表在 420px 里的横向滚动）
2. 新增支出：待确认 → 编辑（嵌套 Modal 压在面板之上）→ 应用 → **面板不关**、追加 applied 气泡
3. 场地改画布（面板不遮画布是本轮的新收益，要实际看到）
4. 解析失败错误卡 + 复制报错按钮

轻上下文单独验一条：先「新增差旅费 5月10日打车 320」，再「改成 350」，确认第二句被正确路由且改的是同一笔。

375px 窄屏把上面四条各跑一遍（sheet 形态、气泡隐藏、`RecordRow` 在窄屏隐藏 meta）。
