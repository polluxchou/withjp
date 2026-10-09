# 直播间一键截图上传扩展 —— 设计

## 1. 背景与目标

竞品直播截图目前有两条入口：

- **自动巡检**：专用 Chrome + 本机 CDP（`scripts/live-watch/`），按 object-fit 精裁画面、读在线人数，写 `competitor_shots`（`tag = live_auto`）。
- **人工上传**：在竞品页相册的上传控件里选文件或 ⌘V 粘贴（`ShotUploader`）。前提是人先在系统截图工具里**手工框选**直播画面。

人工这条路的成本几乎全在「框选」和「回到后台找到对应账号」这两步上。本设计新增一个 **Chrome 扩展**：人在浏览器里看着某个竞品直播间时，手动点一下扩展图标，扩展就

1. 自动命中当前页的直播画面区域（竖屏画面本身，不含两侧空白）并截图；
2. 读当前房间的在线人数，以及左侧「Following」区块里同一时刻其它在播竞品的在线人数；
3. 点「上传」后直接写进后台数据库，弹窗提示成功，不跳转页面；
4. 弹窗底部显示**当天（日本时间）**的截图数与上传数，作为单日工作量统计。

触发始终是人手动点击。扩展不轮询、不自动进房、不在后台跑。

## 2. 已确认的范围决策

| 决策 | 结论 |
| --- | --- |
| 形态 | Chrome 扩展（MV3），放在本仓库 `extensions/live-shot/`，不单开项目 |
| 触发 | 人在当前标签页手动点扩展图标；每次只处理当前这一页 |
| 截图范围 | `<video>` 按 object-fit 算出的真实画面矩形（竖屏画面本身） |
| 登录 | 扩展自带登录，用 MCN 后台同一套邮箱+密码（Supabase Auth） |
| 上传后 | 弹窗提示成功，不跳转竞品页 |
| 当前房间人数 | 写入截图的 `viewer_count`（房间面板口径） |
| 同期人数 | 只取左侧「Following」区块当前**已显示**的条目，只留竞品库里的账号；不展开「See all」，不读「Suggested LIVE creators」 |
| 同期人数存法 | 新表 `competitor_viewer_readings`，一个账号一行 |
| 附带信息 | 只记在线人数；不记开播时刻、不加备注输入框 |
| 界面 | 三态（就绪 / 已上传 / 出错）+ 底部「今日 截图 N · 上传 M」，不展示明细 |
| 今日计数 | 按日本时间每天归零；上传数以后台为准（按上传人统计），截图数存本地 |

## 3. 架构总览

```
TikTok 直播间标签页（人正在看）
   │  点扩展图标（activeTab 授权，仅此一刻）
   ▼
popup ──scripting.executeScript──▶ 页内读取（ISOLATED world）
   │                                  · handle（URL /@handle/live）
   │                                  · 画面矩形（clipRect 算式）
   │                                  · 当前房间人数（liveProbe 三档判据）
   │                                  · Following 区块条目（handle + 人数原文）
   │◀─────────────────────────────────┘
   │  tabs.captureVisibleTab → OffscreenCanvas 按矩形×DPR 裁剪 → webp
   ▼
弹窗「就绪」：缩略图 + ✓截图 ✓人数数据 + [上传]
   │  点「上传」
   ▼
POST https://mcn.agenova.chat/api/competitors/quick-shot   (Authorization: Bearer)
   │  校验令牌 → handle 查竞品库 → 传桶 → 写 competitor_shots → 写 readings
   ▼
弹窗「已上传」+ 今日计数刷新
```

## 4. 扩展

### 4.1 目录与形态

```
extensions/live-shot/
  manifest.json
  popup.html / popup.css / popup.js   弹窗三态 + 登录表单 + 今日计数
  capture.js                          截图裁剪（captureVisibleTab + OffscreenCanvas）
  api.js                              登录、续期、上传、取今日数
  generated/page-reader.js            由生成脚本产出，见 4.4，禁止手改
```

纯 JS，无打包步骤，开发者模式「加载已解压的扩展程序」安装。主 Chrome 与专用采集 Chrome 想用就各装一份。

### 4.2 权限

