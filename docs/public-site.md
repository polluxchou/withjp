# EchoAmp 公会官网（对外站）

更新时间：2026-08-13
适用范围：`src/app/[locale]/site`、`src/components/site`、`src/lib/site`、`src/app/api/site`
状态口径：**已实现** = 代码在仓库里且实测通过；**进行中** = 部分落地；**规划中** = 只有设计或计划

设计权威（视觉细节与逐条决策）：`docs/superpowers/specs/2026-08-11-echoamp-public-site-design.md`
本文件是需求与技术实现的总览，接手时先读这一份。

---

## 1. 这是什么

WithJP 至今只有登录后可见的内部经营后台。官网是仓库里**第一个对外公开面**：不需要登录，面向公司外部的人，讲清楚「EchoAmp 是谁、做什么、怎么加入、怎么合作」，并直接承接应募投递。

两者共用一个 Next.js 应用与一次部署，但**视觉体系、内容来源、访问权限完全分开**。

| | 内部后台（WithJP） | 对外官网（EchoAmp） |
|---|---|---|
| 受众 | 公会内部 PMO / 运营 / 财务 / 管理层 | 关西应募者（主）、日本法人客户（次） |
| 访问 | 必须登录（Supabase 会话） | 完全公开 |
| 视觉 | 紫罗兰浅色、圆角卡片、无衬线 | 纯黑/浅灰、零圆角、明朝体 + 压缩体 |
| 内容来源 | Supabase 业务数据 | i18n 文案（唯一例外是应募投递写库） |
| 语言 | zh / en / ja | zh / en / ja（日文为主语气） |

品牌身份：**EchoAmp OSAKA** —— **TikTok LIVE Creator Network**，办公室与配信工作室在新大阪，旗下女子团体企划 **MOONDOLLZ**（双队长制，AYATSUKI／YUKIHA + 12 位成员，其中 8 位已定形象）。

> **口径注意（2026-08-13 起）**：对外一律称 **Creator Network**，不再用「公认公会 / OFFICIAL GUILD / 公認ギルド」——这一轮已把 meta 标题、页脚、TIKTOK LIVE 页引言等处全部换掉。同理，差异化能力的说法从「日本国内几乎是空白领域」「EchoAmp 唯一的差异化资产」收敛为「案例尚少」「独有的差异化领域之一」：在日本，对外话不能说太满。内部后台（`(app)` 路由）仍在用「公会」措辞，那是对内系统，不在此约束内。

---

## 2. 需求

### 2.1 业务目标

| 目标 | 怎么衡量 | 当前支持 |
|---|---|---|
| 招募转化 | 应募投递数（后台「官网应募」页可见） | 已实现 |
| 品牌可信度 | 事业线、技术差异化（着ぐるみ配信）、企划与成员可对外展示 | 已实现 |
| 法人合作入口 | CONTACT 页按合作类型分区，带联系方式与合作方信息 | 已实现 |

**刻意不追求**：搜索流量规模、高频内容更新、营销自动化。这一轮官网是「公会的名片 + 招募入口」，不是内容运营阵地。

### 2.2 受众与语言

日文是主语气（目标受众是关西应募者与日本法人），中文与英文是**等价的完整版本**而不是降级翻译。

两套内容来源、两套「等价」口径并存（2026-08-14 起）：

- **i18n 文案**（`messages/{zh,en,ja}.json`）：三语共用同一套结构，任一语言缺内容都会被 `check-i18n` 拦下——这条仍适用于 VISION / TIKTOK LIVE / SERVICES / RECRUIT / CONTACT 等页面。
- **库内容**（`site_news`、`site_members`，2026-08-14 起两张表都已改读库）：口径改成**日语必填、中英回退**——`title_ja`/`lead_ja`/`body_ja`（news）与 `specialty_ja`（members，已公开卡位）有数据库 not-null/check 约束，`zh`/`en` 列可以为空，页面渲染时用 `pickLocaleText`（`src/lib/site/i18n-content.ts`）回退到日语，而不是三语强制等长同形。这不是降级：后台表单三语字段都能填，只是「暂时没翻译」不再是构建时的硬门禁，而是运营可以先发日语版、之后再补的正常状态。成员的 `name_zh` 是这条口径下的一个特例：多数成员 zh 与 ja 是同一个词的繁简变体，但 3 号 LULU 的 zh「露露」（汉字）与 ja「ルル」（片假名音译）是两种不同的书写系统，不是同一字的简繁差异——所以 `name_zh` 单独建列，不能靠 `pickLocaleText` 回退到 `name_ja` 兜底。

应募者用哪种语言投递会被记录，方便运营用对语言回复。

