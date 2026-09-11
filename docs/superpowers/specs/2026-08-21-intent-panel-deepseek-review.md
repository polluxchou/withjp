# 「用文字操作」多轮化 + 意图解析快档换 DeepSeek — 落地复盘（PRD + 实现方案）

> 日期：2026-08-21
> 性质：**落地版**（as-built）。按实际合入 main 的代码写，与设计稿有出入处以本文为准。
> 覆盖两个已上线的 PR：
> - **PR #251**（merge `a0ffe83`）：「用文字操作」单轮弹窗 → 右下角贴角多轮对话面板 + 圆形气泡入口
> - **PR #252**（merge `7bf0cf7`）：意图解析快档换 deepseek-chat + 共享 LLM transport + 修降级不升档
>
> 前置设计文档：`specs/2026-08-20-command-panel-chat-design.md`（面板）、`plans/2026-08-20-intent-deepseek-query.md`（DeepSeek）。本文不重复其全文，只记结论、落地差异与实测数据。

---

## 1. 产品需求

### 1.1 背景与问题

改造前的「用文字操作」是一个居中 Modal 里的单轮问答：一个输入框 + 一个结果区，新结果直接顶掉旧结果；确认一笔支出后弹窗自动关闭，要操作第二笔得从头点开；「把那笔改成 350」这类指代完全不被理解。它长得像命令行，不像对话。

同期的另一条线：2026-08 生产环境 Gemini 月度额度耗尽、全线 429，意图解析整条链路瘫痪。快档调用（分类 + 查询抽取）占了大头，需要换到独立配额的供应商上，并留住跨供应商的逃生通道。

### 1.2 用户可感知的变化

- 右下角入口从「药丸 + ⌘K 角标」换成 **48px 紫色圆形气泡**（Sparkles 图标，展开时变 X）。
- 点开是 **420×560 的贴角面板**（移动端为底部 85vh 抽屉），内部是标准聊天结构：消息流（Transcript）+ 底部输入框（Composer）。
- 问答**累积成消息流**，不再互相顶掉；确认/取消一个待确认动作后**面板不再自动关闭**，卡片标记「已结算」并追加一条系统气泡。
- **轻上下文**：「改成 350」「那再加一笔」这类紧邻追问能被理解（后端只带上一轮，不带完整历史）。
- 面板收起（气泡/Escape/⌘K）**保留**本轮消息流；刷新页面清空。
- 查询、新增/修改/删除支出、场地画布改动、澄清、报错——全部结果类型都在窄面板内重排后可用。

### 1.3 决策记录（均为用户拍板）

| 决策点 | 选定 | 理由/代价 |
|---|---|---|
| 「多轮」的语义 | **视觉流 + 轻上下文** | 前端消息流 + 后端只多收「上一轮输入与结果摘要」一条。够消解紧邻指代，不做完整历史（那是另一个量级：会话表/权限/删除）。 |
| 面板形态 | **B · 右下角贴角面板** | 与入口天然连贯、不遮页面（改场地画布时能边看边改）。代价：宽表格要在 420px 内重排。 |
| 入口 | **圆形气泡** | 最像标准聊天挂件。代价：丢文案与 ⌘K 可见提示，靠 aria-label/title 兜。 |
| 历史寿命 | **收起保留，刷新清空** | 组件挂在 layout 上、内存即可，零存储成本；躲开「恢复出已过期 pending 卡」的坑。 |
| 快档默认 | **直接默认 DeepSeek** | 用户在知情（相对时间推理可能退步、错了不报错只给错数字）下选择不等 A/B 结果直接切换。`INTENT_FAST_PROVIDER=gemini` 是不改代码的回滚阀。 |
| 降级阶梯 | **deepseek-chat → gemini-2.5-pro** | 跨供应商才有意义：DeepSeek 整体抓了（频限/宕机）也能自动兑回来。代价：依赖两家。 |
| venue 解析 | **不换，留 gemini-2.5-flash** | 场地解析错会静默把画布改坏（summary 看似合理、点确认就应用）。只做 transport 去重，行为不变。 |

### 1.4 明确不做（本轮范围外）

- 完整对话历史落库（conversations 表复用）——单独立项。
- 写操作抽取、工时任务换 DeepSeek——写错了要落库，留强档。
- `modelUsed` 落库做模型级遥测——全仓当前无消费方。
- venue 解析换 DeepSeek——同一个 `llmJson`，改一行即可，但需单独评估。

---

## 2. 实现方案（落地版）

### 2.1 前端结构

`CommandBar.tsx`（439 行单文件）拆成五件，全部在 `src/components/intent/`：

| 文件 | 职责 |
|---|---|
| `CommandPanel.tsx` | 壳：气泡 + 面板 + 快捷键 + venue provider 注册表 + 对话状态编排 |
| `Transcript.tsx` | 消息流渲染（user/agent/system 三种 turn）+ 空态示例 |
| `Composer.tsx` | 底部输入（textarea，Enter 发送 / Shift+Enter 换行） |
| `ResultView.tsx` | 五种 ServerResult 的窄版卡片（由旧 CommandBar 的结果区重排而来） |
| `PendingActionCard.tsx` | 待确认卡（沿用，加 settled 态收起按钮） |

