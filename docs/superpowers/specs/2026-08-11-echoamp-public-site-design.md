# EchoAmp 对外公会官网 — 设计说明（spec）

> 建立：2026-08-11
> 分支：`feat/public-site`（自 `origin/main` @ 3082d13）
> 设计源：claude.design 项目 `478a0d1c-c990-47a8-a555-858082c5a11a`，文件 `EchoAmp 官网.dc.html`，快照 version `1786430485202163`（2026-08-11T06:41:25Z）
> 目标读者：WithJP 工程团队 / PMO

## 1. 背景与目标

WithJP 至今只有内部经营后台（登录后可见的紫罗兰浅色体系）。本次新增**对外公开的公会官网**：面向关西应募者与日本法人客户，介绍公会定位、事业线、MOONDOLLZ 企划与配信排班，并承接应募投递。

官网与内部后台共用一个 Next.js 仓库和一次部署，但**视觉体系完全独立**（纯黑 / 零圆角 / 明朝体），互不污染。

### 在范围内

- 7 个公开页面（TOP / NEWS / VISION+MEMBERS / TIKTOK LIVE / SERVICES / RECRUIT / CONTACT），免登录
- zh / en / ja 三语，文案沿用设计稿
- 设计稿真实主视觉入库（12 张 webp）
- RECRUIT 应募表单真实落库 + 通知 ops + 后台只读查看

### 不在范围内

- 域名、CDN、robots/sitemap 之外的营销工具接入
- 应募的完整后台工作流（状态流转、批注、导出）——本轮只做只读列表
- NEWS / MEMBERS / 排班的后台可编辑化（本轮内容在 i18n 文案里，改文案即改站）

## 2. 设计语言（从设计稿提取，本节为官网唯一权威）

`docs/design-system.md` 描述的是**内部后台**体系。官网是独立设计面，以下要素与后台冲突（明朝体、纯黑底、零圆角）属于**已登记的合法例外**，同 PR 在 design-system.md 追加指引段落。

### 2.1 色彩

| 语义 | 值 | 用途 |
|---|---|---|
| canvas | `#000000` | 页面底 |
| panel | `#141414` | 分层区块底、hover 底、ticker 底 |
| fg | `255 255 255`（RGB 三元组） | 正文白，靠透明度分级：`/100` 标题、`/78` 正文、`/68` 卡内说明、`/60` 次级、`/50` meta、`/40` 页脚 |
| accent | `#25F4EE` | 唯一点睛色：eyebrow 编号、激活下划线、数字、链接、pulse 点、描边药丸 |
| hot | `#FE2C55` | CTA 实底、S-04 强调、RECRUIT 色块 |
| hot-hover | `#FF5C7C` | CTA 悬停 |
| line | `rgba(255,255,255,0.18)` | 发丝线（区块分隔、网格缝、卡边框） |
| line-strong | `rgba(255,255,255,0.40)` | blueprint 框边、分段控件边 |

### 2.2 排版

- `Barlow Condensed`：英文标题、eyebrow 标签、数字、导航项、按钮。**字距是主要表情**：标签 0.2–0.4em、导航 0.1em、按钮 0.12–0.14em
- `Noto Serif JP`（明朝）：和文标题与卡片小标题——看板文字的紧张感来源
- `Barlow` + `Noto Sans JP`：正文，15px / line-height 1.6，段落 1.9–2.1
- 标题尺寸走 clamp：首页 h1 `clamp(28px,3.2vw,58px)`、区块 h2 `clamp(32px,3.2vw,44px)`、子页 h2 `clamp(38px,4vw,56px)`
- 全部字体用 `next/font/google` 自托管，暴露为 CSS 变量，不引外链 CDN

### 2.3 形态手法（照抄，不发明）

