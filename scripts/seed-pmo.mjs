// PMO seed — stores the strategic context from the WithJP founding discussion
// Run: node --env-file=.env.local scripts/seed-pmo.mjs

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.')
  console.error('Run with: node --env-file=.env.local scripts/seed-pmo.mjs')
  process.exit(1)
}

const supabase = createClient(url, key)

// ── 1. Milestones — 6 setup workstreams ──────────────────────

const milestones = [
  {
    title:          '团队搭建 — 运营与主播团队',
    description:    '招募核心运营人员和首批直播主播，建立团队基础架构。',
    type:           'recruitment',
    level:          'company',
    priority:       'high',
    risk_level:     'high',
    start_date:     '2026-05-01',
    target_date:    '2026-08-31',
    success_metric: { kpi: '运营团队到位，首批主播签约不少于8人' },
    notes:          '主播以团播模式为主，同时承担短视频拍摄任务',
  },
  {
    title:          '场地装修 — 直播工作室',
    description:    '选址、租赁、装修适合团播的专业直播工作室。',
    type:           'launch',
    level:          'company',
    priority:       'high',
    risk_level:     'medium',
    start_date:     '2026-05-01',
    target_date:    '2026-07-31',
    success_metric: { kpi: '工作室完成装修并通过测试直播' },
    notes:          '需要满足多人同时在线的团播场景，日本本地施工周期约2个月',
  },
  {
    title:          '设备采买',
    description:    '采购直播所需摄像、灯光、收音、网络等硬件设备。',
    type:           'finance',
    level:          'company',
    priority:       'medium',
    risk_level:     'low',
    start_date:     '2026-05-01',
    target_date:    '2026-06-30',
    success_metric: { kpi: '设备到位并完成调试，支持团播正常运行' },
    notes:          '设备成本已在设备管理模块追踪',
  },
  {
    title:          '运营工作流研发 — Creator Guild OS',
    description:    '开发公会管理工作台，包含 PMO Agent、出勤管理、收入结算、Line 集成等核心模块。',
    type:           'campaign',
    level:          'company',
    priority:       'high',
    risk_level:     'medium',
    start_date:     '2026-05-01',
    target_date:    '2026-10-31',
    success_metric: { kpi: 'PMO Agent 上线，主播可通过 Line 签到和查询收入' },
    notes:          '产品核心循环：对话→提炼→知识库+任务→执行→新对话',
  },
  {
    title:          '资质申请与公司注册',
    description:    '完成日本法人注册、MCN 资质申请及相关许可证办理。',
    type:           'launch',
    level:          'company',
    priority:       'high',
    risk_level:     'high',
    start_date:     '2026-05-01',
    target_date:    '2026-07-31',
    success_metric: { kpi: '法人注册完成，具备合规经营资质' },
    notes:          '日本公司注册流程约1-2个月，需本地律师协助',
  },
  {
    title:          '运营计划、规划与行业调研',
    description:    '验证团播窗口期假设，完成竞品分析、平台政策调研和市场规模测算。',
    type:           'review',
    level:          'company',
    priority:       'high',
    risk_level:     'medium',
    start_date:     '2026-05-01',
    target_date:    '2026-05-31',
    success_metric: { kpi: '完成4项核心调研任务，形成可用于融资的市场判断报告' },
    notes:          '核心假设：团播在日本仍处窗口期，营收天花板还有5-10倍空间',
  },
]

// ── 2. Knowledge — market facts and operational judgments ────