### 2.3 功能需求

| 页面 | 路由 | 访客能做什么 | 内容来源 |
|---|---|---|---|
| TOP | `/[locale]/site` | 了解定位、看最新三条动态、跳转各板块与应募 | i18n（LATEST 三格读库） |
| NEWS | `…/news` | 按分类筛选动态、点进文章 | 库（`site_news`） |
| NEWS 详情 | `…/news/[slug]` | 读完整文章、从文末直接去应募 | 库（`site_news`） |
| VISION | `…/vision` | 理解团队愿景与四个目标（专辑／基地／13 人／成长周期）、看双队长与 12 位成员 | i18n（宣言/年代/团体性格/双队长）+ 库（12 位成员读 `site_members`，2026-08-14 起，见 §3.6.2） |
| TIKTOK LIVE | `…/live` | 查看从训练到开播的阶段计划、了解开播平台 | i18n |
| SERVICES | `…/services` | 了解四条事业线与着ぐるみ技术细分 | i18n |
| RECRUIT | `…/recruit` | 读募集要项与待遇口径、**提交应募**、看办公室位置 | i18n + 写库 |
| CONTACT | `…/contact` | 按合作类型找到对应联系方式 | i18n |

全局能力：三语切换（停留在当前页）、深浅主题切换（记住选择）、顶栏 logo 悬停的三角幕、窄屏抽屉导航。

### 2.4 非功能需求

- **免登录**：middleware 放行 `/site`，公网可直达
- **ISR**（2026-08-14 起，NEWS 三页与 VISION 成员网格由「静态优先」改为 ISR）：`site_news` 页面（TOP 的 LATEST 三格、NEWS 列表、NEWS 详情）与 VISION 页均设 `export const revalidate = false`——首次访问渲染后无限期缓存，后台改动通过 `revalidatePath` 按需失效（`src/lib/site/news-service.ts` 的 `revalidateNewsPages`、`src/lib/site/members-service.ts` 的 `revalidateMemberPages`，后者逐 locale 打 `/${locale}/site` 与 `/${locale}/site/vision` 两条路径），不是每次请求都查库。NEWS 详情页 `generateStaticParams` 在构建期查一次已发布 slug 做预渲染；查不到库时不让整个 `next build` 失败，退化为「不预生成、请求时动态渲染」（见页面里的 `try/catch` 与 warn，以及 §5 的部署后确认步骤）。其余页面（TIKTOK LIVE/SERVICES/RECRUIT/CONTACT）仍是纯 i18n 静态预渲染，不受此影响
- **数据库故障不影响官网可读**（Task 10 起 NEWS 三页、Task 12 起 VISION 成员网格读库后都核对过这条口径）：`site_news` 查询失败时，NEWS 列表页降级为空列表（沿用「该分类下暂无内容」的展示态）、首页跳过整个 LATEST 区块、详情页当查不到处理（404）；`site_members` 查询失败时，VISION 页降级为 12 个「未公开」占位卡位（`src/lib/site/content.ts` 的 `membersFromQuery`，复用 `buildMembers` 对缺行的处理），不会因为成员查询失败拖垮宣言/年代/团体性格等同页其它区块。以上各处都不会让页面整体 500，但也不会静默：真实查询故障统一走 `console.error` 上报（news 见 `articlesFromListQuery`/`articleFromSingleQuery`，members 见 `membersFromQuery` 的 `onQueryError` 回调），与「文章确实不存在/已下架」「成员确实还没公开」这类正常状态区分开，不能在日志里长得一样
- **响应式三档**：≥1024 照设计稿、768–1023 降列、<768 单栏 + 抽屉
- **可访问性**：装饰性图层 `aria-hidden`、示意图 `role="img"` + 说明、遵循 `prefers-reduced-motion`、强调色在两套主题下都保证正文对比度（浅色主题把亮青换成深青）
- **隐私最小化**：只收招募必需字段；不存原始 IP（只存加盐哈希，用途仅限限流）；收集前必须明示同意
- **反垃圾**：公开写接口必须能扛住无脑投递

### 2.5 本轮明确不做

- 排班的**后台可编辑化**（现在改内容 = 改 i18n 文案 = 发一次版）。NEWS 与成员均已做（后台 CRUD + 官网读库，见下方「内容与三语」§3.6.2）
- 应募的**状态流转与导出**（后台只读）
- CDN、robots/sitemap、埋点与营销工具
- 应募数据的自动清理策略（保留期限待产品侧定）

---

## 3. 技术实现

### 3.1 落点与鉴权

