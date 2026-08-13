# 系统全面审计报告（官网 + 后台 + 数据库）

- 日期：2026-08-13
- 审计对象：`withjp`（Next.js 单仓：内部后台 WithJP + 对外官网 EchoAmp OSAKA + Supabase）
- 参照系：`tt-agent/docs/`（company-platform-master-plan v1、master-blueprint v3、domain-b-finance-plan v1、shared-backbone-contract v1）
- 方法：静态审计（代码 + 50 个迁移文件全读）＋ 本地实跑（`tsc --noEmit`、`npm test`、`next lint`）
- **无法验证的部分**：本会话可访问的 Supabase token 下只有一个 `INACTIVE` 项目（`cert-supabase-red-ball`），**不是**本系统的生产库。因此所有关于生产库的结论都是**从迁移文件推导**的，涉及 RLS 的三条 P0 建议在动手前应先在生产库上跑一次 `select * from pg_policies` 核对。

---

## 0. 一句话结论

代码质量本身是好的（类型全绿、344 测试全绿、i18n/设计 token 有 CI 门禁、文档写得比多数团队认真），**但授权体系几乎不存在**：`service_role` 让 RLS 在全部 70 个 API 路径上失效，兜底的 RLS 策略又写成了"只要登录就全放行"，其中两张表连 `to authenticated` 都漏了 —— 拿到公开 anon key 的**任何人**可以读全员名册。与此同时，被 tt-agent 决策 20 判定为"冻结待退役"的这个仓库，过去 12 天新增了 198 个 commit 和一整条对外业务线，**冻结没有被执行**，而所有"接受该风险到切换日"的结论都建立在"马上就废弃"这个前提上。

---

## 1. 系统全景

| | withjp（本仓） | tt-agent |
|---|---|---|
| 形态 | Next.js 14 App Router 单仓单部署 | Python + LangGraph + 自建 Postgres |
| 规模 | 343 个 ts/tsx，47,311 行；70 个 API route；51 张表 / 50 个迁移 | 12 个迁移，33 个测试文件，CI 带真 Postgres |
| 承载 | ① 内部后台（17 个功能页）② 对外官网（8 页）③ 竞品情报 | B 域财务切片（Phase 1）：权限矩阵 + 审批状态机 + 审计 |
| 授权 | `authGuard()` = 只判是否登录；5 处 `is_admin` | 矩阵驱动（`policy/matrix.py`）+ RLS + 红队测试 |
| 数据 | Supabase（`public.*`） | 自建 Postgres（`core.*`），已从 Supabase 导入 84 行 expenses |
| 计划中的定位 | 决策 20：**冻结待退役** | 新主干 |

两者当前**同时在长**。这是本次审计最重要的上下文。

---

## 2. 安全发现

### P0-1 · RLS 是个空壳：登录即全库读写

迁移 038 给 36 张表统一装了同一条策略：

```sql
create policy "authenticated_only" on %I
  for all to authenticated using (auth.uid() is not null)
```
（`supabase/migrations/038_enable_rls_all_tables.sql:60`，041/042/043 沿用同一模板）

`for all` + 无 `with check` ⇒ USING 同时充当写入检查。等价于：**任何登录用户对 `user_salary`、`finance`、`expenses`、`agent_runs`、`pending_actions` 等 36 张表拥有完整增删改查**。anon key 是公开的（内联在 `/login` 页面的 JS bundle 里），员工在浏览器控制台直连 PostgREST 就能绕开整个 UI：

```
GET https://<project>.supabase.co/rest/v1/user_salary?select=*
  apikey: <anon key>
  Authorization: Bearer <他自己的会话 token>
```

后台 UI 里"薪资只在 SalaryManager 页出现"不构成任何防护。

> 与计划的关系：tt-agent `domain-b-finance-plan.md` §12.1 只登记了"API 路由不判角色"这一半，**没有登记 RLS 兜底同样失效**这一半。§12.1 的原文写"`service_role` 绕过全部 RLS"，暗示 RLS 本身是有效的第二道防线 —— 实际不是。这条应该回填进那份文档。

### P0-2 · 未认证外泄：anon 可读全员名册与直播账号

```sql
create policy "Users can view all profiles"
  on users for select using (true);               -- 007_users_table.sql:27
create policy "Users can view broadcast accounts"
  on broadcast_accounts for select using (true);  -- 008:29
```

