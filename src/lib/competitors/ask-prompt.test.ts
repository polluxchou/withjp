// src/lib/competitors/ask-prompt.test.ts
//
// 两类断言,分工明确:
// - 规则内容(是否算术/是否可比较/措辞要求…)全部对 RULES 原文本身断言,
//   而不是对 buildSystemPrompt(ctx, locale) 的完整输出断言。原因:完整
//   输出里混进了 15k token 的数据包 JSON,字段名(insufficient/todayTokyo/
//   displayTimeZone/sessionsInWindow…)在包里天然就会出现,拿它们当规则
//   存在与否的证据等于没测——删掉整条规则,包里同名字段还在,断言照样过。
//   评审用"删除探测"证实了这一点(见本文件末尾的 kill-table 记录)。
// - 结构性断言(整包原样嵌入/语言指令位置/未知 locale 回退)才对完整输出
//   断言,因为这些性质本来就是关于"整段 prompt 长什么样",不是关于规则
//   原文。
//
// 断言用 flat() 折叠空白后再比较,不逐字比对长句——这样规则原文里的手工
// 换行(每行约 40 字这种排版习惯)不会让锚点意外裂开,之前就在规则 6 上
// 摔过一次跟头(见 git log 里第一版实现的报告)。锚点全部挑「删掉这句、
// 规则的实质就跟着没了」的短语或字段名,不挑长句原文,避免蹭上文风调整。
import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAskContext } from './ask-context.ts'
import { ANSWER_LANGUAGE, RULES, buildSystemPrompt } from './ask-prompt.ts'
import type { CompetitorBoard, CompetitorShot, CompetitorSnapshot, CompetitorWithHistory, HistoryPoint } from './types.ts'

/** 折叠掉所有空白(含换行/缩进),规则原文与锚点都过这道折叠再比较。 */
function flat(s: string): string {
  return s.replace(/\s+/g, '')
}

const FLAT_RULES = flat(RULES)

/** 与 ask-context.test.ts 同构的最小 fixture,只为这个文件单独维护——
 *  这里要造一个字段基本齐全的真实竞品,让"整包原样嵌入"测试真的覆盖到
 *  账号层字段,而不是只嵌入一个空数组。 */
function snap(over: Partial<CompetitorSnapshot> = {}): CompetitorSnapshot {
  const captured_on = over.captured_on ?? '2026-08-17'
  return {
    id: over.id ?? 'snap-1',
    competitor_id: over.competitor_id ?? 'id-1',
    captured_on,
    followers: over.followers ?? null,
    likes: over.likes ?? null,
    videos: over.videos ?? null,
    following: over.following ?? null,
    display_name: over.display_name ?? null,
    bio: over.bio ?? null,
    language: over.language ?? 'ja',
    region: over.region ?? null,
    verified: over.verified ?? null,
    raw: over.raw ?? null,
    captured_at: over.captured_at ?? `${captured_on}T00:00:00Z`,
  }
}

function point(captured_on: string, followers: number | null): HistoryPoint {
  return { captured_on, followers, likes: null, videos: null }
}

function shot(over: Partial<CompetitorShot> = {}): CompetitorShot {
  return {
    id: over.id ?? 'shot-1',
    competitor_id: 'id-1',
    image_url: 'https://example.test/a.jpg',
    shot_on: over.shot_on ?? null,
    tag: null,
    caption: '',
    sort_order: over.sort_order ?? 0,
    created_at: '2026-08-19T13:00:00Z',
    viewer_count: over.viewer_count ?? null,
    stream_started_at: over.stream_started_at ?? null,
    captured_at: over.captured_at ?? null,
  }
}

