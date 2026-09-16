# 竞品监测 · 会话式查询（Ask 面板）设计

- 日期：2026-08-20
- 分支：`feat/competitor-nl-query`
- 状态：设计已确认，待写实现计划

## 1. 背景

`/competitors` 看板的数据目前**只能看，不能问**。

全局 CommandBar（`src/components/intent/CommandBar.tsx`，挂在 `src/app/[locale]/(app)/layout.tsx`）在竞品页也能唤起，但它的意图解析只覆盖三个域：支出（增删改查）、工时任务（仅新建）、场地画布（页面注册 provider）。竞品域在 `src/lib/intent/schema.ts` 里没有 entity、没有 filters、没有 executor。

后果是：在竞品页问「solulune 昨天开播了吗」，`classifyEntity` 判不出 → 落到 `src/app/api/intent/route.ts:86` 的兜底分支 → 交给**支出解析器** → 解析失败 → 弹出一段全是差旅费、薪资示例的 `parserFailed` 文案。答非所问。

`docs/competitors.md:178` 早已把「与 Agent Service 结合做自然语言查询」列为后续方向。本设计落实它，但不依赖 Agent Service。

## 2. 目标与非目标

### 目标

在 `/competitors` 页提供一个**多轮对话面板**，用自然语言回答关于竞品数据的问题，纯文字作答。

### 非目标

- 不做写操作。面板全程只读，不新增/修改/删除任何竞品数据。
- 不动现有 CommandBar。支出与工时任务的写操作链路已在生产运行，本次零改动。
- 不做答案可视化（迷你曲线、时段标尺缩略图）。纯文字。
- 不做会话持久化。见 §8。
- 不覆盖「名录/属性」类问答（团的地区/人数/开团时间）作为独立目标——但这些字段仍进上下文，因为它们是筛选维度（「日区谁涨粉最快」里的"日区"）。

## 3. 能问什么

数据底子（2026-08-20 实测）：

| 表 | 量 | 跨度 | 覆盖 |
|---|---|---|---|
| `competitors` | 34（23 主 + 11 下钻子主播） | — | 属性齐全 |
| `competitor_snapshots` | 60 条 / 9 个采集日 | 07-23 → 08-17 | 29/34 有数据，人均约 2 个点 |
| `competitor_shots` | 330 张 / 13 个截图日 | 07-29 → 08-21 | 52 张有 `stream_started_at`，40 张有 `viewer_count` |

v1 覆盖三族问题：

**B. 粉丝规模与增长**
「谁粉丝最多」「上周谁涨粉最快」「solulune 最近一次采集之间涨了多少」

**C/D. 开播作息与单场事实**
「solulune 一般几点开播」「日区谁开得最早」「solulune 昨天有没有采到截图」「上周三谁在播」「XX 最近一次采到的截图里已经播了多久」

**E. 采集健康度**
「哪些竞品数据过期了」「上次采集是什么时候」「谁还一张截图都没有」

明确答不了（无论怎么做都变不出来）：直播间 GMV / 礼物 / 带货、观众画像、视频播放量明细（`latest_videos` 只有 URL 和标题）、非 TikTok 平台、任何「为什么」类归因。

### 本设计答不了、但初稿曾经承诺过的

评审逐条对着上下文包核过，以下三个问题第一版列进了「能问」，实际上这套设计给不出正确答案。**prompt 必须明说答不了，而不是让模型自由发挥**：

| 初稿承诺 | 为什么答不了 |
|---|---|
| 「日区总粉丝量」 | 需要跨账号求和，而模型被禁止做算术；包里也没有预聚合的地区合计。**不打算补**——`region` 是人工值且实测 3/23 错标（见 §6），在一个不可靠的维度上求和，等于把不确定性洗成一个自信的数字 |
| 「哪场在线人数最高」 | 包里只有账号级的 `peakViewersAllTime`，没有逐场峰值 |
| 「XX 最近一场播了多久」 | `lastShotUptimeMinutes` 是**截图那一刻**的已播时长，是场次长度的下界，不是「这场播了多久」。措辞已相应收紧 |

后两个若确有需求，属于下一轮的数据层工作，不是 prompt 能补的。

## 4. 架构

```
AskPanel (client · /competitors 右侧抽屉)
   │  POST /api/competitors/ask   { messages, locale }
   ▼
route handler (server · 无状态)
   ├─ authGuard()                          复用 src/lib/auth/guard
   ├─ getCompetitorBoard(user.id)          复用 src/lib/competitors/service.ts:80
   ├─ buildAskContext(board, now, locale)  新增纯函数，可单测
   ├─ deepseekChat(system + 上下文包, messages)
   └─ { answer: string }
```