两条都**漏了 `to authenticated`**。Postgres 的默认 grantee 是 `PUBLIC`，而 Supabase 默认给 `anon` 角色授了 `public` schema 的表权限 —— 于是这两张表对**未登录的任何人**开放读取。泄露内容：全体员工姓名、`user_code`、角色、`is_admin` 标记，以及全部直播账号绑定关系。

anon key 的获取成本 ≈ 0（打开后台域名的 `/login`，看一眼 JS）。官网 `eacn.agenova.chat` 上线后，公司已经有了对外曝光面，这条从"内网小问题"变成"外部可利用"。

### P0-3 · `venue_items` 完全没有 RLS

`029_venue.sql:30` 建表，038 的表清单里**没有它**，之后也没有任何迁移补上。表未启用 RLS 时，Supabase 的默认 grant 意味着 **anon key 可直接增删改查**这张表。同一迁移建的 `venues`/`venue_floors`/`venue_editors` 都在 038 清单里，唯独 `venue_items` 漏了 —— 典型的"手工维护表清单"漂移。

### P0-4 · 全部 70 个 route 走 service_role

`src/lib/supabase/server.ts:7` 用 `SUPABASE_SERVICE_ROLE_KEY` 建客户端，33 个 route 文件直接引用它。service_role **绕过全部 RLS**。因此实际授权链只剩：

```
authGuard()（只判是否登录，src/lib/auth/guard.ts:11）
  → 5 个 route 额外判 is_admin
  → 其余 65 个：登录即可为所欲为
```

`users.role`（`agent_role` 枚举，bd/ops/finance/tech/...）在整个后端**没有被用于任何一次授权判定**，只用于显示。

具体影响最大的三条：

| 路由 | 现状 | 后果 |
|---|---|---|
| `GET/POST /api/user-salary` | 只判登录 | 任意员工读全公司薪资、造薪资记录（§12.1 已登记） |
| `PATCH /api/config` | 只判登录 | 任意员工改全局配置 |
| `POST /api/expenses`、`/api/finance` 等 | 只判登录 | 任意员工改财务数据，无审批、无留痕 |

### P1-5 · 公司 LLM 密钥可被任意登录用户消耗

`/api/providers/test`、`/api/agents/test-connection`、`/api/agents/[id]/execute`、`/api/intent` 都只判登录，用服务端 env 里的 `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` 发起真实调用，**没有配额、没有速率限制**（`/api/intent` 有 1000 字输入上限和违规留痕，是唯一做了输入门禁的，`src/app/api/intent/route.ts:12`）。

### P1-6 · 两个公开存储桶

`item-photos`（032）与 `competitor-shots`（043）都建成 `public: true`，上传后返回 `getPublicUrl()`。UUID 文件名不可枚举，但 URL 一旦出现在任何地方（截图、聊天记录、爬虫）即等于内容公开。竞品截图属于商业情报。

### P1-7 · 47 处把原始数据库错误回给客户端

`return NextResponse.json({ error: error.message }, { status: 500 })` 在 20+ 个 route 文件里出现 47 次，会把表名、列名、约束名、类型错误直接吐给前端。应统一成 `{ error: 'internal' }` + 服务端日志。

### P1-8 · 页面层没有服务端会话校验

`src/app/[locale]/(app)/layout.tsx` 没有任何 auth 检查，17 个后台页全靠 middleware。middleware 里 `pathname.includes('.')` 是个相当宽的旁路条件（`src/middleware.ts:73`）。目前不可直接利用（Next 路由精确匹配，构造不出既含 `.` 又能命中页面的路径），且数据都在 API 后面 —— 属于纵深防御缺失而非当下漏洞，但布局层加一次 `getUser()` 成本极低。

### P1-9 · API 层零 schema 校验

70 个 route 里 **0 个使用 zod**（`zod@4` 已在依赖里）。全部是手写 `if (!x) return 400`，字段类型、范围、枚举基本靠数据库 CHECK 兜。`/api/site/applications` 是唯一做了完整校验的（`src/lib/site/application.ts`），且写得很好 —— 那套模式应该推广。

---

## 3. 数据库审计

### D-1 · 迁移编号重复 + 无应用记录（**切换日最容易出事的一条**）

