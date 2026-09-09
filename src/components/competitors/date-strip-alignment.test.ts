import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

// 截图日期条是屏幕上唯一能看到日期的地方 —— 相册格子里不写任何日期文字,所以
// 日期 chip 必须正好落在它标注的那一列上方。可两边的网格轨道是各自写死的:
// 卡片正文(曲线列 / 相册列)与日期条(标签列 / 日期列)。只改一边,日期就开始
// 指着隔壁列念,而这事没有任何自动化信号 —— PR 282 把卡片从 1fr/2fr 调成
// 2fr/3fr 时漏了日期条这一层,1280px 下日期 chip 整体左偏 132px(格心
// 471/620/768/917/1066 对相册 604/723/842/961/1080),只能靠肉眼撞见;
// 双列断点也曾错开一档(卡片 max-lg 收单列、日期条还是 max-md),768-1023px 整段偏。
// 这条测试把「两处必须逐字一致」钉住:要改比例或断点,同时改两个文件即可。
const CARD = 'src/components/competitors/CompetitorCard.tsx'
const STRIP = 'src/components/competitors/ShotDateStrip.tsx'
// 轨道声明 + 中间的 gap 等工具类 + 收单列的断点,整段一起比,任一处不同都算漂移。
const TRACKS = /grid-cols-\[minmax\(0,\d+fr\)_minmax\(0,\d+fr\)\][^"']*?max-[a-z]{2}:grid-cols-1/g

function trackSpec(file: string): string {
  const hits = fs.readFileSync(file, 'utf8').match(TRACKS) ?? []
  assert.equal(hits.length, 1, `${file}: 期望恰好一处双列轨道声明,实测 ${hits.length} 处`)
  return hits[0]
}

test('日期条与竞品卡共用同一套网格轨道和收单列断点', () => {
  assert.equal(trackSpec(STRIP), trackSpec(CARD))
})