选定方案是**「预聚合上下文 + 模型只措辞」**：把整个竞品数据集预聚合成一份约 15k token 的结构化摘要塞进 system prompt，模型负责理解问题、挑数据、说人话。

之所以这条路在竞品域可行而在支出域不可行：竞品数据集有天然上界（34 个账号、周采指标、半自动截图），支出记录则无限增长。

**硬约束：所有数字由代码算好，模型一次算术都不做。** 涨粉差值、场次计数、时段中位数、陈旧天数全部在 `buildAskContext` 里算完。模型只做检索与措辞。这条约束同时解决了准确性和口径两个问题（见 §6）。

DeepSeek transport 自带一个 minimal shim（`src/lib/llm/deepseek.ts`），**不动** `src/lib/agents/providers.ts` 的 provider union——那个 union 绑着 DB 的 `model_provider` 枚举，为一个内部只读功能改 DB 枚举不划算。`src/lib/intent/parser.ts` 当初处理 Gemini 就是这么做的，注释里写明了理由，本次跟随。

## 5. 上下文包

`buildAskContext(board: CompetitorBoard, now: Date, locale: Locale): AskContext`

纯函数（`now` 由调用方注入，不读时钟），输出结构：

```jsonc
{
  "meta": {
    "todayTokyo": "2026-08-20",
    "displayTimeZone": "Asia/Shanghai",     // timeZoneForLocale(locale)
    "coverage": {
      "competitors": 34, "roots": 23,
      "withMetrics": 29, "metricsDays": 9,
      // 场次按 (竞品, 开播时刻) 去重。只按时刻去重会把同秒开播的两家并成一家。
      "shotDays": 13, "sessionsWithStartTime": 52
    },
    "captureNote": "主页指标为每周人工触发采集；直播截图为半自动采集，仅在人工发起时抓取。日期缺失只代表未采集，不代表未开播。"
  },
  "competitors": [
    {
      "handle": "solulune",
      "name": "Solulune",
      "region": "日本",
      // region 是建档时的人工值、从不随采集刷新，库里有实测 3/23 的错误率
      // （见 §6「地区不能裸给」）。observedLanguage 与 regionMismatch 是它的交叉校验面。
      "observedLanguage": "ja",
      "regionMismatch": false,
      "isChild": false,
      "parentHandle": null,
      "members": 12,
      "followers": {
        "latest": 246200, "on": "2026-08-17",
        "prev": 241000, "prevOn": "2026-08-10",
        "delta": 5200, "spanDays": 7,
        "confidence": "ok"                   // 快照 < 2 或 spanDays > 21 → "insufficient"
      },
      "liveHabit": {
        "slots": [{ "at": "21:30", "sessions": 5 }],
        "sessions": 7,
        "latestStartedAt": "2026-08-19T12:28:00Z",
        "confidence": "ok",                  // 窗口内无档达到 SLOT_MIN_SESSIONS → "insufficient"
        "windowDays": 14,                    // = regionRuler 的 RULER_WINDOW_DAYS
        "recentSessions": ["2026-08-19T12:28:00Z", "…"]   // 窗口内最近几场，供人核对新鲜度
      },
      "shots": {
        "total": 18,
        "capturedDates": ["2026-08-19", "2026-08-17", "…"],   // 完整列表，不截断
        "lastOn": "2026-08-19",
        "peakViewersAllTime": 934,           // 全量历史峰值，不是最近一场的
        "lastShotUptimeMinutes": 96          // 截图那一刻已播多久（场次长度的下界）
      },
      // metricsAgeDays 基于 latest.captured_on（= 最近一次采集，无论有没有读到粉丝数），
      // 与看板「待更新」徽标同源。不能用「最近一次带粉丝数的采集」——parseCount
      // 失败会写 followers 为 null 的行，两个口径会让同一屏自相矛盾。
      "health": { "metricsAgeDays": 3, "stale": false }
    }
  ]
}
```

复用现有纯函数，不重写：

| 用途 | 复用 |
|---|---|
| 开播档次 | `summarizeLiveHabit(startedAts, timeZone, minSessions)` — `src/lib/competitors/liveSlots.ts:83` |
| 档次新鲜度窗口 | `RULER_WINDOW_DAYS = 14` — `regionRuler.ts:16`（**直接 import，不另立常量**） |
| 档次证据（原始场次） | `recentSessionStarts` — `liveSlots.ts:73` |
| 周粉丝点 | `bucketFollowersByWeek` — `weekly.ts:20` |
| 看板健康度 | `summarizeBoard` / `STALE_DAYS = 7` — `summary.ts:78` |
| 天数差 | `daysBetween` — `summary.ts`（原为私有，本次导出复用，不再各写一份） |
| 已播时长 | `shotUptimeParts` — `types.ts` |
| 地区交叉校验 | `checkProfileLanguage` — `profileLanguage.ts:29` |
| 显示名回退 | `competitorName` — `summary.ts:74` |