- `activeTab`：只有人点了图标，扩展才获得当前标签页的临时权限。**不声明** tiktok.com 的 host 权限，不挂常驻 content script。
- `scripting`：在那一刻注入一次页内读取函数。
- `storage`：存登录令牌（`chrome.storage.local`）与本地截图计数。
- `host_permissions`：仅 `https://mcn.agenova.chat/*` 与 Supabase 项目域名（登录、续期用）。扩展页面对有 host 权限的域名发请求不受 CORS 限制，后台不需要改 CORS。

### 4.3 截图

1. 页内读取返回画面矩形（CSS 像素）与 `devicePixelRatio`。矩形用 `liveProbe.ts` 的 `clipRect` 同一算式。**不复用 `CLIP_FACTORY_SRC`**：它会把视频静音，那是给无人值守采集用的，人正在看的时候不能动播放器。
2. `chrome.tabs.captureVisibleTab` 截当前可见画面（png）。弹窗本身不会出现在截图里。
3. `OffscreenCanvas` 按「矩形 × DPR」裁剪，编码为 webp，保证不超过 5MB（后台 `validateImage` 上限）。
4. `<video>` 不存在、`videoWidth = 0` 或 `readyState < 2`（还没画出第一帧）→ 不截，进「出错：没找到直播画面」。

### 4.4 页内读取：复用 liveProbe，不另写一份

在线人数的判据已经在 `src/lib/competitors/liveProbe.ts` 里实现并测过（PR 250）：

- 当前房间：`room`（右侧面板「Viewers · N」）→ `anchored`（侧栏里 handle 与 URL 一致的那条）→ `sole`（全页唯一）。三档都不成立时返回 null。
- 同期：`sidebarReading()` 读侧栏条目的 handle 与人数原文。

扩展的 MV3 环境禁止 `eval` / `new Function`，不能把源码字符串当场执行，所以由生成脚本 `scripts/gen-extension-reader.mjs` 把 `PROBE_FACTORY_SRC` 与 `clipRect` 的源码写进 `extensions/live-shot/generated/page-reader.js`，成为一个自包含、可被 `executeScript` 序列化注入的函数。测试比对「现在重新生成的内容」与已提交文件逐字一致，源码改了而没重新生成，CI 会失败。

探针以 `intervalMs = 0`（不起定时器）实例化：手动 `tick()` 一次，`drain()` 取出读数，然后 `disconnect()`。注入在 ISOLATED world，`__lw` 等全局只存在于扩展的隔离环境，页面脚本看不到。

**Following 区块限定**：现有 `sidebarReading()` 读的是全部 `[data-e2e="live-side-nav-item"]`，「Suggested LIVE creators」很可能共用这个标记。给 `ProbeConfig` 增加可选字段 `sidebarScope`（Following 区块容器的候选选择器）：设置了就只在容器内取条目；不设置时行为与现在完全一致，分钟级采集器不受影响。容器如何定位见第 11 节验证项。

### 4.5 弹窗三态与今日计数

| 状态 | 显示 |
| --- | --- |
| 登录（首次 / 令牌失效） | 邮箱、密码、「登录」 |
| 就绪 | 缩略图、竞品名、✓截图、✓人数数据、「上传」 |
| 已上传 | 竞品名、「已上传」、「关闭」 |
| 出错 | 一句话原因、「重试」 |

- 当前房间人数没读到时，「人数数据」那一行显示黄色警示，仍可上传，`viewer_count` 写 null。
- 底部固定一行「今日 截图 N · 上传 M」：
  - **截图数**：每次成功截到画面 +1，存 `chrome.storage.local`，键带日本时间日期，跨天自然归零；只统计本浏览器。
  - **上传数**：以后台为准。弹窗打开时 `GET /api/competitors/quick-shot` 取「我今天上传了几张」，上传成功后用接口返回值刷新。主 Chrome 与专用 Chrome 两边显示同一个数。
- 文案中文直写。扩展不在 Next 应用内，不走 `messages/*.json`。

## 5. 登录

- 弹窗表单直连 Supabase Auth：`POST {SUPABASE_URL}/auth/v1/token?grant_type=password`，带公开的 anon key。
- 拿到的 `access_token` / `refresh_token` / `expires_at` 存 `chrome.storage.local`。**密码不落盘。**
- 每次请求前检查过期时间，快过期就用 refresh token 续期；续期失败清空令牌，回到登录表单。
- 扩展里出现的只有后台域名、Supabase 项目 URL 与 anon key，三者本来就打包在网页前端里，是公开值。

