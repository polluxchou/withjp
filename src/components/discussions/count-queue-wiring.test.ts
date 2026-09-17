import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

// 讨论角标的批量取数规则(去重 / 防抖 / 分片 / 取消后重排)全在
// src/lib/discussions/count-queue.ts 里,那份有真单测钉着。这个文件没有 DOM
// 测试环境,provider 本身跑不起来 —— 所以只要 provider 自己再养一个 setTimeout
// 或自己维护一份 queue,那些单测依旧全绿,而 `next dev`(StrictMode 双挂载)下
// 角标会永远停在 loading:第一次挂载排了 flush,卸载清掉定时器,第二次挂载因为
// key 已在队列里而直接 return,flush 再也不会跑。
// 这条测试钉住「provider 只是壳」:定时器与队列只许存在于那个纯模块里。
const CTX = 'src/components/discussions/DiscussionContext.tsx'

const src = () => fs.readFileSync(CTX, 'utf8')

test('provider 走 createCountQueue,不自己实现批量取数', () => {
  const s = src()
  assert.match(s, /\bcreateCountQueue\b/, `${CTX}: 批量取数必须经 createCountQueue`)
  assert.doesNotMatch(s, /\bsetTimeout\b/, `${CTX}: 定时器只许留在 count-queue.ts,别在 provider 里再排一个`)
  assert.doesNotMatch(s, /\bclearTimeout\b/, `${CTX}: 取消定时器走 queue.cancel(),别直接 clearTimeout`)
})

test('provider 卸载时调用 queue.cancel()', () => {
  assert.match(src(), /queue\.cancel\(\)/, `${CTX}: 卸载清理必须调 queue.cancel(),否则 devtools 会看到挂着的定时器`)
})
