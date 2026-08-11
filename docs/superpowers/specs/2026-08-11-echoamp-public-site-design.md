# EchoAmp 对外公会官网 — 设计说明（spec）

> 建立：2026-08-11
> 分支：`feat/public-site`（自 `origin/main` @ 3082d13）
> 设计源：claude.design 项目 `478a0d1c-c990-47a8-a555-858082c5a11a`，文件 `EchoAmp 官网.dc.html`，快照 version `1786437924471281`（2026-08-11T08:45Z，含深浅双主题、NEWS 详情页、OFFICE 示意图）
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
- 两个拉丁族（Barlow / Barlow Condensed）用 `next/font/google` 自托管，暴露为 CSS 变量，不引外链 CDN
- **和文字体走系统栈，不下载**：`Noto Serif JP` / `Noto Sans JP` 在 Google Fonts 上被切成上百个 unicode-range 分片，构建时逐个抓取会拖死构建（落地时实测：网络受限环境下构建卡在字体阶段不前进），全量自托管也是数 MB 的首屏负担。改为 `"Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif` —— 日本用户的 Mac/iOS 上是 Hiragino Mincho、Windows 上是 Yu Mincho，本机装了 Noto 则优先用 Noto，观感与设计稿一致且零下载

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
10. **logo 三角幕**：hover 顶栏 logo 时，青色三角从左上角尖点扫开覆盖视口，内含黑字宣言（细节见 §5.1）

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
| `/[locale]/site/vision` | VISION + MEMBERS | 宣言（h2 与三角幕同句：`大阪で、最も才能ある歌って踊る配信者を見つけ出す。`）→ 夜景图 → 四个年代数字卡 → COLOR/TYPE/IMAGE 三栏 → 双队长卡 → 12 位成员 6 列网格 |
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
| `SiteSection` | 区块容器：1360 内容宽 + 32px 留白 + 区块间发丝线（官网外层由 site layout 自己承担，不单独抽组件） | `tone` `divider` |
| `SiteHeader`（client） | sticky 顶栏、导航激活态下划线、RECRUIT CTA、语言与主题切换、<1024 抽屉菜单 | `locale` |
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
| `NewsRow` / `NewsCard` | NEWS 的行形态与卡形态，均整块链到文章详情 | `article` |
| `NewsFilter`（client） | 分类药丸筛选（设计稿里是静态装饰，落地做成真可点） | `filters` `articles` |
| `ScheduleTable` | 排班表头 + 行 | `rows` |
| `MemberCard` | 成员卡（3:4 图 + NO. + 名 + 说明） | `member` |
| `ApplicationForm`（client） | 应募表单、校验错误态、提交状态、成功态 | `locale` |
| `LogoVeil`（client） | logo hover 触发的三角幕（见 §5.1） | `open` `onClose` |
| `ThemeToggle`（client） | 深浅主题切换（见 §14.1） | — |
| `StudioMap` | 新大阪示意图（见 §14.3） | `labels` |

### 5.1 LogoVeil：logo 三角幕交互

顶栏 logo 悬停时，一块青色三角从视口左上角扫开，压在全站之上，内含公会宣言。

- 形状：`clip-path: polygon(0 0, 68% 0, 0 96%)`，`position: fixed; inset: 0; z-index: 60`（高于 sticky 顶栏的 40），底色 `site-accent`
- 入场：clip-path 由退化尖点（`polygon(0 0,0 0,0 0)`）+ opacity .4 展开到最终形状，0.42s `cubic-bezier(.2,.8,.2,1)`；内部文字块 opacity + `translateY(-8px)` 收敛，0.5s 延迟 0.1s
- 内容：eyebrow `ECHOAMP OSAKA ／ VISION 2027`（13px / 0.34em）+ 明朝 40px 两行宣言，均为**黑字**（青底上唯一可读的选择）
- `pointer-events: none`：不拦截任何点击
- 收起：监听 `mousemove`，`x/(0.68·vw) + y/(0.96·vh) > 1` 即光标离开三角区域则收起；导航跳转时一并收起
- **仅指针设备**：`@media (hover: hover) and (pointer: fine)` 才启用 —— 触屏没有 hover，且移动端盖住半屏是故障而不是效果
- `prefers-reduced-motion: reduce` 时直接以终态显示、不做扫开动画
- `aria-hidden="true"`：纯装饰性瞬态层，同一句宣言在 VISION 页有正式的标题呈现
- 文案走 i18n（`site.veil.*`），三语各自一份

