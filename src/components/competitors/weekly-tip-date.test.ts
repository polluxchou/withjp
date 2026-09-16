import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

// 曲线的提示框是屏幕上唯一能看到「这个数是哪天采的」的地方。日期口径有两个，
// 长得几乎一样、含义差好几天:
//   week_start  — 归一化出来的周一,只是图上的等距刻度(我们并不在周一采数)
//   captured_on — 该周实际取用的那条快照的采集日
// 提示框必须报后者,否则周二采的数会被读成周一的,新鲜度整体说早。
// 这个选择被 weeklyTipLabel() 收拢成纯函数(chart.ts,有单测钉住两条分支),
// 但组件完全可以绕过它直接写 p.week_start —— 那时纯函数还是绿的,屏幕上却错了。
// 所以这里钉住组件真的走了那个函数、且没有把 week_start 当日期喂给文案。
const CURVE = 'src/components/competitors/WeeklyFollowersCurve.tsx'

const src = () => fs.readFileSync(CURVE, 'utf8')

test('曲线提示框的日期经 weeklyTipLabel 决定，不直接用周一刻度', () => {
  const s = src()
  assert.match(s, /\bweeklyTipLabel\b/, `${CURVE}: 提示文案必须经 weeklyTipLabel 选日期与文案 key`)
  assert.doesNotMatch(
    s,
    /date:\s*p\.week_start/,
    `${CURVE}: 别把周一刻度当采集日填进提示文案，交给 weeklyTipLabel`,
  )
})

test('两条提示文案 key 三语齐备（缺一门语言就会回落成裸 key）', () => {
  for (const locale of ['zh', 'en', 'ja']) {
    const m = JSON.parse(fs.readFileSync(`messages/${locale}.json`, 'utf8'))
    for (const key of ['weeklyPointTip', 'weeklyPointTipCaptured']) {
      const v = m.competitors?.[key]
      assert.equal(typeof v, 'string', `messages/${locale}.json: competitors.${key} 缺失`)
      assert.match(v, /\{date\}/, `messages/${locale}.json: competitors.${key} 缺 {date} 占位`)
      assert.match(v, /\{count\}/, `messages/${locale}.json: competitors.${key} 缺 {count} 占位`)
    }
  }
})