1. **零圆角**：全站 `border-radius: 0`
2. **发丝线网格**：卡片组用 `display:grid; gap:1px; background:line; border:1px solid line`，每格自己填 `canvas` 或 `panel` —— 缝隙就是分隔线，不给每张卡描边
3. **corner ticks（蓝图框）**：图片框、强调卡、按钮四角的 L 形短线，`line-strong` 描边
4. **编号 eyebrow**：`01 ／ NEWS` 青色小字 + 紧接大标题
5. **ticker 跑马灯**：`translateX(0 → -50%)` 38s 线性无限，内容双份拼接
6. **pulse 呼吸点**：9px 方块，opacity 1 → .25，2s
7. **错位三重描边标题**：同一行文字三层叠放（青 / 红 / 白，偏移 ±3px），只用于首页副标题
8. **纵排文字**：`writing-mode: vertical-rl` + 0.4em 字距，用于首页主视觉侧栏
9. **duotone 图片**：图片染成单色调，与黑底和着ぐるみ题材相性好

### 2.4 骨架尺度

- 内容宽 `max-width: 1360px`，左右 padding 32px
- 顶栏 sticky，min-height 64px，`rgba(0,0,0,0.9)` + `backdrop-filter: blur(8px)`，底部 `line-strong` 分隔
- 区块纵 padding 72px（`panel` 底的区块 80px），区块之间用发丝线分隔而不是留白
- 首页 hero 为 `1.05fr / 0.95fr` 双栏，中缝一条发丝线，左栏右 padding 56px

## 3. 信息架构与路由

设计稿用 `sc-if` 状态机做单页切换。落地改为**真实路由**：可分享、可 SEO、每页独立 metadata。

| 路由 | 页面 | 主要区块 |
|---|---|---|
| `/[locale]/site` | TOP | hero（pulse 标签 / h1 / 三重描边副标 / 双 CTA / 三格数字）→ ticker → 01 NEWS 三卡 → 02 VISION 说明 + 四卡 → 03 PROJECT MOONDOLLZ（群像 + MOON/DOLLZ/-Z 释义）→ 04 SERVICES 四栏 → 05 TECHNOLOGY 着ぐるみ → RECRUIT 红色横幅 |
| `/[locale]/site/news` | NEWS | 分类药丸（ALL/RECRUIT/PROJECT/LIVE）+ 4 行日期表 |
| `/[locale]/site/vision` | VISION + MEMBERS | 宣言 → 夜景图 → 四个年代数字卡 → COLOR/TYPE/IMAGE 三栏 → 双队长卡 → 12 位成员 6 列网格 |
| `/[locale]/site/live` | TIKTOK LIVE | 6 行排班表 + ON AIR NOW 侧卡 |
| `/[locale]/site/services` | SERVICES | 四条事业（编号 / 明朝标题 / 英文副标 / 说明）+ 04-A/B/C 三栏 + 两张现场图 |
| `/[locale]/site/recruit` | RECRUIT | 募集要项 5 行表 + 收益待遇卡 + **应募表单** |
| `/[locale]/site/contact` | CONTACT | FOR CREATOR / FOR CLIENT 双卡 |

- 顶栏导航 6 项（TOP / NEWS / VISION / TIKTOK LIVE / SERVICES / CONTACT）+ 右侧红色 RECRUIT CTA + 语言切换
- 设计稿把 MEMBERS 并入 VISION、顶栏不出 MEMBERS，本方案保持一致
- middleware 的 `PUBLIC_PATHS` 增加 `/site`（去掉 locale 前缀后匹配），使全站免登录
- 未来接自有域名：用 `next.config.mjs` 的 rewrite 把 `echoamp.jp/*` 映射到 `/ja/site/*`，不改页面代码

## 4. 主题隔离

内部后台有 `check-style-tokens` 门禁：`src/` 下禁裸 hex、禁 `slate-*`/`gray-*` 等数字阶灰、禁给固定透明度 token 加 `/N`。官网必须**在门禁内**实现，不靠豁免注释。

做法是新开 token 命名空间：

- `src/app/globals.css`（门禁白名单内）定义 `--site-canvas / --site-panel / --site-fg / --site-accent / --site-hot / --site-hot-hover / --site-line / --site-line-strong`
- `tailwind.config.ts` 登记 `site` 家族。`site-fg` 映射 `rgb(var(--site-fg) / <alpha-value>)`，因此 `text-site-fg/78` 合法且真实生效；其余为固定值 var()，**禁止**加 `/N`
- `fontFamily` 登记 `condensed` / `serif-jp`，映射 next/font 注入的 CSS 变量
- 组件里只写 token 类名，零裸 hex；`keyframes ea-ticker / ea-pulse` 定义在 globals.css