```
重复：011 ×2  016 ×2  018 ×2  022 ×2  033 ×2  038 ×2  042 ×2
缺号：026、028
```

README 的说明是"按文件名顺序手动应用到 Supabase"。没有 runner、没有 `schema_migrations` 记录表、没有校验和。后果：

- **无法确定生产库当前到底应用了哪几个迁移、按什么顺序**。同号两个文件（如 `038_enable_rls_all_tables.sql` 与 `038_venue_item_truss_light.sql`）的相对顺序取决于当时谁手点了哪个。
- 重建 / 回滚 / 灾备演练无从谈起。
- tt-agent 的 `migrations/README.md` 把这些全部做对了（连续编号、sha256 校验、拒绝改已应用的迁移、契约 CI）。**同一家公司的两个仓库，一个有完整的迁移纪律，一个完全没有。**

迁移到 `core.*` 之前，至少要先跑一次盘点：把生产库真实的 `pg_policies` / `information_schema.columns` dump 出来，与仓库里的迁移比对，把差异写成一份"生产库真实状态"文档。**否则"上线前一次总体迁移"是在一个未知的起点上做的。**

### D-2 · 人用文本存 + 人名硬编码进 CHECK 约束

```sql
constraint expenses_company_account_buyer check (
  payment_method is distinct from 'company_account'
  or buyer_name in ('with-new', 'JP-代理陈昊', 'JP-代理小兽')
)   -- 011_expenses.sql:53
```

`expenses.user_name` / `buyer_name` 与 `devices` 同款，都是 `text`。后果：① 行级 `own` 范围建在字符串上（tt-agent §12.3 已登记）② **换一个付款代理人要发一次数据库迁移**。

### D-3 · 币种缺失，且已经在跨币种相加

- `finance.revenue` / `cost` / `profit`（001:62）**没有币种列**。
- `finance_forecast_months.actual_revenue_usd`（018:10）显式是 **USD**。
- `expenses` 实际录的是 CNY（tt-agent 已确认"现有数据币种统一 CNY"）。
- `src/app/api/dashboard/route.ts:35-38` 直接 `reduce` 求和 `revenue` / `cost` 得出 `total_profit`。

公司有日本法人（新大阪办公室、日元支出迟早出现）。tt-agent 的 6 条横切契约里把 `currency` 列为必需是对的；**但在切换日之前，现有 dashboard 的利润数字在多币种数据进来的那天就会静默错误** —— 不会报错，只会算错。

### D-4 · 其余结构性缺口

| 项 | 现状 | 说明 |
|---|---|---|
| 软删除 | 全库仅 2 处 `deleted_at`；API 里 8 处硬 `.delete()` | 删了就没了，审批/审计无法回溯内容 |
| `created_by` | 021 只补了 expenses / creators / knowledge / milestones 四张表 | 其余表的行无法归属到人，审计链断 |
| `sensitivity` | 无 | 薪资与普通支出在库层无法区分 |
| 分页 | 35 个 GET 里只有 6 个用 `limit`/`range` | dashboard 拉全表回 JS 聚合，数据量涨了就崩 |
| `select('*')` | 14 处 | 敏感列随表结构变化自动泄露到前端 |

### D-5 · site_applications 的 PII 与留存

`045_site_applications.sql` 本身设计得好（不给 anon 任何 insert 策略、只存 IP 的加盐哈希、字段上限与应用层对齐、注释解释了每个决定）。两个缺口：

1. **可见范围**：`for select to authenticated using (true)` —— 任何登录员工都能读应募者的姓名、年龄、居住地、联系方式。招募 PII 应该只对 ops/admin 可见。
2. **留存期限未定**（`docs/public-site.md` §2.5 明确列为"本轮不做"）。公司是日本法人、收集对象是关西应募者，个人情報保護法下"目的限定 + 留存期限 + 删除路径"是要有答案的。这条现在没有 owner。

> **优先级已上调（2026-08-13）**：这张表不是营销表单的附属品，它是 `creators` 与 `users` 的上游入口（见 6-3）。因此第 1 条不只是隐私问题 —— 它是**人事与主播档案的源头数据**；第 2 条的删除路径在新契约里由 `core.applications.deleted_at` 承担，保留期限仍需业务方拍板。

---

## 4. 工程与质量

**好的部分（应该保留进新系统）**