子主播（`parent_id` 非空）作为独立条目进包，带 `parentHandle` 指回父竞品，让模型能回答「XX 团下面那个主播」。

包体积估算：34 条 × 约 400 token ≈ 14k，加 meta 约 15k。DeepSeek 命中上下文缓存后重复部分成本大幅下降，正是多轮对话的受益场景。

## 6. 口径与置信度

用户确认的策略是**混合**：硬事实直答并附口径，需要推论的卡门槛。

落地方式是把门槛判定**全部前移到 `buildAskContext`**，模型拿不到能推论的原料。

门槛有**两个维度**：样本够不够多，以及样本新不新。

| 问题类型 | 数量门槛 | 新鲜度门槛 | 不达标时 |
|---|---|---|---|
| 开播作息（"一般几点开播"） | 一档 ≥ `SLOT_MIN_SESSIONS`(3) 场 | 场次须落在最近 `RULER_WINDOW_DAYS`(14) 天内 | `confidence: "insufficient"`，`slots` 为空，只给窗口内的 `latestStartedAt` |
| 涨粉（"涨了多少 / 涨得快不快"） | ≥ 2 个快照 | 两点相隔 ≤ `FOLLOWERS_MAX_SPAN_DAYS`(21) 天 | `confidence: "insufficient"`，`delta`/`prev`/`spanDays` 仍照给（硬事实），但禁止用于比较 |
| 某天是否有截图 | 无门槛，硬事实 | — | 直接查 `capturedDates` |
| 采集健康度 | 无门槛，硬事实 | — | 直接给 `metricsAgeDays` |

**新鲜度这一维是评审补回来的，不是原设计里就有的。** 第一版只卡了场次数量，结果半年前连播三场、之后再没播过的账号照样拿到 `confidence: "ok"` 的开播档次——而同一张卡片上的「同地区标尺」因为有 14 天窗口，对这个账号什么都不显示。同屏两处对同一件事给出矛盾结论。窗口常量因此**直接 import `regionRuler.ts` 的 `RULER_WINDOW_DAYS`**，而不是另立一个同值常量，让两者在构造上不可能跑偏。

阈值取值都对着生产库量过，当下都是零代价、只在数据真放旧时才收紧：44 场直播全在最近 3 天内，「≥3 场」的账号数在 14/30/全量三个窗口下都是 7 个；21 个有 ≥2 快照的账号最大跨度 7 天。

### 地区不能裸给

`region` 是建档时的人工值、从不随采集刷新。`migrations/20260819000000_competitor_snapshot_language.sql` 记着一次真实事故：23 个顶层竞品全被填成 `JP`，其中 3 个其实是韩国团，错了一个月没人发现。UI 早就为此加了 `checkProfileLanguage` 交叉校验和不一致徽标。

所以上下文包里 `region` 必须与 `observedLanguage`、`regionMismatch` 同行下发。否则「哪几个是韩国团」会得到一句流畅、自信、错误、且提问者无从核对的回答——与数字类失效模式同源，只是载体是分类值。

system prompt 中的对应规则：

1. `confidence: "insufficient"` 的字段**禁止**用于任何比较、排序或趋势结论；只能如实说明「样本不足」。
2. 涉及「某天/某段时间有没有开播」的问题，只能回答「有/没有采到截图」，**禁止**推断开播与否。`capturedDates` 是完整的已采集日期列表，缺席只意味着未采集。
3. 不做任何算术。所有数字必须从上下文包中原样引用。

### 这条防线的真实软肋

规则 2 无法用自动化测试兜死——LLM 输出不确定，跑真实 API 的断言过于脆弱。可测的是 `buildAskContext` 一定把完整 `capturedDates` 和 `captureNote` 放进包里（单测覆盖）；规则本身只能靠 prompt 约束 + 人工验收。

这是本方案的已知弱点，如实记录。tool-calling 方案在这一点上没有实质优势——它同样靠 prompt 约束措辞。

## 7. 时区与日期口径

仓库里存在**两套日期日历**，这是既有事实，必须在设计里处理而不是忽略：