官网挂在 `/[locale]/site` 下，与内部后台的 `(app)` 路由组平级但不共享 layout。`src/middleware.ts` 的 `PUBLIC_PATHS` 增加了 `/site`，因此不走 Supabase 会话检查 —— 这是它能被公网访问的唯一开关。

生产官网域名为 `eacn.agenova.chat`，middleware 按 `host` 做路由隔离：

- `/`、`/news`、`/recruit` 等干净路径内部 rewrite 到 `/ja/site/*`，浏览器地址不暴露 `/site`
- `/zh/*`、`/en/*` 映射到对应语言；无语言前缀时默认日文
- 旧式 `/[locale]/site/*` 链接永久重定向到干净路径，兼容仓库内既有 next-intl 链接
- 只放行 `/api/site/applications`；后台页面和其他 `/api/*` 在官网域名统一返回 404
- `mcn.agenova.chat` 与 Vercel Preview host 不进入这套分支，继续走原有 i18n 与 Supabase 鉴权

### 3.2 设计面隔离（关键）

内部后台有 `check-style-tokens` 门禁：禁裸 hex、禁数字阶灰、禁给固定透明度 token 加 `/N`。官网是完全不同的视觉体系，但**必须在同一套门禁内实现**，做法是新开一个 token 命名空间：

- 变量定义在 `src/app/globals.css`（门禁白名单内），前缀 `--site-*`
- 映射登记在 `tailwind.config.ts` 的 `colors.site`，组件里只写 `bg-site-panel`、`text-site-fg/78` 这类 token 类名，零裸 hex
- 后台不读 `--site-*`，官网不读 `--ink-*`/`--primary-*`，两侧改动互不波及

关键设计：`--site-fg` 存的是 **RGB 三元组**而不是颜色值，因此透明度阶梯（`/78` 正文、`/68` 卡内说明、`/60` 次级、`/40` 页脚）可以用 Tailwind 的 `/N` 修饰符表达，**换主题时整条阶梯自动翻转**。这也是浅色主题只需覆盖一组变量就成立的原因。

刻意**不**跟随主题翻转的三组：`--site-hot`（TikTok 红，红底白字在两种底色下都成立）、`--site-on-hot` / `--site-on-accent`（实底之上的文字色）、`--site-map-*`（示意图是「图纸」构件，两套主题下都保持深色）。

### 3.3 主题实现

- 值落在 `<html data-theme>`，`:root[data-theme='light']` 覆盖变量
- `src/lib/site/theme.ts` 导出 `THEME_INIT_SCRIPT`，内联在 site layout 顶部，**在首次绘制前**打上属性 —— 否则选了浅色的访客每次进站都会先闪一帧纯黑
- 优先级：本地选择 > 系统偏好 > 深色
- 组件里没有任何 `dark:` 变体，全靠变量

### 3.4 字体

- 拉丁族 Barlow / Barlow Condensed 用 `next/font/google` 自托管（英文标题与全部大写标签靠它们定调）
- **和文明朝/黑体走系统栈，不下载**：Noto Serif JP / Noto Sans JP 在 Google Fonts 上被切成上百个 unicode-range 分片，构建时逐个抓取会拖死构建，全量自托管也是数 MB 的首屏负担。改用 `"Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif` —— 日本用户的 Mac/iOS 上是 Hiragino Mincho、Windows 上是 Yu Mincho，本机装了 Noto 则优先用 Noto

### 3.5 组件分层

`src/components/site/` 全部是展示层，纯函数式、单一职责；有交互的标注 client。

| 层 | 组件 |
|---|---|
| 框架 | `SiteHeader`(c)、`SiteFooter`、`SiteSection` |
| 结构母题 | `HairlineGrid`（1px gap + 底色 = 分隔线）、`BlueprintFrame`（四角 corner ticks）、`SectionHead`（编号 eyebrow + 标题） |
| 控件 | `SiteButton`、`LocaleSwitch`(c)、`ThemeToggle`(c) |
| 内容块 | `NewsRow` / `NewsCard`、`NewsFilter`(c)、`ScheduleTable`、`MemberCard`、`StatGrid`、`ContactSection`、`SiteImage` |
| 氛围 | `Ticker`、`PulseDot`、`LogoVeil`(c)、`StudioMap` |
| 表单 | `ApplicationForm`(c) |

纯逻辑与数据形状在 `src/lib/site/`：`nav.ts`（导航与激活判定）、`news.ts`（库行 → 文章模型的映射，`buildArticle`/`buildArticles`/`findArticle`，不含查库；查库在三个页面组件里）、`news-sort.ts`（`sortNews`/`publishedOnly`/`isValidNewsSlug`）、`i18n-content.ts`（`pickLocaleText` 三语回退）、`contact.ts`（联系分区与 CTA 解析）、`content.ts`（i18n 数组的类型）、`theme.ts`、`locale-menu.ts`、`application.ts`（校验与反垃圾）、`application-service.ts`（限流/落库/通知）。**带分支的逻辑都有 node:test 单测**。