const knowledge = [
  {
    category: 'live_strategies',
    title:    '日本直播市场 — 头部公会收入基准',
    content:  '通过跟播服务实测数据：日本头部直播间月收入约 10-15 万美金。此数据为窗口期判断的收入锚点，融资后可放大追踪样本覆盖更多直播间。',
    tags:     ['市场数据', '收入基准', '跟播服务', '日本市场'],
  },
  {
    category: 'live_strategies',
    title:    '日本直播市场 — 团播窗口期判断',
    content:  '核心假设：团播模式在日本仍处于窗口期，营收天花板还有5-10倍空间。支撑依据：\n1. 头部直播间月收10-15万美金为现有基准\n2. 进入日本的公会以中国背景为主，本土管理能力弱\n3. TikTok Live 在日本仍处早期，平台在主动扶持公会\n待验证：平台BD政策条款、TikTok JP公开数据、中国市场发展曲线对标。',
    tags:     ['市场判断', '窗口期', '团播', '核心假设', '待验证'],
  },
  {
    category: 'live_strategies',
    title:    '日本直播平台格局',
    content:  '- 17Live：日本渗透最深的打赏直播平台，本地化最早\n- SHOWROOM：稳定用户群，偏偶像应援文化\n- TikTok Live：仍处早期，增长快，平台主动扶持公会，按美金结算\n- YouTube Live：打赏文化弱，适合内容型创作者\n运营渠道：Line 是日本渗透率最高的通讯工具，主播端首选沟通渠道。',
    tags:     ['平台', '竞争格局', '日本市场', '17Live', 'TikTok', 'Line'],
  },
  {
    category: 'onboarding_materials',
    title:    '主播薪资三层结构',
    content:  '基础工资 = 实际上播时长 × 时薪\n分佣 = 本人礼物收入 × 分成比例（平台可区分团播中每个主播各自收到的礼物）\n月度奖励 = 奖金池 × 加权排名\n  └─ 礼物贡献排名 80% + 出勤率 20%\n奖金池 = 团播总收入抽取一定比例，不足时由工资池补齐\n短视频创作者：纯分成策略，公司承担化妆、运营、剪辑成本，收入按实际到账月份归属。',
    tags:     ['薪资', '分成', '结算', '直播', '短视频'],
  },
  {
    category: 'onboarding_materials',
    title:    '主播每日工作时间线与打卡规则',
    content:  '时间线：扫码签到（化妆开始）→ 开播 → 关播 → 离岗打卡\n衍生时长：\n  化妆时长 = 开播时间 - 签到时间\n  上播时长 = 关播时间 - 开播时间（自动记录）\n  课后时长 = 离岗时间 - 关播时间\n签到方式：主播通过 App 点击签到，无需额外硬件\n化妆师工作量：与主播签到记录联动，自动统计服务时长\n入职绑定：入职时分配绑定码，主播加 Line 官方号后发码完成身份绑定。',
    tags:     ['考勤', '打卡', '化妆师', '上播时长', 'Line绑定'],
  },
  {
    category: 'live_strategies',
    title:    '产品核心循环与 PMO Agent 定位',
    content:  '核心循环：对话 → Agent 提炼 → 知识库 + 任务 → 执行 → 新对话\nPMO Agent 是第一个上线的 Agent，负责：\n  接收：理解项目背景和意图\n  整理：从对话提炼决策、任务、风险\n  追踪：知道每件事状态、负责人、阻塞点\n  提醒：主动发现逾期和无人跟进的事项\nAgent 层级：PMO（协调）→ 运营 Agent / 财务 Agent / 主播端 Agent\n主播端通过 Line Official Account 与 Agent 对话，体验类似客服机器人。',
    tags:     ['PMO', 'Agent', '产品架构', 'Line', '核心循环'],
  },
]

async function run() {
  console.log('── Inserting milestones...')
  const { data: ms, error: msErr } = await supabase
    .from('milestones')
    .insert(milestones)
    .select('id, title')

  if (msErr) {
    console.error('Milestone insert failed:', msErr.message)
  } else {
    ms.forEach(m => console.log(`  ✓ ${m.title}`))
  }

  console.log('\n── Inserting knowledge...')
  const { data: kn, error: knErr } = await supabase
    .from('knowledge')
    .insert(knowledge)
    .select('id, title')

  if (knErr) {
    console.error('Knowledge insert failed:', knErr.message)
  } else {
    kn.forEach(k => console.log(`  ✓ ${k.title}`))
  }

  console.log('\nDone.')
}

run()
