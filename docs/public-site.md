# EchoAmp 公会官网（对外站）

更新时间：2026-08-11
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

品牌身份：**EchoAmp OSAKA** —— TikTok LIVE 公认公会，办公室与配信工作室在新大阪，旗下女子团体企划 **MOONDOLLZ**（双队长制，AYATSUKI／YUKIHA + 12 位成员，其中 8 位已定形象）。

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

日文是主语气（目标受众是关西应募者与日本法人），中文与英文是**等价的完整版本**而不是降级翻译 —— 三语共用同一套结构，任一语言缺内容都会被门禁拦下。应募者用哪种语言投递会被记录，方便运营用对语言回复。

### 2.3 功能需求

| 页面 | 路由 | 访客能做什么 | 内容来源 |
|---|---|---|---|
| TOP | `/[locale]/site` | 了解定位、看最新三条动态、跳转各板块与应募 | i18n |
| NEWS | `…/news` | 按分类筛选动态、点进文章 | i18n |
| NEWS 详情 | `…/news/[slug]` | 读完整文章、从文末直接去应募 | i18n |
| VISION | `…/vision` | 理解品牌来源（大阪霓虹遗产）、看双队长与 12 位成员 | i18n |
| TIKTOK LIVE | `…/live` | 查看每周配信排班与当前节目 | i18n |
| SERVICES | `…/services` | 了解四条事业线与着ぐるみ技术细分 | i18n |
| RECRUIT | `…/recruit` | 读募集要项与待遇口径、**提交应募**、看办公室位置 | i18n + 写库 |
| CONTACT | `…/contact` | 按合作类型找到对应联系方式 | i18n |

全局能力：三语切换（停留在当前页）、深浅主题切换（记住选择）、顶栏 logo 悬停的三角幕、窄屏抽屉导航。

### 2.4 非功能需求

- **免登录**：middleware 放行 `/site`，公网可直达
- **静态优先**：除应募接口外全部预渲染（首屏不依赖数据库；数据库故障不影响官网可读）
- **响应式三档**：≥1024 照设计稿、768–1023 降列、<768 单栏 + 抽屉
- **可访问性**：装饰性图层 `aria-hidden`、示意图 `role="img"` + 说明、遵循 `prefers-reduced-motion`、强调色在两套主题下都保证正文对比度（浅色主题把亮青换成深青）
- **隐私最小化**：只收招募必需字段；不存原始 IP（只存加盐哈希，用途仅限限流）；收集前必须明示同意
- **反垃圾**：公开写接口必须能扛住无脑投递

### 2.5 本轮明确不做

- NEWS / 成员 / 排班的**后台可编辑化**（现在改内容 = 改 i18n 文案 = 发一次版）
- 应募的**状态流转与导出**（后台只读）
- CDN、robots/sitemap、埋点与营销工具
- 应募数据的自动清理策略（保留期限待产品侧定）

---

## 3. 技术实现

### 3.1 落点与鉴权

官网挂在 `/[locale]/site` 下，与内部后台的 `(app)` 路由组平级但不共享 layout。`src/middleware.ts` 的 `PUBLIC_PATHS` 增加了 `/site`，因此不走 Supabase 会话检查 —— 这是它能被公网访问的唯一开关。

生产官网域名为 `echoamp.agenova.chat`，middleware 按 `host` 做路由隔离：

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

纯逻辑与数据形状在 `src/lib/site/`：`nav.ts`（导航与激活判定）、`news.ts`（文章 slug 与配图）、`contact.ts`（联系分区与 CTA 解析）、`content.ts`（i18n 数组的类型）、`theme.ts`、`locale-menu.ts`、`application.ts`（校验与反垃圾）、`application-service.ts`（限流/落库/通知）。**带分支的逻辑都有 node:test 单测**。

### 3.6 内容与三语

`check-no-bare-han` 禁止 JSX 里出现汉字（日文汉字同样命中），所以**所有文案必须走 i18n** —— 这条门禁顺带保证了三语不会漏翻。

- 命名空间 `site.*`，三份文件 `messages/{zh,en,ja}.json`
- 列表型内容用数组：NEWS 文章、成员、排班、事业线、VISION 年代卡、CONTACT 分区、跑马灯
- `check-i18n` 会把数组展开成 `key[index]` 做三语 parity，因此**三语数组必须等长同形**，少一篇文章或少一行都会失败
- 页面用 `t.raw()` 读数组，类型统一声明在 `src/lib/site/*.ts`，不在页面里各写各的 `as any`

### 3.7 图片

设计项目里的真实主视觉压缩后入库 `public/site/`（12 张 webp，PNG 20MB → 1.2MB）：主视觉、群像、两位队长肖像、8 张成员卡。全部经 `next/image` 引用并给显式 `sizes`，首屏两张 `priority`。

尚无实拍素材的位置（夜景、着ぐるみ现场、配信截图）渲染蓝图占位框 + 说明文字，不留空洞；未公开的 4 位成员同理。

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
| `npm test` | 288 个单测，含官网的校验/反垃圾/IP 哈希/导航激活/文章模型/联系分区/语言菜单 |
| `npm run test:copy` | 三语 key parity + JSX 无裸汉字 + 样式 token 合法性 |
| `npx tsc --noEmit` | 类型 |
| `npx next build` | 全站预渲染（官网 8 类页面 × 3 语言，含 4 篇文章 × 3 语言） |

**两个必须知道的静默失效陷阱**（都实际踩过）：

1. 改了 `tailwind.config.ts` **必须重启 dev server** —— Next 的 PostCSS 管线缓存配置，只改配置不重启时新 token 的类名不会生成，表现为「类名在 DOM 上但元素没颜色」。取证最快的方式是往页面插一个只带该类名的探针元素读 `getComputedStyle`。
2. `/N` 透明度修饰符取的是 `theme.opacity` 表，默认只有部分 5 的倍数。官网用到的 `/78`、`/68`、`/55` 等档位已在 `theme.extend.opacity` 登记，**新增未登记档位会静默不生成类**。

---

## 5. 当前状态与后续

**已实现**：8 类页面 × 三语、深浅双主题、应募投递全链路（迁移已应用到远端，端到端实测通过：5 次成功 + 第 6 次 429 + 通知分发 + anon 直连写入被 RLS 挡住）、后台只读列表、12 张真实主视觉。

**进行中**：顶栏语言切换从分段控件改为下拉菜单 —— 纯逻辑 `src/lib/site/locale-menu.ts` 与单测已完成，UI 尚未接入（设计与计划见 `docs/superpowers/specs/2026-08-11-site-locale-dropdown-design.md`）。

**上线前需要产品侧确认**：

1. **联系方式的真实性** —— CONTACT 与 RECRUIT 里的邮箱域名、LINE ID 都是照设计稿落的字符串，未核实归属；若域名不属于公司，等于把访客引向不存在的联系方式
2. **主视觉的授权范围** —— 12 张成员素材是生成资产，入库不等于已授权对外发布
3. **应募数据的保留期限与删除流程** —— 已有明示同意，但自动清理未实现

**后续可做**：robots/sitemap、把 NEWS/成员/排班搬到数据库做成后台可编辑、应募状态流转。
