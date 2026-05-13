# 文案术语表（zh ↔ en）

本术语表是项目 UI 文案的**单一事实来源**，约束 `messages/{zh,en}.json` 与所有面向用户的字符串。新增文案或翻译时必须先查表；表中没有的新业务概念应先在此添加并 PR review，再落地代码。

- **优先级**：术语表 > 既有词典中的偏好 > 译者直觉
- **约束范围**：仅约束「用户可见文案」。代码标识符、数据库字段名、API contract、错误码等技术名称不在约束内
- **数据字符串**：写入数据库且跨 locale 共享的字符串（如 `account_name` 默认值 `新账号`）保留原文，不参与翻译
- **大小写约定**：英文统一 **sentence case**（仅首字母大写），专有名词与产品名保留原大小写
- **标点约定**：中文用全角标点（`，。：；！？「」`），英文用半角；括号在中英文里统一为半角 `()` —— 早期 `nav.team` 的全角括号是历史例外，迁移时一并修正

---

## 1. 品牌与应用框架

| 中文 | English | 备注 |
|------|---------|------|
| Creator Guild | Creator Guild | 产品名，不翻译 |
| AI 运营系统 | AI Operating System | 应用副标题 |
| 创作者公会运营概览 | Creator Guild operating overview | Dashboard 副标题 |

## 2. 业务实体

| 中文 | English | 备注 |
|------|---------|------|
| 创作者 | Creator | 单数；列表标题用复数 Creators |
| 团播账号 | Broadcast account | 直播账号实体；不要写成 "live account" / "streaming account" |
| 负责人 | Operator | 团播账号或创作者的运营负责人；不要写成 "owner" / "manager" |
| 部门代理 | Department agent | AI 代理；列表标题 Team (AI Agents) |
| 公会 | Guild | 名词，特指 Creator Guild |
| 客户 / 用户 | — | **禁用**，公会内只有"创作者"和"运营成员"两类主体 |

## 3. 业务流程 / 生命周期

| 中文 | English | 备注 |
|------|---------|------|
| 流程管理 | Pipeline | 顶级导航；不要写成 "Workflow" |
| 流程漏斗 | Pipeline funnel | Dashboard 区块 |
| 状态机规则 | State machine rules | Pipeline 内嵌说明 |
| 战略时间轴 | Strategic Timeline | 顶级导航；不要简化为 "Timeline"（已被创作者详情页占用） |
| 生命周期 | Lifecycle | 创作者属性 |
| 阶段 | Stage | 漏斗节点 |
| 待处理 / 进行中 / 已完成 | Pending / Running / Completed | 任务状态固定三档 |

## 4. 财务与指标

| 中文 | English | 备注 |
|------|---------|------|
| 财务预测 | Finance Forecast | 顶级导航 |
| 收入预测 | Revenue Forecast | `财务预测` 内的核心模块；之前叫"账号预测输入"，已废止 |
| 支出管理 | Expense Management | 顶级导航 |
| 开播收益 | Revenue | 单独出现时一律 "revenue"；带定语用 "live revenue" 仅当上下文必须强调来自直播 |
| 月开播收益 | Monthly revenue | 表头/卡片标签 |
| 实际开播收益 | Actual revenue | KPI |
| 预测开播收益 | Forecast revenue | KPI |
| 累计开播收益 | Cumulative revenue | 图表 series |
| 成本 / 成本预算 | Cost / Cost budget | 预算义统一用 "budget" |
| 同步预算成本 | Synced budget cost | 与「支出管理」联动 |
| 利润 | Profit | 不要写成 "earnings" |
| 累计利润 | Cumulative profit | 同步图表/卡片 |
| 毛利率 | Gross margin | 不要写成 "profit margin" |
| 结余 / 亏损 | Surplus / Loss | 仅在判断利润正负时使用 |
| 盈亏平衡 | Breakeven | 一个词，不要拆成 "break-even" |
| 首个盈利月 | First profitable month | KPI |
| 分钟收益 | Revenue per minute | 表头 |
| 分润比例 | Share ratio | 不要写成 "split / revshare" |
| 开播天数 | Live days | 不要写成 "broadcast days" |
| 平均每日开播时长 | Avg. daily live hours | "avg." 缩写保留点号 |
| 货币换算 | 1 USD = 7 CNY | 在显式比率出现的文案里统一这个写法；金额格式遵循 `Intl.NumberFormat` 默认 |