门禁的正向校验要求 token 必须真实登记在 `tailwind.config.ts`，新增家族一并满足。

## 5. 组件清单（`src/components/site/`）

全部纯展示、无状态（除标注 client 的两个），单一职责，可独立看懂：

| 组件 | 职责 | 关键 props |
|---|---|---|
| `SiteShell` | 官网外层：黑底 `min-h-screen`、字体变量、覆盖 body 的浅色底 | `children` |
| `SiteHeader`（client） | sticky 顶栏、导航激活态下划线、RECRUIT CTA、语言切换、<768 抽屉菜单 | `locale` |
| `SiteFooter` | 四栏页脚 + 版权行 | — |
| `LocaleSwitch`（client） | 分段描边控件，切 zh/en/ja，保留当前子路径 | `locale` |
| `SectionHead` | eyebrow（`01 ／ NEWS`）+ h2 + 可选副标 + 可选右侧「VIEW ALL →」 | `no` `label` `title` `sub` `moreHref` |
| `HairlineGrid` | 发丝线网格容器（1px gap + 底色） | `cols` `tone` `children` |
| `BlueprintFrame` | 四角 corner ticks 的框 | `strong` `className` `children` |
| `SiteButton` | `hot` 实底 / `ghost` 描边两种，corner ticks | `variant` `href` `children` |
| `Ticker` | 跑马灯，内容自动双份 | `items` |
| `PulseDot` | 呼吸方块 | `size` |
| `SiteImage` | 有图渲染 next/image（可选 duotone），无图渲染占位说明 | `src` `alt` `placeholder` `duotone` |
| `StatGrid` | hero 的三格数字（大数字 + 说明） | `stats` |
| `NewsRow` | NEWS 页一行（日期 / 分类药丸 / 标题 / →） | `item` |
| `ScheduleTable` | 排班表头 + 行 | `rows` |
| `MemberCard` | 成员卡（3:4 图 + NO. + 名 + 说明） | `member` |
| `ApplicationForm`（client） | 应募表单、校验错误态、提交状态、成功态 | `locale` |

## 6. 内容与三语

`check-no-bare-han` 禁止 JSX 里出现汉字（日文汉字同样命中），所以**所有文案必须走 i18n**。

- 命名空间 `site.*`，三语文件 `messages/{zh,en,ja}.json`
- 列表型内容用数组：`site.news.items[]`（4）、`site.vision.eras[]`（4）、`site.services.items[]`（4）、`site.live.schedule[]`（6）、`site.members.list[]`（12）、`site.ticker.items[]`（5）
- `check-i18n` 会按 `key[index]` 展开做三语 parity，因此三语数组必须等长同形
- ja 用设计稿原文；zh 用设计稿 RECRUIT 段已有的中文 + 补齐其余；en 新写
- 页面里读数组用 `useTranslations` + `t.raw()`；类型在 `src/lib/site/content.ts` 里声明，避免各页面各自 `as any`

## 7. 图片资产

设计项目里的真实资产压缩后入库 `public/site/`（12 张 webp，合计 1.2MB）：

| 文件 | 尺寸 | 用途 |
|---|---|---|
| `moondollz-key.webp` | 1126×846 | 首页 hero |
| `moondollz-group.webp` | 1800×1355 | PROJECT 群像 |
| `ayatsuki-portrait.webp` | 664×830 | CAPTAIN 01 |
| `yukiha-portrait.webp` | 560×700 | CAPTAIN 02 |
| `card-{kano,mikoto,lulu,chiyo,akaya,yumeki,shino,himene}.webp` | 480×640 | 成员卡 1–8 |