## 6. 后台接口

新建 `src/app/api/competitors/quick-shot/route.ts`，**只认 `Authorization: Bearer <access_token>`**，不改全局 `authGuard`（它只读 Cookie，网页端的登录方式保持不变）。令牌校验用 anon client 的 `auth.getUser(token)`。

### 6.1 `POST /api/competitors/quick-shot`

multipart 字段：

| 字段 | 说明 |
| --- | --- |
| `file` | 裁好的 webp |
| `handle` | URL 里的 handle |
| `captured_at` | 读数时刻（客户端毫秒时间戳） |
| `viewer_text` / `viewer_source` | 当前房间人数原文与来源（`room` / `anchored` / `sole`），可空 |
| `co_live` | JSON：`[{ handle, viewer }]`，Following 区块原样 |

处理顺序：

1. 校验令牌，拿到 `user.id`。
2. `handle` 转小写后精确匹配 `competitors.handle`，未命中返回 404 `not_in_library`，**什么都不写**。
3. `uploadImage('competitor-shots', file)` 传桶（复用现有函数，含类型与大小校验）。
4. 写 `competitor_shots`：`tag = 'live_manual'`，`viewer_count = parseCount(viewer_text)`，`captured_at`，`created_by = user.id`，`shot_on` 由服务器按 `isoDateInTimeZone(captured_at, 'Asia/Tokyo')` 计算，客户端不传日期字符串；`captured_at` 若晚于服务器当前时间超过 5 分钟（本机时钟异常），改用服务器时间。
5. 写 `competitor_viewer_readings`：
   - 当前房间一行：`source = 'current'`（即截图口径；三档来源 `room` / `anchored` / `sole` 原样记进 `viewer_source`），关联本张截图。
   - `co_live` 中能精确匹配竞品库的每条各一行：`source = 'sidebar'`。当前房间若也在 Following 里，会再有一行 `sidebar`，两种口径并存：横向比较各房间时统一用 `sidebar`。
   - 不在库的条目丢弃，不入库。
6. 返回 `{ competitor_name, shot_id, readings, today_uploads }`。

截图写入成功但读数写入失败 → 返回 207 与 `readings_failed`，弹窗如实提示「截图已上传，人数没写进去」。

### 6.2 `GET /api/competitors/quick-shot`

同样只认 Bearer。返回 `{ today_uploads }`：`created_by = 我`、`tag = 'live_manual'`、`shot_on = 日本时间今天` 的截图数。

## 7. 数据模型

### 7.1 `competitor_shots` 加一列

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `created_by` | uuid null，references `auth.users(id)` on delete set null | 上传人。历史行与自动巡检行为 null |

加索引 `(created_by, shot_on)`，供今日计数查询使用。

### 7.2 新表 `competitor_viewer_readings`

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid pk | |
| `competitor_id` | uuid not null，references `competitors(id)` on delete cascade | |
| `captured_at` | timestamptz not null | 读数时刻；同一次点击的所有行相同 |
| `viewer_count` | integer null | `parseCount` 解析结果，解析不出为 null |
| `viewer_text` | text null | 页面原文，如「1.3K」 |
| `source` | text not null，check in (`current`, `sidebar`) | 读数口径：`current` = 当前房间（截图口径），`sidebar` = Following 侧栏横截面 |
| `viewer_source` | text null | `source = current` 时记三档来源 `room` / `anchored` / `sole` |
| `shot_id` | uuid null，references `competitor_shots(id)` on delete set null | 触发这次读数的截图 |
| `created_by` | uuid null，references `auth.users(id)` on delete set null | |
| `created_at` | timestamptz not null default now() | |

- `unique(competitor_id, captured_at, source)`：同一时刻同一口径不重复。
- 索引 `(competitor_id, captured_at)`：按竞品查人数历史。
- RLS 沿用仓库约定：`enable row level security` + `authenticated_only`（`for all to authenticated using (auth.uid() is not null)`）。

迁移写完必须真正执行（agent-service 的 `SUPABASE_DB_URL` + `psql`），再跑 `npm run audit:rls` 核查。迁移文件只是意图，不代表数据库状态。

## 8. 出错处理