关键落地细节：

- 组件 `createPortal` 挂 body 末尾；面板取 **z-40**（下拉/popover 层），不是层级表保留位 70——取 70 会把 PendingActionCard「编辑并保存」的嵌套 Modal（硬编码 z-60）盖在面板下面直接不可用；取 40 后抽屉 50/Modal 60/Toast 80 都自然压住面板。气泡维持 z-30。
- 面板 `role="dialog" aria-modal="false"`，**不做焦点圈定**——非阻断面板圈定焦点反而是错的；Escape 收起并把焦点还给气泡。
- 移动端：面板 `inset-x-0 bottom-0 h-[85vh] rounded-t-card`；面板展开时气泡 `hidden md:grid`（窄屏上气泡会压住输入区）。
- turn id 用单调递增计数器而不是 `Date.now()`——同一毫秒 push 两条会撞 React key。

### 2.2 对话状态与轻上下文（`src/lib/intent/conversation.ts`）

可单测的纯逻辑全部下沉到 lib，组件只渲染：

- `Turn = user | agent(result, settled?) | system(applied|cancelled)`
- `outcomeSummary(result)`：把任意 ServerResult 压成一句中文摘要（只进 prompt、永不渲染，故不走 i18n），截断到 `MAX_PRIOR_OUTCOME_CHARS = 300`。
- `priorContextOf(turns)`：取最后一个 agent 回复 + 它前面最近的 user 输入，跳过 system 气泡。**在追加本轮之前派生**。
- `markSettled(turns, id)`：待确认卡结算后收起操作按钮，防同卡二次点击。

### 2.3 API 契约（`POST /api/intent`）

请求体新增可选 `prior: { text, outcome }`。信任边界：

- prior 的两段走与 text **完全相同**的清洗（`sanitizeIntentText`，NFKC + 控制字符 + 长度闸，闸逻辑抽到 `src/lib/intent/input-gate.ts` 并单测）。
- 任一段不合法 → **整体丢弃 prior 降级成单轮 + 记 `logIntentViolation`**，不让整次请求失败——上下文是增强项，不是必需项。

### 2.4 prompt 侧（`src/lib/intent/parser.ts`）

`priorHint(prior)` 注入三条 prompt（实体分类、支出抽取、工时任务），措辞收紧用途：

> 【上一轮对话】仅用于消解本句里的指代（「改成 350」「那再加一笔」「上一条」）。…如果本句自身信息完整，忽略上一轮。

### 2.5 共享 LLM transport（`src/lib/llm/`，PR #252 新增）

消掉 parser.ts 与 venue-intent.ts 各一份的重复 Gemini shim，换成：

- `json.ts`：`llmJson(model, prompt)`，`buildRequest` / `extractText` 拆成导出纯函数（两家请求体/响应形状完全不同，node --test 无网络，只有拆开才测得到）。差异表：

| | Gemini | DeepSeek |
|---|---|---|
| 端点 | `…:generateContent?key=` | `/chat/completions` |
| 鉴权 | query string | `Authorization: Bearer` |
| JSON 模式 | `responseMimeType` | `response_format: json_object` |
| 取文本 | `candidates[0].content.parts[0].text` | `choices[0].message.content` |

- DeepSeek 分支固定加 system 指令 `Output a single valid json object. No prose, no markdown fences.`——`json_object` 模式要求 prompt 里出现 "json"，现有 prompt 全是大写「JSON」而大小写官方没保证；顺带禁 markdown 围栏（`tryParse` 不剥围栏）。
- `models.ts`：`FAST_DEEPSEEK` / `FAST_GEMINI` / `STRONG_MODEL`（恒为 gemini-2.5-pro）+ `INTENT_FAST_PROVIDER` 开关。非法 env 值退回默认而不是抛。

### 2.6 模型档位（落地后的调用点全表）

| 调用点 | 档位 | 模型 |
|---|---|---|
| `classify()`（写/查分类） | 快 | deepseek-chat（默认） |
| `classifyEntity()`（支出/工时分类） | 快 | deepseek-chat（默认） |
| query 抽取首轮 | 快 | deepseek-chat（默认） |
| 写操作抽取 | 强 | gemini-2.5-pro |
| 快档解析失败的降级重试 | 强 | gemini-2.5-pro |
| `parseWorkTaskIntent()` | 强 | gemini-2.5-pro |
| venue 解析（刻意不换） | — | gemini-2.5-flash |

### 2.7 顺手修的既有 bug：降级从不升档