- 全部经 `next/image` 引用，显式 `sizes`，hero 与群像 `priority`
- 设计稿里 12 位成员只有 8 位有图，剩余 4 位渲染 blueprint 占位框 + 「12月 公開」
- VISION 夜景图、着ぐるみ现场图、配信截图设计稿本身就是占位，保持占位框（等真实素材）

## 8. 应募表单（唯一有状态的数据流）

```
浏览器 ApplicationForm
  → POST /api/site/applications（公开，无 authGuard）
  → validateApplication()（纯函数，单测覆盖）
  → 反垃圾闸门（honeypot / 最短填写时长 / 每 IP 每小时上限）
  → insert site_applications（service role）
  → createNotification() 给 role='ops' 的用户
  → 后台只读列表页查看
```

### 8.1 表单字段（对设计稿的一处必要增补）

设计稿的表单只有 姓名 / 年龄 / 居住地 / 经验·SNS —— **没有任何联系方式**，收了也联系不上应募者；同时收集个人信息需要明示同意。因此增加两项：

| 字段 | 必填 | 规则 |
|---|---|---|
| `name` | 是 | trim 后 1–30 字 |
| `age` | 是 | 整数 16–60，超出返回 `out_of_range`（数据库 check 约束与之一致）。设计稿宣传的目标区间是 18–26，但**不按 18–26 卡**：那是筛选口径，交给 ops 判断 |
| `residence` | 是 | 1–60 字 |
| `contact` | **是（新增）** | 1–120 字，LINE ID / 邮箱 / SNS 账号任一 |
| `experience` | 否 | ≤1000 字 |
| `consent` | **是（新增）** | 勾选「同意按招募目的使用所填信息」，未勾不可提交 |
| `locale` | 自动 | zh/en/ja，记录应募语言，方便 ops 用对语言回复 |
| `hp`（honeypot） | — | 隐藏字段，非空即静默拒绝 |

### 8.2 数据表 `supabase/migrations/045_site_applications.sql`

```sql
create table if not exists site_applications (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 30),
  age         smallint not null check (age between 16 and 60),
  residence   text not null check (char_length(residence) between 1 and 60),
  contact     text not null check (char_length(contact) between 1 and 120),
  experience  text check (char_length(experience) <= 1000),
  locale      text not null check (locale in ('zh','en','ja')),
  status      text not null default 'new' check (status in ('new','reviewing','accepted','rejected')),
  ip_hash     text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
```

- RLS 开启；只给 `authenticated` 一条 select 策略，**不给任何 insert/update/delete 策略** —— 写入只能经 service role（我们的 API），公开 anon key 拿不到写权限
- 索引：`(created_at desc)`、`(ip_hash, created_at desc)`（限流查询用）
- **不存原始 IP**：存 `sha256(ip + salt)`，salt 取 `SITE_APPLICATION_IP_SALT`（未配置时用固定兜底值并 warn）。目的只是限流，不是追踪

### 8.3 API 契约 `POST /api/site/applications`

| 结果 | 状态码 | 响应 |
|---|---|---|
| 成功 | 201 | `{ data: { id }, error: null }` |
| 校验失败 | 400 | `{ data: null, error: 'validation', fields: { name?: code, ... } }` |
| honeypot 命中 | 201 | 与成功同形（不给爬虫反馈），实际不落库 |
| 超过限流 | 429 | `{ data: null, error: 'rate_limited' }` |
| 落库失败 | 500 | `{ data: null, error: 'db_error' }` |

- 限流：同 `ip_hash` 1 小时内 ≥5 条即 429
- 最短填写时长：表单挂载时记录时间戳，提交时带上，<3 秒视为机器人（按 honeypot 同样处理）
- `fields` 返回**错误码**（如 `required` / `too_long` / `out_of_range`），文案由前端按当前语言渲染，不在 API 里拼人类语言

### 8.4 纯函数与单测

`src/lib/site/application.ts`
- `validateApplication(input): { ok: true, value } | { ok: false, fields }`
- `isBotSubmission({ hp, elapsedMs }): boolean`
- `hashIp(ip, salt): string`