- `tsc --noEmit` 干净通过；`npm test` 344 项全绿；`next lint` 只有 10 条 hooks 依赖 warning。
- i18n 门禁很硬：三语 key 形状一致 + 每个 `t()` 必须解析 + JSX 里禁止裸中文 + 设计 token 零容忍（`.github/workflows/copy.yml`）。这套东西多数团队做不到。
- 文档质量高且诚实（`docs/public-site.md` 明写"本轮不做"，`docs/intent-injection-hardening-2026-05-12.md`）。
- `/api/intent` 的输入门禁 + 违规留痕、`/api/site/applications` 的三层防刷，都是认真做的。

**缺口**

| 项 | 现状 |
|---|---|
| CI 覆盖 | **只跑 copy 门禁**。不跑 `tsc`、不跑 `test`、不跑 `lint`、不跑 `build`。三条命令都是现成的，加进去是十分钟的事 |
| 测试分布 | 344 个测试**全部**是 `src/lib` 纯函数。API 路由与授权 **0 测试** —— 恰好是风险最高的那一层没有任何测试 |
| 重复代码 | `src/app/api/items/photo/route.ts` 与 `src/app/api/competitors/upload/route.ts` 逐字重复（仅 BUCKET 常量不同） |
| 上传扩展名 | `file.name.split('.').pop()` 未净化就拼进存储路径（两个 route 同款） |

---

## 5. 官网（对外面）审计

技术实现是干净的：

- `resolvePublicSiteRoute`（`src/lib/site/domain-routing.ts`）把官网域名与后台彻底隔离 —— 非白名单路径一律 404，`/api/*` 除应募接口外全部 404。设计和注释都好。
- 官网页面**不引用任何 Supabase client**，表单 `POST /api/site/applications`（`src/components/site/ApplicationForm.tsx:43`）。
- 除应募接口外全部预渲染，数据库故障不影响官网可读。

**关于附件提的"改造方向 B（用 API 边界替代共享 DB 客户端）"：现状已经是 B 方案的一半了。** 官网侧已经没有 Supabase client、已经只依赖一个 HTTP 契约。B 方案剩下的唯一增量是"拆成两个部署"。但这件事与 tt-agent 决策 20（旧应用整体退役）直接冲突 —— 见 §6-3。

**其余**：无 robots.txt / sitemap（`docs/public-site.md` §2.5 声明是刻意的，可接受，但对外招募站长期不做 SEO 需要产品侧确认这确实是本意）。

---

## 6. 与 tt-agent 改造计划的对齐差距（本次审计最重要的部分）

### 6-1 · "冻结待退役"事实上没有执行

`domain-b-finance-plan.md` 决策 20：*"`withJP_0722` 冻结为待退役，不再长新功能"*（2026-08-05 拍板）。

实际：**2026-08-01 至 08-12，198 个 commit**，新增内容包括

- 一整条对外官网业务线：8 个页面、新表 045、公开写接口、新域名、三语文案体系
- 竞品情报模块（042/043/044 三个迁移 + 上传 + 看板）
- 附件还要继续加：news 后台编辑、members 配置项、摄影师/化妆师/团播运营三类招募表单

这不是"修补"，是在计划要退役的地基上盖新楼。

### 6-2 · 三条"已接受风险"的前提已经失效

`domain-b-finance-plan.md` §13 接受了三条风险，理由都是"账号 <5 人 + 网站将废弃 + 到 Phase 2 随旧应用退役一并解决"。§12.1 甚至明写了触发条件：

> **"若期间给新人开后台账号，需重新评估。"**

现在的事实是：官网已上线并承接对外应募，后台新增了"官网应募"只读页，招募一旦跑起来就会有运营同事需要账号；同时旧应用的废弃日因为官网而无限期后移。**这三条风险的接受条件已经不成立，需要重新拍板** —— 要么真的冻结，要么把 P0-1/2/3 现在就补上（RLS 补 `to authenticated` + 薪资表按角色收紧 + `venue_items` 补策略，三条加起来是一个迁移文件的工作量）。

### 6-3 · 官网在两份规划里都没有位置 → **已拍板（2026-08-13）**

`company-platform-master-plan.md` 只有 A 域（直播情报）和 B 域（内部经营 OS）；`master-blueprint.md` 的 Phase 0–4 里没有任何一格是对外官网 / 招募漏斗。但官网现在是公司唯一的对外获客面，且承载了实际业务（应募投递）。