| 情况 | 弹窗 | 写入 |
| --- | --- | --- |
| 当前页 URL 不是 `/@handle/live` | 当前页不是直播间 | 无 |
| 无 `<video>` / 未就绪 | 没找到直播画面 | 无 |
| handle 不在竞品库 | @handle 不在竞品库 | 无 |
| 当前房间人数三档都未命中 | 就绪态「人数数据」黄色警示，可上传 | `viewer_count` null，readings 不写 `current` 行 |
| 令牌过期且续期失败 | 回到登录表单 | 无 |
| 网络或后台 5xx | 上传失败，可重试 | 无（传桶后写库失败会留下孤儿文件，与现有上传流程同等对待） |
| 截图写入成功、读数写入失败 | 截图已上传，人数没写进去 | 截图有、readings 无 |

「当前页是已结束直播间，推荐模块里嵌着别人的流」这种张冠李戴，靠人在就绪态看缩略图把关。这条链路由人触发，人眼核实本来就在流程里。

## 9. 反检测与安全

- **对 TikTok 零额外请求**：读 DOM、截可见区域都在本地完成。
- **不往页面插任何元素**，不挂常驻脚本；只在人点击的那一刻注入一次，在 ISOLATED world 执行。
- **不动播放器**：不静音、不暂停、不改音量。
- **令牌**：只存在扩展自己的 `chrome.storage.local`，tiktok.com 的页面脚本读不到。不复用后台网页的 Cookie。
- 仓库为公开仓库：扩展与文档中不出现个人账号、密码或内部人员信息。

## 10. 测试

本仓库没有 DOM 测试环境，组件目录里的测试都是源码断言，所以可测逻辑要下沉到 `src/lib` 用 `node --test` 测：

- `src/lib/competitors/quickShot.ts`（新）：handle 规范化与 URL 解析、`co_live` 竞品库过滤与 readings 行组装、`shot_on` 日本时间计算、今日计数口径。
- `liveProbe.test.ts` 补 `sidebarScope`：设了只取容器内条目、不设行为不变（假 DOM 构造 Following + Suggested 两个区块）。
- 生成脚本：重新生成的内容与已提交的 `page-reader.js` 逐字一致。
- 裁剪：矩形 × DPR 的像素换算（抽纯函数测）。
- 接口：`not_in_library` 什么都不写、Bearer 缺失或无效返回 401、读数部分失败返回 207。
- 新测试文件登记进 `package.json` 的 `test` 行。
- 审查时跑突变探针，交击杀表（测试全绿不等于测试有效）。
- **真机验收**：在一个真实在播的竞品直播间点一次，核对桶里的图是黄框画面、`competitor_shots` 一行（`live_manual`、人数、上传人、日本时间日期）、readings 行数等于 Following 里在库账号数 + 1。

## 11. 开工前必须验证

1. **Following 与 Suggested 能否在 DOM 上分开**：在真实页面上看两个区块的条目是否共用 `live-side-nav-item`，以及「Following」标题所在容器有没有稳定的标记。
   - 有稳定容器 → `sidebarScope` 用它。
   - 没有 → 以「Following」区块标题之后、下一个区块标题之前的条目为界。只要能确定边界，具体做法由验证结果决定。
2. **`captureVisibleTab` 的分辨率**：Retina 下截出的位图是否就是 CSS 像素 × DPR；裁出的竖屏画面长边应接近 1900px。
3. **Bearer 令牌在 Vercel 上的校验**：`auth.getUser(token)` 在生产环境可用，且不需要额外配置。

## 12. 不做

- 自动展开「See all」、读「Suggested LIVE creators」。
- 开播时刻、备注输入框、手动改人数或改日期（补历史日期的图仍走竞品页上传框）。
- 后台页面展示读数或「每人每天上传量」——数据先攒着，展示另起一期。
- 上架 Chrome 应用商店、给公司外部的人用。
- 批量、轮询、自动进房（那是 `scripts/live-watch/` 的职责）。

## 13. 仓库与 CI 落位

- `extensions/` 在 `src/` 之外：style 检查（`check-style-tokens.mjs` 只扫 `src/`）、`next lint`、`next build` 都不会碰到它；`tsconfig` 只 include `**/*.ts`，扩展的 `.js` 不进 `tsc`。实施时逐项确认一遍，不靠推断。
- 生成脚本放 `scripts/gen-extension-reader.mjs`，需要时手动运行；一致性由测试保证。