- `competitor_shots.shot_on` — 按 **Asia/Tokyo** 业务日落库（`scripts/live-watch/record-live-shot.mjs:34`，`SHOT_TZ = 'Asia/Tokyo'`，注释说明竞品全是日区团播）
- `competitor_snapshots.captured_on` — 按 **UTC** 落库（`scripts/record-competitor-snapshot.ts:48`，`new Date().toISOString().slice(0,10)`）

本设计的口径：

**日期比较用 Asia/Tokyo。** 「昨天」「上周三」这类问题落在截图上，而 `shot_on` 就是按东京业务日分的桶，用别的日历比较会在午夜前后错一天。`meta.todayTokyo` 由 `Intl.DateTimeFormat` 以 `Asia/Tokyo` 从注入的 `now` 算出——**不能用 `todayLocal()`**（`src/lib/competitors/localDate.ts`），那读的是运行环境时钟，在 Vercel 上是 UTC。

**钟点显示用界面语言时区。** 复用 `timeZoneForLocale(locale)`（`src/lib/time/localeZone.ts`）：zh→Asia/Shanghai、ja→Asia/Tokyo、en→America/Los_Angeles。这正是 `summarizeLiveHabit` 的 `timeZone` 参数的既定用法。该文件的注释已明确区分「显示时区跟界面语言走」与「归档日期列不随语言变」，本设计与之一致。

于是「昨天」是按东京业务日算的昨天，「21:30 开播」是按你界面语言时区显示的 21:30。两者都在包里给全，`meta` 里写明约定，prompt 中不留猜测空间。

**已知既有不一致，不在本次范围**：两个采集脚本用了不同日历。对周级粒度的粉丝问题误差 ≤1 天、无实际影响；但这是笔技术债，值得单开一个 PR 统一到 Asia/Tokyo。本设计只做适配，不做修正。

## 8. 会话与 UI

**入口**：`/competitors` 页右侧抽屉。触发按钮放在 `CompetitorSummaryBar` 一侧。不占据看板空间，可一边看板一边问。

**会话状态只在前端组件 state 中**，不落库、不进 localStorage。关闭面板即清空。

理由：v1 不需要跨设备/跨会话回看，落库要引入会话表 + RLS + 清理策略，成本远大于收益。这是一个可以推翻的决定——若后续需要「上次问过什么」，再加表不迟。

**每轮把完整 `messages` 数组发给后端，后端无状态。** 历史上限 20 条消息，超出丢弃最早的用户/助手对（system prompt 与上下文包始终保留）。防止长对话把 token 顶穿。

**面板状态**：空态（给 3 个示例问题）、发送中、答案流、错误态。答案为纯文本，按段落渲染，不做 markdown 富渲染。

## 9. 模型与成本

DeepSeek（用户既定偏好：性价比 + 中文措辞自然 + 自带硬盘上下文缓存）。

- transport：`src/lib/llm/deepseek.ts`，OpenAI 兼容协议，`baseURL` 与 API key 走环境变量（`DEEPSEEK_API_KEY`、可选 `DEEPSEEK_BASE_URL`）
- **不变的前言与规则块在前，会变的上下文包在后**，最大化缓存命中
- 未配置 API key 时，端点返回明确错误而非 500，面板显示「对话功能未配置」

初稿这一条写反了，说的是「上下文包放在固定前缀位置」。DeepSeek 命中的是**前缀**缓存，所以该固定在前面的是每轮、每语言、每会话都一样的前言与规则块；上下文包随数据变化，放在末尾才不会让整个前缀失效。实现是对的，是规格措辞错了。

同理，语言指令必须放在**上下文包之后**：夹在规则和包之间会让三种 locale 从规则块之后就分叉，白白拆掉共享前缀。

`DEEPSEEK_BASE_URL` **禁止携带内联凭据**。undici 会在构造请求时拒绝带 userinfo 的 URL，并把完整 URL（含明文密码）放进错误信息，而该信息经由面板的「复制报错」按钮直达用户。transport 层已同时做了前置校验与脱敏。

不设调用配额。这是内部后台，用户基数小；若后续出现滥用再加。

## 10. i18n

面板 UI 文案进 `messages/{zh,en,ja}.json` 的 `competitors.ask.*` 命名空间，三语同步。

答案语言由 prompt 按当前 locale 指定（「用简体中文回答」/「Answer in English」/「日本語で答えてください」）。

## 11. 错误处理