> **本节初稿的建议是错的，已作废。** 初稿给了三个选项并推荐「官网独立成仓、独立部署」，理由是官网与 Agent 栈技术正交。这个理由本身没错，但它**把「独立部署」和「数据独立」捆成了一个选项** —— 而这两件事应该拆开判断。

**拍板结论：数据层融合进 tt-agent，代码层不融。**

判断依据（由业务方指出，初稿低估了这一条）：**招募线索是 A 域主播档案与 B 域员工账号的共同上游。** 主播应募 → creator pipeline 的 `prospect` 之前那一格；摄影师 / 化妆师 / 团播运营应募 → 员工账号的入口。附件那句「不和后续签约主播关联」正是这条链现在断着的证据。若 `site_applications` 留在 Supabase 而 `creators` / `users` 迁进 `core.*`，这条上游链就成了跨库的 —— 那是最不该出现的接缝。

| 层 | 结论 | 理由 |
|---|---|---|
| **数据** | **融** —— `site_applications` → `core.applications`，与 `core.creators` / `core.users` 建外键 | 它是两域的上游入口，不是营销表单 |
| **代码 / 部署** | **不融** | 官网是静态 Next.js 营销站，tt-agent 是 Python/LangGraph Agent 栈；搬进去没有收益 |
| **接缝** | 官网表单改 `POST` 到 tt-agent 的公开端点 | 即附件「改造方向 B」，只是后端从 withjp 换成 tt-agent |

完整设计见 **`tt-agent/docs/domain-b-applications-contract.md`**（DDL、公网写入角色、转换链路、权限矩阵条目、导入映射均已落纸，DDL 与 RLS 已在一次性 Postgres 容器上实跑验证）。其中最重要的一条：**「应募 → 员工账号」创建的是一个权限主体，必须走 `pending_action` + Admin 审批，不能是一次直接 insert。**

仍未决的只剩「官网前端代码放哪」（留在 withjp / 独立成仓），这条不阻塞数据契约。

### 6-4 · 导入副本正在漂移（初稿把这条写重了，已下调）

- tt-agent 已把 84 行 expenses 从 Supabase 导入 `core.expenses`（`tools/import_from_supabase.py`，幂等键 `source_id`）。
- Stage 2a 出口验收记录：2026-08-12 真人在 Lark 点确认，`core.expenses` 落了新行。
- 同一时间 withjp 的 `/api/expenses` 仍在写 Supabase。

> **更正（2026-08-13）**：初稿把这条定性为「生产双库并行写入」，过重了。tt-agent 的 `DATABASE_URL` 指向 `localhost:5432`，仓库里只有本地 `docker-compose.yml`，没有 VPS、没有部署脚本 —— **不存在生产双写**。真实情况是「一个本地开发库里装着从生产导入的副本，并且已经在漂移」。

风险因此从"数据分叉"降为"切换日要决定试用期产生的行留还是删"。导入脚本的 `reconcile()` 已被明确降级为"一次性迁移闸门"而非运行时不变式（作者在 docstring 里写清楚了，这个判断是对的）。

原先建议的「每日漂移看门狗」相应降级为一句操作约定：**切换日之前 `truncate` 掉试用期数据、重跑一次 import**，不需要常设监控。真正需要的是切换触发条件（见 6-6）。

### 6-5 · 反过来看：withjp 有两样东西值得带进新系统

审计不该只报问题。这两样是新栈目前没有、且重造成本不低的：

1. **i18n / 设计 token 的 CI 门禁**（`scripts/check-i18n.mjs` 等三个脚本）。三语一致性靠人是保不住的。
2. **`/api/intent` 的注入加固经验**（`docs/intent-injection-hardening-2026-05-12.md` + 输入门禁 + `intent_violations` 留痕）。tt-agent 的红队测试覆盖的是权限绕过，这份覆盖的是输入侧，两者互补。
3. **`/api/site/applications` 的三层防刷**（honeypot + 最短填写时长 + 按 `ip_hash` 限流，且机器人提交返回与成功一致的 201）。`core.applications` 的公网端点直接搬这套，不重写。

### 6-6 · 数据库迁移路径（2026-08-13 确认）