function comp(over: Partial<CompetitorWithHistory> = {}): CompetitorWithHistory {
  const history = over.history ?? []
  const last = history.length ? history[history.length - 1] : null
  return {
    id: over.id ?? 'id-1',
    platform: 'tiktok',
    handle: over.handle ?? 'solulune',
    profile_url: '',
    display_name: over.display_name ?? null,
    note: '',
    created_at: '2026-07-01T00:00:00Z',
    parent_id: over.parent_id ?? null,
    avatar_url: null,
    region: over.region ?? '日本',
    member_count: over.member_count ?? 12,
    composition: null,
    launch_city: null,
    launched_on: null,
    mc_note: null,
    online_note: null,
    latest_videos: null,
    latest: over.latest ?? (last ? snap({ captured_on: last.captured_on, followers: last.followers }) : null),
    history,
    shots: over.shots ?? [],
    weekly: [],
    related: over.related ?? [],
  }
}

function board(competitors: CompetitorWithHistory[]): CompetitorBoard {
  return { competitors, canEdit: true }
}

// 一个真实竞品:两个粉丝快照(followers.confidence 为 ok)+ 两场带开播时刻
// 的截图(liveHabit 有实质内容)+ 一张有在线人数的截图,让 embed-verbatim
// 测试真的滚过 AskCompetitor 的各个子对象,而不是只嵌入 meta 和空数组。
const CTX = buildAskContext(
  board([comp({
    history: [point('2026-08-10', 241000), point('2026-08-17', 246200)],
    shots: [
      shot({
        id: 's1', shot_on: '2026-08-19',
        stream_started_at: '2026-08-19T12:28:00Z', captured_at: '2026-08-19T13:36:00Z',
        viewer_count: 934,
      }),
      shot({ id: 's2', shot_on: '2026-08-17', stream_started_at: '2026-08-17T12:26:00Z' }),
    ],
  })]),
  new Date('2026-08-20T01:00:00Z'),
  'zh',
)

test('RULES 是非空字符串常量', () => {
  assert.equal(typeof RULES, 'string')
  assert.ok(RULES.length > 100)
})

test('ANSWER_LANGUAGE 被冻结,运行时不能被改写', () => {
  assert.ok(Object.isFrozen(ANSWER_LANGUAGE))
})

test('prompt 内嵌完整且未改写的上下文包 JSON,覆盖真实竞品字段', () => {
  const p = buildSystemPrompt(CTX, 'zh')
  // 用同一次 JSON.stringify 结果去比对,而不是抠单个字段——这样能钉住
  // "整包原样嵌入",不会因为 prompt 文案怎么改而误判,只会在真的漏嵌数据包
  // 或改动了序列化方式时失败。
  assert.ok(p.includes(JSON.stringify(CTX, null, 2)))
  // 顺带确认 fixture 本身没有退化成空壳——否则上面这条断言会假阳性地过。
  assert.equal(CTX.competitors[0].followers.confidence, 'ok')
  assert.equal(CTX.competitors[0].liveHabit.latestStartedAtLocal, '2026-08-19 20:28')
})

test('语言指令随 locale 切换,未知 locale 回落中文', () => {
  assert.ok(buildSystemPrompt(CTX, 'zh').includes(ANSWER_LANGUAGE.zh))
  assert.ok(buildSystemPrompt(CTX, 'en').includes(ANSWER_LANGUAGE.en))
  assert.ok(buildSystemPrompt(CTX, 'ja').includes(ANSWER_LANGUAGE.ja))
  assert.ok(buildSystemPrompt(CTX, 'fr').includes(ANSWER_LANGUAGE.zh))
})

test('语言指令排在数据包之后,且带"不受中文规则文案影响"的免疫声明', () => {
  const p = buildSystemPrompt(CTX, 'en')
  assert.ok(
    p.indexOf(JSON.stringify(CTX, null, 2)) < p.indexOf(ANSWER_LANGUAGE.en),
    'language 指令必须排在数据包之后,不能被切在规则和数据包中间',
  )
  // 负向断言:en 的 prompt 不应该包含中文回答指令那句话——这条防的是
  // "language 写对了、但顺手把 zh 的那句也留在了输出里"这类回归。
  assert.ok(!p.includes(ANSWER_LANGUAGE.zh))
})

