// 生成 extensions/live-shot/generated/page-reader.js：扩展注入直播间页面的读取函数。
// 源头是 src/lib/competitors/pageReader.ts（复用 liveProbe.ts 的判据），生成文件禁止手改。
// 运行：node --experimental-strip-types scripts/gen-extension-reader.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderReaderModule } from '../src/lib/competitors/pageReader.ts'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'extensions', 'live-shot', 'generated', 'page-reader.js')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, renderReaderModule())
console.log(`✓ ${out}`)