| 情况 | 表现 |
|---|---|
| 未登录 | `authGuard` 返回 401，面板不渲染（页面本身已鉴权） |
| DeepSeek key 未配置 | 200 + `{ error: 'not_configured' }`，面板显示配置提示 |
| DeepSeek 超时/报错 | 200 + `{ error: 'upstream' }`，面板显示可重试提示，附「复制报错」按钮（沿用 CommandBar 的做法） |
| 看板取数失败 | 沿用 `httpStatusForError` |
| 消息为空/超长 | 400 |

## 12. 测试策略

**单测（`node --test`，与仓库现有 `src/lib/competitors/*.test.ts` 同构）**

`ask-context.test.ts` 覆盖：
- 置信度门槛：1 个快照 → `followers.confidence === 'insufficient'` 且 `delta === null`；2 场开播 → `liveHabit.confidence === 'insufficient'` 且 `slots` 为空
- `capturedDates` 完整且不截断，`shot_on` 为 null 的截图不进列表
- `meta.captureNote` 始终存在
- `meta.todayTokyo` 由注入的 `now` 按 Asia/Tokyo 计算——用一个 UTC 15:30（= 东京次日 00:30）的时刻断言跨日正确
- 钟点按 `locale` 切换时区：同一 `stream_started_at`，zh 与 ja 得到相差一小时的 `at`
- 父子结构：子主播独立成条目并带 `parentHandle`
- 空看板 / 全无数据的账号不抛异常
- 新鲜度门槛：场次全在 14 天窗口外 → `slots` 为空且 `insufficient`；两快照相隔 309 天 → `insufficient`
- 未来时刻的脏数据被排除，不会变成 `latestStartedAt`
- `health.metricsAgeDays` 跟随 `latest.captured_on`，而不是「最近一次带粉丝数的采集」
- `delta === 0`（真持平）与 `null`（未知）可区分
- `regionMismatch` 的 true / false 两侧
- 两个竞品同秒开播时 `sessionsWithStartTime === 2`

**入参顺序无关性必须显式断言。** 打乱 `shots`/`history` 的顺序后，`capturedDates`、`lastOn`、`followers.latest`、`lastShotUptimeMinutes` 都不得改变。这条是评审用可运行探针打出来的教训：原实现依赖「`shots` 已按 `shot_on` 降序」，但 `shot_on` 只精确到天，同一天内的次序取决于未指定的库行序（两条写入路径的 `sort_order` 都硬编码 0，查询也没有 `ORDER BY`），同一场直播的两张截图能让「上一场播了多久」在 40 分钟和 200 分钟之间摇摆。凡是依赖调用方排序的聚合，都要么本地重排、要么按字段取极值——并用双向顺序的测试钉死。

**不测**：LLM 输出内容本身。

**人工验收清单**（写进 PR 描述）：
- 「solulune 昨天开播了吗」→ 答案必须是「有/没有采到截图」措辞，不得出现「没有开播」
- 「谁涨粉最快」→ 只在有 ≥2 个快照的账号间比较，样本不足的账号必须被点名排除而非静默忽略
- 「XX 一般几点开播」（一个只播过 1 场的账号）→ 必须说样本不足
- 三语各问一句，确认答案语言与钟点时区都对

## 13. 文件清单

```
新增
  src/lib/competitors/ask-context.ts        上下文包纯函数
  src/lib/competitors/ask-context.test.ts   单测
  src/lib/competitors/ask-prompt.ts         system prompt 组装（含 §6 三条规则）
  src/lib/llm/deepseek.ts                   minimal transport shim
  src/app/api/competitors/ask/route.ts      无状态 chat 端点
  src/components/competitors/AskPanel.tsx   右侧抽屉

修改
  src/app/[locale]/(app)/competitors/page.tsx   挂载面板
  src/components/competitors/CompetitorSummaryBar.tsx   触发按钮
  messages/zh.json / en.json / ja.json          competitors.ask.*
  src/lib/changelog/entries.ts                  更新日志条目
```

## 14. 已知限制

1. §6 的措辞规则无法自动化验证，依赖 prompt 与人工验收。
2. 上下文包体积随竞品数与截图数线性增长。当前约 15k token；截图涨到约 3000 张时需要改为按需摘要或转 tool-calling。触发阈值建议定在包体 30k token。
3. 快照数据太薄（9 个采集日、人均 2 个点），「趋势」类问题在多数账号上只能给两点差值。这是采集频率问题，不是本功能能解决的。
4. 两个采集脚本日历不一致（§7），本次只适配不修正。

## 15. 后续方向

- 答案带「在看板中查看」跳转（复用 `anchors.ts` 的锚点机制）
- 结构化答案卡（迷你曲线 / 时段标尺缩略）
- 若数据规模突破 §14.2 的阈值，转 tool-calling
- 统一两个采集脚本的日期日历