方向：**现阶段继续用 withjp 的 Supabase，后续统一到 tt-agent 自建 Postgres。** 这与决策 14/15（只重建 Phase 1 用到的表、上线前一次总体迁移、老表切换后归档只读）一致，没有冲突。

三条需要钉住，否则「后续」会变成「永远」：

1. **「全部迁移」是三件事，成本差一个数量级** —— 表数据（最小，expenses 是 84 行级别）／**Auth**（决策 21 明说放弃 Supabase Auth，员工账号体系要重建，且 tt-agent 走 Lark 身份绑定，两套身份如何对上是真正的工作量）／**Storage**（`item-photos`、`competitor-shots` 两个桶要搬走，R2 已在备份方案里可复用）。
2. **触发条件而不是「后续」** —— 建议以 **tt-agent Phase 1 交付日**作为第一次切换，且只切 `expenses` / `user_salary` / `forecast` 三张表，其余留到 Phase 2。分批切与决策 14「只重建 Phase 1 用到的表」一致。
3. **终局未必是一个库** —— 若官网前端最终独立成仓，其静态内容与部署自成一体；但**应募数据必须在 `core.*`**（见 6-3）。「统一到一个库」要确认指的是数据主干统一，而不是物理上只剩一个 Postgres 实例。

---

## 7. 建议的行动顺序

### 立刻（本周）

1. ~~**补 RLS 三处**~~ → **已完成**：[`046_rls_hardening.sql`](../supabase/migrations/046_rls_hardening.sql)。在一次性 Postgres 容器上实跑验证过，含幂等重跑与逐角色行为断言。**应用前仍需在生产库 dump 一次 `pg_policies` 核对现状。**
   - 实跑抓到两个原设计遗漏：**`TRUNCATE` 不受 RLS 约束**（只 revoke CRUD 会留下"任何登录员工可清空 `users` / `user_salary`"），改为 `revoke all` + grant 回最小集；以及首版不幂等。
   - 薪资策略最终只认 `is_admin` 而非 `finance` —— 因为 `/api/profile` 允许任何人把自己的 role 改成 finance，写进策略等于开一条两步自助提权路。
2. **`/api/user-salary` 加角色判定**（`getActorProfile` 已有 `is_admin`）。**同时收紧 `/api/profile`**：`role` 不应由用户自选，否则第 1 条的策略只能停在 admin-only。
3. ~~**CI 加三步**~~ → **已完成**：[`.github/workflows/check.yml`](../.github/workflows/check.yml)，`tsc --noEmit` / `npm test` / `next lint`，三条实测全绿。Node 固定 24（`npm test` 依赖 `--experimental-strip-types`，Node 20 无此 flag）。
4. **重新拍板 §13 的三条已接受风险**（前提已变，见 6-2）。

### 短期（两周内）

5. **盘点生产库真实状态**：dump `pg_policies` + `information_schema` 与仓库迁移比对，产出一份"生产库实际 schema"文档。这是 `core.*` 迁移的前置条件（见 D-1）。
6. 统一错误响应，停止回传原始 DB 错误（47 处）。
7. `site_applications` 的可见范围收到 ops/admin，并给留存期限找一个 owner。
8. 给 `/api/providers/test`、`/api/agents/*/execute` 加速率限制。
9. 切换日前 `truncate` tt-agent 试用期数据并重跑一次 import（见 6-4；原「每日看门狗」已降级）。

### 需要决策（不写代码，但阻塞后面所有事）

10. ~~**官网的归属**~~ → **已拍板（2026-08-13）**：数据融进 `core.applications`，代码层不融（见 6-3）。剩余待拍板项见 `tt-agent/docs/domain-b-applications-contract.md` §10，其中**应募数据的保留期限**必须由业务方定，不是技术选型。
11. **附件那张"能力完善"表做在哪里** —— 三类招募表单的**数据结构**已被新契约覆盖；但 news 后台编辑、members 配置这两项仍是在 withjp（计划要退役的地基）上加功能，需要一个明确的 go / no-go。
12. **`core.*` 的切换触发条件**（见 6-6）—— 建议绑定 tt-agent Phase 1 交付日，先切 `expenses` / `user_salary` / `forecast` 三张表。

---

## 附：本次实跑证据

```
npx tsc --noEmit        → exit 0
npm test                → tests 344 / pass 344 / fail 0
npx next lint           → 0 error, 10 warning（全部是 react-hooks/exhaustive-deps）
```