## 6. 内容与三语

`check-no-bare-han` 禁止 JSX 里出现汉字（日文汉字同样命中），所以**所有文案必须走 i18n**。

- 命名空间 `site.*`，三语文件 `messages/{zh,en,ja}.json`
- 列表型内容用数组：`site.news.articles[]`（4 篇，各含导语与 3 段正文）、`site.vision.eras[]`（4）、`site.services.items[]`（4）、`site.live.schedule[]`（6）、`site.members.list[]`（12）、`site.ticker.items[]`（5）
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

## 14. 设计稿 v3 增补（version 1786437924471281）

设计稿在实现过程中更新了三处功能与一处架构，均已落地。

### 14.1 深浅双主题

设计稿把颜色抽成 `--ea-*` 变量层并加了 `[data-theme="light"]` 覆盖。落地对应：

- `--site-*` 已经是变量层，只新增 `:root[data-theme='light']` 覆盖块：canvas `#f3f3f4`、panel `#e7e7ea`、fg `17 17 20`、accent `#0a7078`（亮青 `#25f4ee` 在浅底上对比度只有 1.5:1）、line 系改用 ink 透明度
- 新增 `--site-on-accent`（强调色实底上的文字）与 `--site-on-hot`（红底上的文字，常量白 —— 浅色主题下 fg 变近黑，压红底读不出来）
- `data-theme` 打在 `<html>`。后台不读 `--site-*`，因此该属性对内部页面零影响
- `ThemeToggle`：本地选择 > 系统偏好 > 深色；`THEME_INIT_SCRIPT` 内联在 site layout 顶部，首屏绘制前定主题，避免浅色访客每次先闪一帧黑
- 设计稿把语言切换改成单键循环（日本語 ⇄ 中文）。我们保留三语分段控件（zh/en/ja 是既定范围），主题键并排放在它右侧，沿用同一描边样式

### 14.2 NEWS 数据化与详情页

- 4 篇文章：`src/lib/site/news.ts` 定义 slug 与配图，文案在 `site.news.articles[]`（三语各 4 篇 × 标题/导语/正文 3 段）
- slug 用稳定字符串（`moondollz-launch` 等），不用日期也不用下标：日期会改、下标会因插入新文章整体位移，两者都会让已发出的链接失效
- 路由 `/[locale]/site/news/[slug]`，`generateStaticParams` 预渲染 4 slug × 3 语言 = 12 页；未知 slug 走 `notFound()`
- 首页三卡与列表行都链到详情，卡片右下角加红色 `READ →`
- 旧的 `site.news.items` 与 `SiteNewsItem` 类型已删除，避免两份真相

### 14.3 RECRUIT 页 OFFICE 区块

- 左栏：eyebrow + 明朝标题「新大阪駅から徒歩 5 分」+ 说明 + 最寄駅/設備/来訪 三行规格表
- 右栏：`StudioMap` —— 图纸质感示意图（网格、斜向铁道带 + 虚线轨、纵向道路、直角虚线步行路径、脉冲的 ECHOAMP STUDIO 标记、SHIN-OSAKA AREA 图例、指北针）。**不是真实地图、不放精确地址**：来访完全预约制，详细住所面谈后单独告知
- 地图有自己的色板 `--site-map-*`（含固定的 `--site-map-accent`），深浅两个主题下都保持深色 —— 它是「屏幕/图纸」构件；跟着主题翻转会让近黑底上的强调色变成深青而看不清
- `role="img"` + `aria-label`：内部的斜带与虚线对读屏用户没有意义，一句话交代位置关系比逐个念标签有用

### 14.4 落地时修掉的三个自身缺陷

1. **三重描边标题换行**：绝对定位的偏移层按容器宽度排版，容器宽度由白色层决定，偏移 3px 就把最后一个词挤到第二行 → 三层都加 `whitespace-nowrap`
2. **发丝线网格空格子**：3 项放进 2 栏会空出一格，露出容器底色（18% 白）在黑底上是一块灰方块 → 3 栏用例直接 1 → 3，不走 2 栏中间态
3. **duotone 占位**：`.site-duotone` 的青色底靠图片 multiply 才成立，没图时只剩一块青实底且占位说明读不出来 → 只在有 `src` 时挂 duotone
4. **三角幕的收起路径**：只监听 `mousemove` 时，hover logo 后直接滚滚轮（光标不动）会让幕布一直挡半屏 → 补 `scroll` 与 `Escape`
