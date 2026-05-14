/**
 * 项目更新日志（按天聚合）。
 *
 * 维护约定：
 * - 新条目追加到数组顶部；同一天的多个变更合并到同一个 `DailyChangelog` 里。
 * - `kind` 只用预设的几种，方便页面颜色/图标统一。
 * - `title` 用一句话描述用户能感知到的变化；`details` 可选，展开后阅读。
 * - `scope` 可选，用于在条目前加一个小 chip（例如 "财务预测"、"移动端"）。
 *
 * 这是真实的项目记忆来源之一 —— 改了什么 / 修了什么，会被设置 → 更新日志页直接读出来。
 */

export type ChangeKind = 'feat' | 'fix' | 'improve' | 'security' | 'infra'

export interface ChangeItem {
  kind: ChangeKind
  scope?: string
  title: string
  details?: string
}

export interface DailyChangelog {
  date: string
  version?: string
  items: ChangeItem[]
}

export const CHANGELOG: DailyChangelog[] = [
  {
    date: '2026-05-13',
    items: [
      {
        kind: 'improve',
        scope: '财务预测',
        title: '账号预测输入体验改造：聚焦自动全选、不再吞小数点、滚轮不再误改数值',
        details: '同步给四个数字列加上合理的上下限（开播天数 ≤ 31、平均时长 ≤ 24、可分润比例支持一位小数），月开播收益作为派生列改为浅底纹以与可编辑列区分。',
      },
      {
        kind: 'fix',
        scope: '财务预测',
        title: '"全年"视图下顶部标题不再继续显示上一次选中的月份',
      },
      {
        kind: 'feat',
        scope: '配置',
        title: '设置页新增"更新日志"二级 tab，按天展示新增功能与变更',
        details: '就是这个页面本身——后续每次发功能会持续往这里追加。',
      },
      {
        kind: 'feat',
        scope: '战略时间轴',
        title: '新增轻量"接下来 30 天"时间轴视图',
        details: '把已有 milestone 数据按近期窗口重新整理，更聚焦于"马上要发生什么"。',
      },
      {
        kind: 'feat',
        scope: '财务预测',
        title: '新增"盈亏分解"图表模式：显式展示 收入 − 成本 = 利润',
      },
      {
        kind: 'feat',
        scope: '财务预测',
        title: '支持滚动 3 年视野，默认进入"全年"视图',
      },
      {
        kind: 'feat',
        scope: '财务预测',
        title: '默认聚焦"当年月度"视图，并统一了 scope 选择器',
      },
      {
        kind: 'feat',
        scope: '财务预测',
        title: '视图条收纳为一个触发器 + 下拉浮层，节省顶部空间',
      },
      {
        kind: 'feat',
        scope: '财务预测',
        title: 'KPI 区按所选月份动态刷新，标签同步重命名',
      },
      {
        kind: 'feat',
        scope: '财务预测',
        title: '"已保存的视图"按用户隔离，管理员可单独设为公开可见',
      },
      {
        kind: 'feat',
        scope: '财务预测',
        title: '账户预测输入在手机端体验全面优化',
        details: '光标稳定、键盘弹起不再遮挡输入框、节流保存避免抖动。',
      },
      {
        kind: 'security',
        scope: '自然语言指令',
        title: 'NL Intent 流水线加固，抵御提示词注入与越权调用',
        details:
          '在 intent 解析与执行之间增加签名 / 范围校验，确保 LLM 解出来的动作只能命中调用方有权限的资源；同时清洗用户文本中的指令片段。',
      },
      {
        kind: 'fix',
        scope: '战略时间轴',
        title: '修复触摸滑动导航：手机端左右切换时间段恢复正常',
      },
      {
        kind: 'fix',
        scope: '财务预测',
        title: '自动保存定时器始终读取最新月份数据，不再保存到陈旧闭包里',
      },
      {
        kind: 'fix',
        scope: '财务预测',
        title: '删除行按 row id 而不是数组下标，避免快速操作时误删邻近行',
      },
      {
        kind: 'fix',
        scope: '基础设施',
        title: '修复中间件错误拦截 favicon 与 API 路由，恢复直链访问',
      },
    ],
  },
  {
    date: '2026-05-12',
    items: [
      {
        kind: 'feat',
        scope: '财务预测',
        title: '新增累计收支曲线 + 盈亏平衡 KPI 区',
        details: '在原来的月度视图之外，新增累计曲线 Tab，并把全年成本预算等 KPI 抽到顶部。',
      },
      {
        kind: 'feat',
        scope: '财务预测',
        title: '"全年成本预算" KPI 卡支持一键跳转到支出管理',
      },
      {
        kind: 'feat',
        scope: '财务预测',
        title: '新增"全年"视图，按月铺开各账户营收',
      },
      {
        kind: 'improve',
        scope: '财务预测',
        title: 'KPI 卡 / 输入区交互重排：输入区移到图表上方，可折叠',
      },
      {
        kind: 'fix',
        scope: '财务预测',
        title: '修复保存队列竞态：连续修改后偶尔回写旧数据',
        details: '改用显式 stale-id 删除，替换原本的 NOT IN 过滤；新增服务端日志方便排查。',
      },
      {
        kind: 'fix',
        scope: '财务预测',
        title: '账户删除不再等待 700ms 防抖，立即落库',
      },
      {
        kind: 'fix',
        scope: '财务预测',
        title: '成本按 expense_date 月份归属，不再被均摊到整个季度',
      },
      {
        kind: 'fix',
        scope: '财务预测',
        title: 'KPI 卡数值不再被 $ 标签裁切 / 重叠',
      },
      {
        kind: 'feat',
        scope: '支出管理',
        title: '支出视图（已保存的筛选条件）持久化到 Supabase，按用户隔离',
      },
      {
        kind: 'feat',
        scope: '支出管理',
        title: '新增"分类 → 买家"两级桑基图与饼图联动',
      },
      {
        kind: 'feat',
        scope: '支出管理',
        title: '"本月支出"KPI 升级为月份选择器，可看过去 12 个月任意一个月',
      },
      {
        kind: 'feat',
        scope: '支出管理',
        title: '跨境标识按真实跨境费数据自动判定，不再写死买家名',
      },
      {
        kind: 'fix',
        scope: '支出管理',
        title: '买家下拉补全：表单和筛选同时显示完整买家列表',
      },
      {
        kind: 'fix',
        scope: '支出管理',
        title: '日期范围 slider 的左侧把手现在可拖动',
      },
      {
        kind: 'feat',
        scope: '移动端',
        title: 'P1+P2 移动端体验：汉堡抽屉、响应式布局、支出卡片视图',
      },
      {
        kind: 'feat',
        scope: '移动端',
        title: 'P3+P4 移动端体验：表单网格、字号节奏、触控目标、安全区',
      },
      {
        kind: 'fix',
        scope: '移动端',
        title: '月份选择器自动换行，12 个月全部可见',
      },
      {
        kind: 'fix',
        scope: '移动端',
        title: '侧边栏抽屉里始终保留头像与登出入口',
      },
      {
        kind: 'feat',
        scope: '登录',
        title: '登录页改版：左右分栏品牌区 + 极简邮箱/密码登录',
      },
      {
        kind: 'fix',
        scope: '登录',
        title: 'iOS 登录页不再因输入框聚焦触发缩放',
      },
      {
        kind: 'feat',
        scope: '个人信息',
        title: '侧边栏展示登录用户昵称（头像 + 姓名 + 角色）',
      },
      {
        kind: 'improve',
        scope: '个人信息',
        title: '登出按钮收进个人信息弹窗，避免误点',
      },
      {
        kind: 'fix',
        scope: '个人信息',
        title: '个人信息弹窗在桌面端加宽并改为两栏',
      },
      {
        kind: 'security',
        scope: '权限',
        title: '为所有内容表加上基于角色的访问控制 (RLS)',
      },
    ],
  },
  {
    date: '2026-05-11',
    items: [
      {
        kind: 'feat',
        scope: '支出管理',
        title: '设备管理升级为完整的支出管理模块',
        details: '从只跟踪设备成本扩展为整体支出（含跨境费、买家、类目等），并增加月度汇总图。',
      },
      {
        kind: 'improve',
        scope: '支出管理',
        title: '买家 / 录入人字段统一使用团队成员下拉',
      },
    ],
  },
  {
    date: '2026-05-10',
    version: '0.1.0',
    items: [
      {
        kind: 'feat',
        scope: '初版',
        title: '项目首次上线：仪表盘 / 创作者 / 流水线 / 任务 / 团队 / 知识库 / 配置 全套基础页面',
      },
      {
        kind: 'feat',
        scope: '设备管理',
        title: '按付款状态分组的累计设备支出面积图',
      },
      {
        kind: 'infra',
        title: '升级 Next.js 到 14.2.35，修复 Vercel 构建',
      },
    ],
  },
]