### 3.6 内容与三语

`check-no-bare-han` 禁止 JSX 里出现汉字（日文汉字同样命中），所以**所有文案必须走 i18n** —— 这条门禁顺带保证了三语不会漏翻。

- 命名空间 `site.*`，三份文件 `messages/{zh,en,ja}.json`
- 列表型内容用数组：排期、事业线、VISION 四格、CONTACT 分区、跑马灯。**NEWS 与成员是例外**（2026-08-14 起）：`site.news.articles[]`、`site.members.list[]` 均已删除，文章内容全部在 `site_news` 表里、8 位已公开成员的姓名/特长全部在 `site_members` 表里，分别见下方 §3.6.2 / §3.6.3
- `check-i18n` 会把数组展开成 `key[index]` 做三语 parity，因此仍在 i18n 里的**三语数组必须等长同形**，少一行都会失败——这条规则不再适用于 NEWS 与成员
- 页面用 `t.raw()` 读数组，类型统一声明在 `src/lib/site/*.ts`，不在页面里各写各的 `as any`

**「什么写在 i18n、什么写在代码」的分界（2026-08 这一轮定型，NEWS/成员除外见 §3.6.2 / §3.6.3）**：

- **文案在 i18n，资源路径与不随语言变化的属性在代码**。图片路径不需要翻译，塞进三份 message 文件只会被译歪，也过不了 parity 的意义检查。既有落点：`contact.ts` 的 `BRAND_LOGOS`、`services.ts` 的媒体清单、`vision/page.tsx` 的 `CAPTAIN_IMAGES`
- **字段名要跟着语义走**。排期表第三列原来叫 `cast`（出演单元），改成阶段计划后装的是 `STYLE SETUP` 这类阶段标签，字段一并改名 `focus` —— 留一个名字骗人的字段，下一个接手的人会照错的语义去用

### 3.6.2 NEWS 改读库（2026-08-14）

`site.news.articles[]`（i18n 数组）已删除，NEWS 的列表 / 详情 / 首页 LATEST 三格全部改读 `site_news` 表（`supabase/migrations/20260814112723_site_content.sql`，Task 7 建表、Task 8 一次性搬迁真实内容、Task 9 建后台 CRUD）。

- **图片**：`image_url` 列，两种取值形态并存——搬迁进来的 5 篇沿用仓库里的静态路径（`/site/*.webp`），后台新上传的是 `site-media` 桶的公开 URL。`null` 时 `SiteArticle.image` 为 `undefined`，`SiteImage` 渲染占位框，不用别的文章的图顶替
- **CTA 行为**：文末「去应募」按钮只在 `category === 'recruit'` 的文章出现（上游 PR 197 的行为），`category` 现在是 `site_news.category` 列，不再是 `news.ts` 里的常量——迁移这条时漏掉这一列会直接丢失已上线的行为，`shouldShowNewsApply(category)` 判定逻辑本身不变
- **下架**：`is_published = false` 的文章不出现在列表/首页，详情页直接 404（不是软删，内容还在库里）
- **三语回退**：`ja` 必填（数据库 check 约束），`zh`/`en` 缺失时 `pickLocaleText` 回退到 `ja`——比 i18n 数组的「三语等长同形」宽松，配合 §2.2 的口径调整
- **ISR**：见 §2.4
- **查询失败的降级**：`src/lib/site/news.ts` 的 `articlesFromListQuery`/`articleFromSingleQuery` 把「查询结果（含 error）→ 该渲染什么」这层决策从页面组件里拆出来——纯函数、不做 IO，所以能用 `node:test` 直接断言降级行为，不用起 next dev server。页面组件只负责发起查询、把 `{ data, error }` 交给这两个函数、并在 `onQueryError` 回调里做真正的 `console.error`（带上文件名前缀和 slug/locale 等上下文）。`.single()` 查询命中 PostgREST 错误码 `PGRST116`（无行/多行）时不算故障，不上报——那是「查不到/已下架」的正常路径
- **上线前置**：见 §5

### 3.6.3 成员改读库（2026-08-14）