改造前 `extract()` 按 `kind` 推导模型（`query → flash`），降级分支复用同一个 `kind` 再调一次——所以 query 路径的「降级」其实是**再跑一遍同一个快档模型**（temperature 0 下近似确定性，等于空转），且 `modelUsed` 被硬编码报成 pro。修法：模型由调用方显式传入。换 DeepSeek 后这条降级正是设计的意义所在（从 DeepSeek 逃到 Gemini pro），必须修。

---

## 3. 验证与数据

### 3.1 自动化

- node --test **604 全绿**，新增：`conversation.test.ts`（摘要/prior 派生/结算）、`input-gate.test.ts`、`llm/json.test.ts`（9 条：两家请求体、key 不进 URL、错误信息不带 prompt、形状不符返回空串等）、`llm/models.test.ts`（7 条，含「快档候选都不等于强档」的守卫）。
- tsc / eslint / 四项 copy 门禁全绿；clean build 产出 `.next/BUILD_ID` + 204 条路由（看产物不看退出码——worktree 缺 env 时 build 退出码 0 但零产物）。

### 3.2 A/B 实测（`scripts/llm-ab-intent.mjs`，2 轮 × 9 条真实句式）

| 模型 | 分类 | 日期区间 | schema 失败 | 网络错 | p50 | p95 |
|---|---|---|---|---|---|---|
| deepseek-chat | **100% (18/18)** | **100% (18/18)** | 0 | 0 | 1171ms | 1587ms |
| gemini-2.5-flash | — | — | 0 | 18 | — | — |

**两个必须写明的水分：**

1. **Gemini 基线没拿到**——本机 `.env.local` 的 `GEMINI_API_KEY` 无效（curl 实测 400 "API key not valid"），叠加本机代理问题（见 §5）。这轮是 DeepSeek 的单边体检，不是对比。生产的 GEMINI_API_KEY 是另一个（102 天前配的，此前一直在跑），不受影响。
2. 「日期 100%」里那条「最近三个月」是加了 **±1 天容差**后过的（起点含不含当日本身歧义）；严格比对是 17/18。

覆盖面：相对时间（Q3/上月/近 N 月/年初至今/上周）× 绝对日期 × 无时间，分类与日期区间双指标。脚本只读不写，不碰 executor。

### 3.3 上线验证链

| 环节 | PR #251 | PR #252 |
|---|---|---|
| CI | 4 项全绿（copy-checks 真跑 42s，非 paths 跳过） | `mergeStateStatus: CLEAN` |
| 生产部署 | GitHub deployment `Production` @ `a0ffe83` | 同 @ `7bf0cf7` |
| 域名别名 | `mcn.agenova.chat` / `eacn.agenova.chat` 指向该部署 | 同 |
| 代码实证 | 含 `panelCollapse` 的内容哈希 chunk 在生产域名命中 | **无客户端产物可探**（纯服务端），链条止于 commit→部署→别名 |

生产 `DEEPSEEK_API_KEY` 早已配好（54 天前，venue 翻译上线时，Production+Preview），合并即生效，无需任何配置动作。

---

## 4. 运维

- **回滚**：Vercel 上 `INTENT_FAST_PROVIDER=gemini` + **重新部署**（env 在模块加载时读，改值不重部署不生效）。不用改代码。
- **成本边界**：若 DeepSeek 抓了，每条快档调用多一次失败往返后落到 gemini-2.5-pro——功能不坏，变慢变贵，看 Vercel function logs 里的 `deepseek 4xx/5xx` 识别。

### 遗留验收项（未闭环）

1. **四条端到端路径未在生产实测**（需登录 + 真实模型调用）：查询占比、新增→编辑→应用、场地改画布、「改成 350」轻上下文。最可能出问题的是最后一条（`classifyEntity` 拿到 prior 后的行为只有真实调用能证伪）。
2. 第一条生产查询后拉 `vercel logs` 确认快档真的落在 DeepSeek 上（而不是每次降级）。
3. Gemini flash 基线始终没测到——想补齐需要一个有效的本地 GEMINI_API_KEY。

---

## 5. 过程教训（已固化进脚本注释/记忆）

1. **Node 内置 fetch（undici）不认 `HTTP_PROXY`/`HTTPS_PROXY`**——curl 能通、node fetch 超时就是这个症状。
2. **但别为此装 undici ProxyAgent**：本机代理是 TLS 拦截型，经它两家都收到二进制乱码——连本来直连正常的 DeepSeek 也一起弄坏。脚本一律直连，打不通就报网络错，让人一眼识别是环境问题不是模型问题。
3. **`gh pr merge --delete-branch` 会把当前 worktree 切到 main**——连续发生两次。合并后要么切回功能分支要么清掉 worktree，否则下个会话可能直接在 main 上提交。
4. A/B fixture 的期望值要给歧义留容差（「最近三个月」含不含当日），否则统计把歧义记成模型错。
5. 报「已上线」前的链条：merge commit → GitHub deployment(Production, sha) → Vercel `target/Ready/aliases` → 域名可达 → （有客户端产物时）内容哈希 chunk 命中。纯服务端改动要明说链条止于哪一节。