test('规则1:禁止算术,数字必须原样引用;日期偏移推算不算算术', () => {
  assert.ok(FLAT_RULES.includes(flat('不做任何算术')))
  assert.ok(FLAT_RULES.includes(flat('不要相加、相减、求平均、估算或外推')))
  assert.ok(FLAT_RULES.includes(flat('不算本条')), '日期偏移推算的豁免必须存在,否则"昨天"都答不出来')
})

test('规则2:insufficient 门槛只挡变化/规律结论,followers.latest/on 例外可用于规模排名', () => {
  assert.ok(FLAT_RULES.includes(flat('禁止用于比较、排序或趋势结论')))
  assert.ok(FLAT_RULES.includes(flat('点名列出被排除在外的账号')))
  // 新增的一句是这条规则真正的修复点:没有它,"谁粉丝最多"会被误判成
  // 要求排除掉所有 insufficient 账号。
  assert.ok(FLAT_RULES.includes(flat('followers.latest 与 followers.on 是硬事实')))
})

test('规则3:采集派生字段(不止 capturedDates)只回答"采到了什么",不回答"发生过什么"', () => {
  assert.ok(FLAT_RULES.includes(flat('绝不能推断为没有开播')))
  assert.ok(FLAT_RULES.includes(flat('正确措辞')))
  assert.ok(FLAT_RULES.includes(flat('错误措辞')))
  // 覆盖面扩展到 recentSessionsLocal/latestStartedAtLocal 等字段,不止
  // capturedDates 一个——这是本轮评审 I2 的修复点。
  assert.ok(FLAT_RULES.includes(flat('liveHabit.recentSessionsLocal')))
  assert.ok(FLAT_RULES.includes(flat('liveHabit.latestStartedAtLocal')))
})

test('规则4:liveHabit 的 insufficient 门槛也盖住 sessionsInWindow 与 recentSessionsLocal 的原始时刻,且按形状而非关键词判断', () => {
  assert.ok(FLAT_RULES.includes(flat('还包括 sessionsInWindow 与 recentSessionsLocal')))
  // 形状化的三条硬约束——用词不设防、只卡"并列时刻/归纳性措辞"这个结构,
  // 绕不过「不说"经常"就算合规」这种最省事的规避。
  assert.ok(FLAT_RULES.includes(flat('不能在同一句话里并列两个及以上开播时刻')))
  assert.ok(FLAT_RULES.includes(flat('不能使用「都在」「前后」「差不多」「集中在」')))
})

test('规则5:latestStartedAtLocal 不受第4条约束,但措辞必须是"采集到的"而非"上次开播"', () => {
  assert.ok(FLAT_RULES.includes(flat('不受第 4 条约束')))
  assert.ok(FLAT_RULES.includes(flat('不能被当成规律的证据')))
  // C2 的修复点:字段代表的是"采集到的最近一场",不是"最近一场"本身。
  assert.ok(FLAT_RULES.includes(flat('最近一次采集到的开播是 X')))
  assert.ok(FLAT_RULES.includes(flat('规则 3 的"没记录不代表没发生"同样适用于这个字段')))
})

test('规则6:peakViewersAllTime 是全量历史峰值,不是最近一场的峰值;跨账号排名要附 shots.total', () => {
  assert.ok(FLAT_RULES.includes(flat('peakViewersAllTime')))
  assert.ok(FLAT_RULES.includes(flat('最近一场直播的峰值')))
  assert.ok(FLAT_RULES.includes(flat('请附上 shots.total')))
})