`site.members.list[]`（8 位已公开成员）、`site.members.note`、`site.members.unrevealedRole` 三个 i18n key 均已删除，VISION 页的 MEMBERS 网格改读 `site_members` 表（同一张迁移表，Task 7 建表、Task 8 一次性搬迁真实内容、Task 11 建后台配置页）。双队长（`site.members.captains`）与 UI 标签（`eyebrow`/`title`/`sub`/`placeholder`/`unrevealedName`/`unrevealedScheduleUnknown`）仍在 i18n——这些不是 12 个卡位各自的内容,不用挪。

- **12 个卡位固定**：`site_members.no`（1–12）与 `MEMBER_SLOTS` 常量（`src/lib/site/content.ts`）两处必须一致，`buildMembers` 把查询结果补齐到 12 张卡，缺行（查询降级、异常数据）与显式 `is_revealed: false` 同等处理——都渲染成「未公开」占位卡，不让网格缺角
- **姓名拆两列**：卡片主标题是 `name` 列（罗马字，如 `KANO`，不分语言），卡片副标题的「姓名／特长」由 `name_ja`/`name_zh`/`name_en` + `specialty_ja`/`specialty_zh`/`specialty_en` 按 `pickLocaleText` 取值后拼接（ja/zh 用全角「／」、en 用半角" / "，与 `scripts/seed-site-content.mjs` 的拆分规则互为逆操作，两处必须同步）。`name_zh` 不能靠回退 `name_ja` 省掉——3 号 LULU 的 zh「露露」（汉字）与 ja「ルル」（片假名音译）是两种不同的书写系统，不是同一字的简繁差异,这是这一列存在的全部理由
- **未公开卡位的展示时间**：不再用全局写死的 `unrevealedRole`/`note`，改成每行自己的 `expected_reveal_on` 格式化成 `YYYY-MM`；正常 seed 的 9–12 行都带 `2026-12-01`，读到 `NULL`（异常历史数据）或整行缺失时才落到 `unrevealedScheduleUnknown` 兜底，不能显示空字符串
- **ISR**：见 §2.4
- **查询失败的降级**：`src/lib/site/content.ts` 的 `membersFromQuery` 把「查询结果（含 error）→ 该渲染什么」这层决策从页面组件里拆出来——纯函数、不做 IO，能用 `node:test` 直接断言（`content.test.ts`）。查询失败时降级为 12 个「未公开」占位卡位（复用 `buildMembers` 对缺行的处理），不让 VISION 整页 500；真实故障经 `onQueryError` 回调交给页面组件 `console.error` 上报
- **上线前置**：见 §5（部署门槛已扩展到覆盖成员，不再只是 NEWS）

### 3.6.1 内容模型：从占位稿到真实资料（2026-08-13）

首屏、VISION、TIKTOK LIVE、NEWS、CONTACT 的文案在这一轮全部从设计稿阶段的占位内容换成了可对外的真实资料。几条与实现相关的结论：

| 位置 | 变化 | 实现要点 |
|---|---|---|
| NEWS | 4 篇占位稿 → 5 条真实新闻 | slug 按内容重命名（不用日期或下标：日期会改、下标会因插入新文章整体位移，两者都会让已发出的链接失效）。旧 slug 直接 404，占位稿本来没对外发布过 |
| 首页三格 | `2027 / 04 / 08–12` → `2026.09 / 2026.11 / 2027.03` 时间线 | 值渲染在 32px Barlow Condensed 里，**用拉丁/数字而非 CJK**：CJK 会掉到 Hiragino 回退字体，和同排其他格不同字面 |
| VISION 页 | 大阪霓虹设计史 → 团队愿景四格 | 沿用原有 `value + title + body` 结构，没动组件网格；新增 `statement`（信念句）单独成段，塞进 `lead` 会读丢 |
| 首页 VISION 区块 | 霓虹历史 → 与详情页同一套叙事 | 卡片标签直接取详情页 `eras` 的 `value`/`title`，正文再压缩一层。此前两边讲的是两件事，点「READ MORE」会对不上 |
| TIKTOK LIVE 排期 | 每晚曜日节目表 → 训练到开播的阶段计划 | 表头 `CAST` → `FOCUS`；第一列宽度从 `0.6fr` 改固定 `118px`（按三字母曜日分只有 72px，`DAY 11–15`／`TIME SLOT` 会被挤断成两行） |
| CONTACT | 撤掉两位代表的个人姓名 | 对外只留公司主体信息。测试从「断言姓名等于某值」改成「断言任何语言下都不出现代表行或这两个姓名」 |
| 地址口径 | 难波／中央区难波／新大阪 三处不一致 → 统一新大阪 | 运营公司地址、页脚、TIKTOK LIVE 页引言。注意**大阪没有「新大阪区」**，新大阪是淀川区内的地名，写「大阪市淀川区新大阪」或「大阪・新大阪」 |