`src/lib/site/application.test.ts` 覆盖：必填缺失、长度边界（0/1/30/31）、年龄边界（15/16/60/61）、age 非整数与字符串数字、experience 超长、locale 非法、consent 未勾、honeypot 非空、elapsedMs 过短、trim 行为。测试文件加入 `package.json` 的 `test` 脚本。

### 8.5 后台查看

新增 `/[locale]/(app)/recruit-applications`：服务端组件直读 `site_applications`（service role），按 `created_at desc` 列出，字段为 日期 / 姓名 / 年龄 / 居住地 / 联系方式 / 语言 / 状态 / 经验（截断）。复用现有后台 UI 组件与紫罗兰体系，侧边栏加一个入口。**只读**，不做状态流转（后续需求）。

`createNotification` 的 `action_url` 指向该页面。

## 9. 响应式

设计稿是桌面固定网格（`repeat(3,1fr)`、`repeat(6,1fr)`、`140px 120px 1fr 40px` 等）。补三档：

| 断点 | 规则 |
|---|---|
| ≥1024 | 完全照设计稿 |
| 768–1023 | hero 由双栏改上下；3/4 栏网格降 2 栏；成员 6 列降 3 列；SERVICES 的 `100px 1fr 1.1fr` 降为编号在上、文字在下 |
| <768 | 全部单栏；顶栏导航折叠为抽屉（汉堡）；NEWS 行表由 4 列网格改为「日期+分类」一行、标题一行；成员降 2 列；纵排文字与三重描边标题在窄屏隐藏（窄屏里是噪音） |

发丝线网格降列时 `gap:1px` 手法天然成立，不需要额外处理。

## 10. 错误与降级

- **图片缺失**：`SiteImage` 无 `src` 时渲染 blueprint 占位框 + i18n 占位说明，不留空洞
- **表单**：字段级错误在输入框下方显示（`site-hot` 色），提交中禁用按钮，成功后整块替换为成功态（含「我们会在 2–3 周内联系」与 LINE 兜底）；网络失败给可重试提示
- **i18n 缺 key**：由 `check-i18n` 在 CI/本地门禁拦下，不做运行时兜底
- **JS 关闭**：站点内容全部服务端渲染可读；只有语言切换、抽屉菜单、表单提交需要 JS

## 11. 测试与验收

1. `npm test`（含新增 `src/lib/site/application.test.ts`）
2. `npm run test:copy` = i18n parity + 无裸汉字 + 样式 token 三道门禁
3. `npm run build`
4. 实机预览：三语 × 三断点（1440 / 900 / 390）逐页截图；表单走一遍真实提交（校验失败态 / 成功态 / 限流态）
5. `docs/design-system.md` 追加官网例外段落；`src/lib/changelog/entries.ts` 加一条用户可感知的变更（版本管理员约定）

## 12. 风险与后续

| 项 | 说明 |
|---|---|
| 设计稿会变 | 本 spec 锚定 version `1786430485202163`。实现前与收尾前各比对一次 `ListFiles` 的 version，有变化按 diff 补 |
| 肖像与版权 | 12 张主视觉是设计项目里的生成素材。对外公开发布前需产品侧确认可用范围（本 PR 只入库，不代表已授权发布） |
| 个人信息 | 应募表单收集姓名/年龄/居住地/联系方式。已加明示同意；保留期限与删除流程需产品侧后续定，本轮不实现自动清理 |
| 内容可编辑性 | NEWS / 成员 / 排班现在在 i18n 文案里，改动要发版。若更新频繁，后续把这三块搬到 Supabase + 后台维护 |
| 域名 | 现在挂在 `/[locale]/site` 下。接自有域名走 rewrite，不改页面代码 |

## 13. 交付方式

单分支 `feat/public-site`，按阶段提交：token 与骨架 → 组件 → 各页面 → 三语文案 → 图片资产 → 表单数据流 → 后台只读页 → 文档与 changelog。

若最终 diff 过大不便审查，在**表单数据流**这条缝上切成两个 PR：PR1 纯展示官网（无数据库改动），PR2 应募表单 + 迁移 + 后台页。两者无相互依赖，PR1 可先合。