test('规则7:lastShotUptimeMinutes 归属 lastShotUptimeAtLocal 而非 lastOn,且是下限', () => {
  assert.ok(FLAT_RULES.includes(flat('lastShotUptimeMinutes')))
  assert.ok(FLAT_RULES.includes(flat('lastShotUptimeAtLocal')))
  assert.ok(FLAT_RULES.includes(flat('不一定是 lastOn')))
  assert.ok(FLAT_RULES.includes(flat('是这场直播时长的下限')))
})

test('规则8:regionMismatch 为 true 时必须提示冲突;为 false 不等于region已核实', () => {
  assert.ok(FLAT_RULES.includes(flat('必须提示这处冲突')))
  assert.ok(FLAT_RULES.includes(flat('不要径直断言')))
  // I6 的补充点:false 只是"没触发校验",不是"确认过没错"。
  assert.ok(FLAT_RULES.includes(flat('未见冲突')))
  assert.ok(FLAT_RULES.includes(flat('确认无误')))
})

test('规则9:相对日期以 meta.todayTokyo 为基准;四个 *Local 字段已换算,不可再转时区', () => {
  assert.ok(FLAT_RULES.includes(flat('todayTokyo')))
  assert.ok(FLAT_RULES.includes(flat('meta.displayTimeZone 换算好了')))
  assert.ok(FLAT_RULES.includes(flat('不要再自己做时区转换')))
  // C1 的修复点:不止 slots[].at,latestStartedAtLocal/recentSessionsLocal[]/
  // lastShotUptimeAtLocal 三个字段同样已经是本地时间,不是 UTC。
  assert.ok(FLAT_RULES.includes(flat('liveHabit.latestStartedAtLocal')))
  assert.ok(FLAT_RULES.includes(flat('shots.lastShotUptimeAtLocal')))
})

test('规则10:null 只代表未记录/未采到,不是 0 也不是"没有";delta 的 0 与 null 要分清', () => {
  assert.ok(FLAT_RULES.includes(flat('members: null 不能读成团队规模最小')))
  assert.ok(FLAT_RULES.includes(flat('followers.delta 为 0')))
  assert.ok(FLAT_RULES.includes(flat('followers.delta 为 null')))
})

test('规则11:isChild/parentHandle 的团属关系;coverage.roots 与 coverage.competitors 不能混用', () => {
  assert.ok(FLAT_RULES.includes(flat('isChild 为 true 的条目是下探出来的子主播')))
  assert.ok(FLAT_RULES.includes(flat('meta.coverage.roots')))
  assert.ok(FLAT_RULES.includes(flat('meta.coverage.competitors')))
})

test('规则12:跨账号排名 followers.latest 时,采集日期不同,要附上 on', () => {
  assert.ok(FLAT_RULES.includes(flat('各账号的 on(采集日期)并不相同')))
  assert.ok(FLAT_RULES.includes(flat('9 个不同的采集日')))
})

test('规则13:未收录账号按 handle 与 name 双路匹配,给相近账号,不编造', () => {
  assert.ok(FLAT_RULES.includes(flat('数据包里找不到时')))
  assert.ok(FLAT_RULES.includes(flat('同时按 handle 与 name 两种方式去匹配')))
  assert.ok(FLAT_RULES.includes(flat('不要编造一个不存在的账号')))
})

test('回答风格:默认简洁,但"是否开播"类问题必须带 captureNote,不受简洁原则压制', () => {
  const p = buildSystemPrompt(CTX, 'zh')
  assert.ok(p.includes('meta.captureNote'))
  assert.ok(p.includes('这条例外优先于上面的"默认简洁"'))
})

test('落笔前提醒:三条一行版复述规则1/2/3,夹在数据包与语言指令之间', () => {
  const p = buildSystemPrompt(CTX, 'zh')
  const packIdx = p.indexOf(JSON.stringify(CTX, null, 2))
  const reminderIdx = p.indexOf('落笔前再确认三条')
  const langIdx = p.indexOf(ANSWER_LANGUAGE.zh)
  assert.ok(packIdx < reminderIdx && reminderIdx < langIdx)
})