### 3.7 图片

设计项目里的真实主视觉压缩后入库 `public/site/`（webp）：主视觉、群像、两位队长肖像、8 张成员卡。全部经 `next/image` 引用并给显式 `sizes`，首屏两张 `priority`。

2026-08-13 这一轮补齐的素材：NEWS 四条配图（新大阪站实景、六人剪影群像、3×3 表情参考、三方 logo 并排）、Chiron 官方标识、SERVICES 制作实拍、TIKTOK LIVE 的 ON AIR 竖屏合照、VISION 页大阪夜景。压缩一律走 `cwebp`，按实际显示尺寸的 2–4 倍出图（例：显示宽度不到 120px 的标识出 384px 即可，7.5KB）。

尚无实拍素材的位置渲染蓝图占位框 + 说明文字，不留空洞；未公开的 4 位成员同理。

**几条踩过坑的经验**：

- **竖版图不要塞横版盒子**。ON AIR 那张 9:16 合照按 `aspect-[1080/1768]` + `max-w` 给比例，直接塞进原来的横盒子会被 `object-cover` 裁成中间一条、脸全在框外
- **真实照片不要压 duotone**。`.site-duotone` 的青色单色调是给示意图/占位准备的，压在真实照片上会吃掉妆造、服装和霓虹的颜色 —— 首页 05 TECHNOLOGY、ON AIR、VISION 夜景三处都因此摘掉了 `duotone`（PR #198 / #200 / #201）
- **单色标识用 CSS mask 而不是 `<img>`**。Chiron 官方标识只有黑色一版，而官网默认深色主题；用 `mask-image` + `bg-site-fg` 上色，同一个变量在两套主题各自翻转，一张透明底图两边都成立。注意**不能用 Tailwind 的 `dark:` 变体** —— `tailwind.config.ts` 没配 `darkMode`，它跟随 `prefers-color-scheme`，而本站主题由 `<html data-theme>` 驱动，遇到「系统深色 + 手选浅色」会判断反
- **首屏 slogan 是品牌锁定文字，不本地化**。它的视觉是青／红／白三层错位叠放的 Barlow Condensed，气质全在这个字族和错位上；换成汉字短句会同时丢掉字族与错位效果（汉字笔画密，3px 错位会和笔画本身撞上糊成重影），只剩一句和正文没区别的和文。所以三语共用同一句 `ECHO FROM OSAKA NIGHT`（与页脚版权行一致）。`page.tsx` 里仍留着一个含 CJK 就只渲染单层的判断分支，作为万一以后又填入和文时的兜底 —— 当前三语都是拉丁字母，走不到那条分支
- **多格参考图靠居中裁切控制露出范围**。3×3 表情参考图放进横版通栏图位时，`object-position: center` 会稳定落在中间一行，首尾两行（含不适合对外的词条）在裁切区外 —— 这是有意为之，不是碰巧，改图位比例前要重新核对

### 3.8 应募表单数据流（唯一有状态的部分）

```
浏览器 ApplicationForm
  → POST /api/site/applications（公开，无 authGuard）
  → isBotSubmission()   honeypot / 最短填写时长
  → validateApplication()   字段校验（纯函数，单测覆盖）
  → 限流：同 ip_hash 一小时 ≥5 次即 429
  → insert site_applications（service role）
  → createNotification() 推给 role='ops'
  → 后台「创作者 → 官网应募」只读列表
```

**字段**（比设计稿多两项，都是必要补充）：姓名、年龄、居住地、**联系方式**（设计稿收了信息却没有任何联系方式，收了也联系不上人）、经验/SNS（选填）、**同意勾选**（收集个人信息的前提）、语言（自动）。

**存储**：`supabase/migrations/045_site_applications.sql`。RLS 开启，**只给 `authenticated` 一条 select 策略，不给任何 insert/update/delete** —— 官网用的 anon key 是公开的，没有 insert policy 就算被人直连 PostgREST 也写不进来，唯一写入口是服务端的 service role。

**反垃圾三层**：隐藏诱饵字段（真人看不见所以永远为空）、最短填写时长（3 秒内提交的不是人）、每来源每小时 5 次。前两者命中时返回**与成功同形的响应但不落库** —— 告诉爬虫「你被识别了」只会让它换招。

**隐私**：`ip_hash = sha256(salt:ip)`，不存原始地址；salt 取 `SITE_APPLICATION_IP_SALT`（未配置时用兜底值并 warn，生产必须配）。通知里只带姓名与年龄/居住地，联系方式要看得进后台 —— 个人信息少一处流转。

**API 契约**：