## 5. 常见动作（按钮 / 操作）

| 中文 | English | 备注 |
|------|---------|------|
| 保存 | Save | |
| 保存更改 | Save changes | |
| 取消 | Cancel | |
| 删除 | Delete | 危险动作；红色按钮 |
| 编辑 | Edit | |
| 添加 | Add | |
| 添加账号 | Add account | Finance Forecast 主操作 |
| 复制上月 | Copy previous month | |
| 应用到后续月份 | Apply to later months | |
| 清空本月 | Clear this month | |
| 折叠 / 展开 | Collapse / Expand | aria-label |
| 查看全部 | View all | |
| 刷新 / 重置 | Refresh / Reset | |
| 退出登录 | Logout | 不要写成 "Sign out" |

## 6. 模块标题（最容易漂移，必查）

| 中文 | English | 出处 |
|------|---------|------|
| 仪表盘 | Dashboard | nav |
| 创作者 | Creators | nav |
| 流程管理 | Pipeline | nav |
| 战略时间轴 | Strategic Timeline | nav |
| 任务 | Tasks | nav |
| 工作区 | Workspace | nav |
| 团队（AI 代理） | Team (AI Agents) | nav；括号写法以英文为准 |
| 知识库 | Knowledge | nav |
| 支出管理 | Expense Management | nav |
| 财务预测 | Finance Forecast | nav |
| 收入预测 | Revenue Forecast | Finance Forecast 子模块 |
| 配置 | Config | nav |
| 个人信息 | Profile | nav |
| 账号类型贡献 | Account type contribution | Finance Forecast 侧栏 |
| 预测曲线 | Forecast curve | Finance Forecast 图表 |

## 7. 账号类型分类（FORECAST_ACCOUNT_TYPE）

代码 enum 不翻译；下表是面向用户的展示名：

| key | 中文展示 | 中文注解 | English | English note |
|-----|---------|---------|---------|--------------|
| `key`     | 重点账号 | 高 ROI 账号    | Key      | High-ROI accounts    |
| `mature`  | 成熟账号 | 稳定贡献       | Mature   | Steady contributors  |
| `growing` | 成长账号 | 爬坡账号       | Growing  | Ramping accounts     |
| `newbie`  | 新人账号 | 新开账号       | Newbie   | New accounts         |
| `test`    | 测试账号 | 活动测试       | Test     | Campaign tests       |
| `other`   | 其他    | 未分类         | Other    | Uncategorized        |

## 8. 状态徽章（StatusBadge — 按收益门槛）

| 阈值（USD） | 中文 | English |
|------------|------|---------|
| ≥ 8000 | 重点跟进 | Priority |
| ≥ 3500 | 稳定 | Stable |
| 其他 | 观察 | Watch |

## 9. 已知不一致 / 待清理（P2 范围）

下列条目当前在代码里有多种写法，迁移时按本表统一：

- `nav.team` 中文用全角括号 `（）`，与第 6 节约定不符 —— 改为 `团队（AI 代理）`（"AI" 前后加半角空格），英文已经是 `Team (AI Agents)`
- 创作者列表副标题用 `{count} 位公会创作者`，dashboard 用 `创作者总数` —— 选其一
- "Revenue / 收入" 在 dashboard 是 `总收入`，在 Finance Forecast 是 `开播收益` —— 保留语境差异，不强行统一，但单字 "收入" 应一律对应 "Revenue"，避免出现 "Income"
- `team` namespace 是否要从 nav 中改名为 `agents`，待 P2 决定

---

## 维护规则

1. 增加新业务概念前先在本表登记，PR 必须包含术语表 diff
2. 当英文 sentence-case 与中文标题（首字大写 / 全大写 / 标题式）冲突时，以**用户实际看到的位置**为准 —— 表内标注的写法是 i18n 词典中的写法，UI 层若需 ALL CAPS 通过 CSS `text-transform: uppercase` 实现，不要往词典里塞大写文本
3. 与产品/设计/运营协商后修订时，需要同步更新 [messages/zh.json](../messages/zh.json)、[messages/en.json](../messages/en.json) 与本文件