| 结果 | 状态码 | 响应 |
|---|---|---|
| 成功 | 201 | `{ data: { id }, error: null }` |
| 校验失败 | 400 | `{ data: null, error: 'validation', fields: { name: 'required', … } }` |
| 机器人 | 201 | 与成功同形，实际不落库 |
| 限流 | 429 | `{ data: null, error: 'rate_limited' }` |
| 落库失败 | 500 | `{ data: null, error: 'db_error' }` |

`fields` 返回的是**错误码**不是人类语言，文案由前端按当前语言渲染 —— 否则 API 就得知道三种语言。

### 3.9 响应式

设计稿是桌面固定网格，落地补三档：≥1024 完全照稿；768–1023 hero 转上下、多栏降 2–3 栏；<768 全单栏、导航折叠为抽屉、纵排文字与三重错位描边降级（小字号下会糊成一团）。

发丝线网格降列时有个坑：**列数必须能整除项目数**，否则空出来的格子会露出容器底色（18% 白），在黑底上就是一块灰方块。因此 3 栏用例直接 1 → 3，不走 2 栏中间态。

---

## 4. 质量门禁

| 命令 | 覆盖 |
|---|---|
| `npm test` | 432 个单测，含官网的校验/反垃圾/IP 哈希/导航激活/文章模型（库行 → SiteArticle）/成员模型（库行 → SiteMember，含降级，见 `content.test.ts`）/联系分区/语言菜单 |
| `npm run test:copy` | 三语 key parity + JSX 无裸汉字 + 样式 token 合法性 |
| `npx tsc --noEmit` | 类型 |
| `npx next build` | 全站预渲染（官网 8 类页面 × 3 语言）；NEWS 详情页 `generateStaticParams` 需要能连上 `site_news`（2026-08-14 起，见 §2.4）——本地/CI 没有可用的 Supabase 连接时会退化为 0 篇预生成而不是构建失败，生产构建仍需要 `SUPABASE_SERVICE_ROLE_KEY` 在构建期可用 |

**两个必须知道的静默失效陷阱**（都实际踩过）：

1. 改了 `tailwind.config.ts` **必须重启 dev server** —— Next 的 PostCSS 管线缓存配置，只改配置不重启时新 token 的类名不会生成，表现为「类名在 DOM 上但元素没颜色」。取证最快的方式是往页面插一个只带该类名的探针元素读 `getComputedStyle`。
2. `/N` 透明度修饰符取的是 `theme.opacity` 表，默认只有部分 5 的倍数。官网用到的 `/78`、`/68`、`/55` 等档位已在 `theme.extend.opacity` 登记，**新增未登记档位会静默不生成类**。

---

## 5. 当前状态与后续

**已实现**：8 类页面 × 三语、深浅双主题、应募投递全链路（迁移已应用到远端，端到端实测通过：5 次成功 + 第 6 次 429 + 通知分发 + anon 直连写入被 RLS 挡住）、后台只读列表、真实主视觉（12 张 webp + 首页 hero 的 1.1MB 循环短片与海报图）、顶栏语言下拉菜单（键盘可达，逻辑在 `locale-menu.ts`）、自有域名 host 路由（`domain-routing.ts`）。OFFICE 区块与示意图现在挂在 CONTACT 页末尾。

**已上线**（2026-08-13）：官网已在 `eacn.agenova.chat` 对外可访问。这一轮（PR #175–#203）把全站文案与图片从占位内容换成真实资料，详见 §3.6.1；内部更新日志已按对外可感知归并成两条记在 `2026-08-13`。

> 部署踩过一次坑：#199 合并时 GitHub 正在发生 500/502 故障，发给 Vercel 的 webhook 丢了，代码进了 main 但**没有生成生产部署**。判断方法是比对 `gh api repos/…/deployments` 里最新 Production 的 ref 与 `origin/main` 的 HEAD，别只看 CI 绿灯。注意 Vercel 的 **Redeploy 是重放那一条部署对应的旧 commit**，治不了这种情况；要么在界面上新建部署并指定 `main`，要么推一个提交触发 webhook。后来被 #200 的合并自然带过去了。Git 集成本身没断。

**部署 NEWS / 成员改读库这两轮（Task 10 / Task 12）前的硬性前置条件（不可跳过、没有回退路径）**——这条门槛覆盖 `site_news` 与 `site_members` 两张表，不是只有 NEWS：

1. **必须先对生产 Supabase 手动跑一次内容搬迁脚本**：`node --env-file=.env.local scripts/seed-site-content.mjs`（`.env.local` 指向生产项目）。`messages/{zh,en,ja}.json` 的 `site.news.articles[]`（Task 10）与 `site.members.list[]`/`note`/`unrevealedRole`（Task 12）均已删除，官网 NEWS 三个位置（列表、详情、首页 LATEST）与 VISION 页 MEMBERS 网格现在只读 `site_news`/`site_members` 两张表——这两张表目前**没有任何 CI/CD 或 Vercel 钩子会自动写入**，仓库里搜过 `.github/workflows/*.yml`、`vercel.json`、`package.json` scripts 均确认这一点。
   - **验证方式**：跑完脚本后执行 `select count(*) from site_news;` 应为 `5`，`select count(*) from site_members;` 应为 `12`；再抽查 `select no, is_revealed, expected_reveal_on from site_members order by no;`，确认 1–8 号 `is_revealed = true`、9–12 号 `is_revealed = false` 且 `expected_reveal_on = '2026-12-01'`，与 §3.6.3 描述的一致。
   - **如果跳过这一步就部署**：NEWS 侧——`eacn.agenova.chat` 上线后 NEWS 列表清空、首页 LATEST 三格消失、5 篇文章详情页全部返回 404；成员侧——VISION 页的 MEMBERS 网格会把全部 12 个卡位渲染成「未公开」占位（不是 404，`membersFromQuery` 查询到空表时的正常降级行为，但对访客而言等于 8 位已公开成员集体消失），且这个空态一旦在 ISR 下被首次请求渲染并缓存，就会一直提供给后续访客，直到有人手动打一次 `revalidatePath`。**两者都没有任何自动回退机制**——静态文案已经删除，唯一的恢复路径就是事后再手动跑这个脚本，并对 VISION 页发一次请求触发重新渲染（或等下一次后台保存自然带过 `revalidatePath`）。
2. **部署后必须确认 NEWS 详情页确实是静态预渲染的**，不是 `generateStaticParams`（`src/app/[locale]/site/news/[slug]/page.tsx`）连不上库时静默退化出来的逐请求动态渲染——这条退化**不会让构建失败、不会让 CI 变红**，唯一的信号是构建日志里前缀为 `BUILD-TIME DEGRADATION` 的 `console.warn`。检查方法：部署后看一次该次生产构建的日志有没有这行；或直接访问任一已发布 slug（如 `https://eacn.agenova.chat/news/echoamp-launch`）观察响应是否命中 CDN 缓存（`x-vercel-cache: HIT`/`STALE`，而不是每次都是 `MISS`）。
3. **部署后必须确认 VISION 页的 MEMBERS 网格显示的是真实的 8 位成员**，不是 12 张「未公开」占位卡——这条退化同样不会让构建失败、不会让 CI 变红（`membersFromQuery` 设计上就是"查不到就返回未公开占位"，这是它的正常职责，不是 bug）。检查方法：三语下各访问一次 `https://eacn.agenova.chat/vision`（及 `/zh/vision`、`/en/vision`），确认前 8 张卡显示 KANO/MIKOTO/LULU 等真实姓名与照片，而不是清一色的「— 公開前 —」。

**上线前需要产品侧确认**（仍未全部关闭）：

1. **联系方式的真实性** —— CONTACT 与 RECRUIT 里的邮箱域名、LINE ID 都是照设计稿落的字符串，未核实归属；若域名不属于公司，等于把访客引向不存在的联系方式
2. **主视觉的授权范围** —— 成员素材是生成资产，入库不等于已授权对外发布
3. **应募数据的保留期限与删除流程** —— 已有明示同意，但自动清理未实现
4. **未来日期的对外表述** —— NEWS 里有几条日期在当前日期之后（例如 10 月 1 日起定期直播），排期表的 `MONTH 2 正式开播` 也没有绝对日期。这些是计划而非既成事实，措辞上没问题，但真实日期定了要回来对齐

**已知不一致（不影响功能，待产品侧定）**：

- 顶部跑马灯（`site.ticker.items`）仍是大阪霓虹年代的内容（道顿堀 GLICO 1935 等），而首页与 VISION 的主叙事已经换成团队愿景。它是独立的装饰性数据，不属于任何一个区块 —— VISION 页的三栏已在 #205 换成团体性格（SPIRIT／VOICE／IMAGE），跑马灯是这轮剩下的最后一处旧叙事
- ON AIR 面板标签旁的脉冲圆点原本配「ON AIR NOW」表示直播中，现在标签是「开播平台」而正式开播在 MONTH 2 —— 经确认**保留为装饰**（它在设计语言里也是视觉母题）

**后续可做**：robots/sitemap、把排期搬到数据库做成后台可编辑（NEWS 已在 Task 9/10 做完，成员见 Task 11/12）、应募状态流转。
