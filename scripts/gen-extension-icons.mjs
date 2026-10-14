// 生成 extensions/live-shot/icons/icon-{16,24,32,48,128}.png（产物进仓库，改图形再跑一次）。
// 图形：黑底圆角方块 + TikTok 风格的青/红错位音符 + 右上角红色直播点；不写任何文字。
// 错位量按目标像素取整（至少 1px）：同一个 viewBox 直接缩到 16px 只剩半像素，青红两色会糊成一团。
// 运行：node scripts/gen-extension-icons.mjs（需要 rsvg-convert：brew install librsvg）
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'extensions', 'live-shot', 'icons')
const SIZES = [16, 24, 32, 48, 128]
const BG = '#111111'
const CYAN = '#25F4EE'
const RED = '#FE2C55'
const WHITE = '#FFFFFF'

// 音符全部用描边画：圆环符头 + 右侧竖干 + 顶部右摆的旗，坐标在 128 的 viewBox 里
const NOTE =
  '<circle cx="50" cy="86" r="17" fill="none" stroke-width="16"/>' +
  '<path d="M67 86 V26 C70 40 84 49 99 49" fill="none" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>'

function svg(size) {
  const d = (Math.max(1, Math.round(size * 0.03)) * 128) / size
  // 青色往左上、红色往右下，白色压在最上面；整体缩 0.9 往左下让一点，给直播点留白
  const layers = [
    [CYAN, -d],
    [RED, d],
    [WHITE, 0],
  ]
    .map(([color, o]) => `<g transform="translate(${o} ${o}) translate(60 63) scale(0.9) translate(-66 -64)" stroke="${color}">${NOTE}</g>`)
    .join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">` +
    `<rect width="128" height="128" rx="28" fill="${BG}"/>${layers}` +
    `<circle cx="101" cy="28" r="11" fill="${RED}" stroke="${BG}" stroke-width="5"/></svg>`
  )
}

mkdirSync(OUT, { recursive: true })
const tmp = mkdtempSync(join(tmpdir(), 'live-shot-icons-'))
for (const size of SIZES) {
  const src = join(tmp, `icon-${size}.svg`)
  writeFileSync(src, svg(size))
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), src, '-o', join(OUT, `icon-${size}.png`)])
}
console.log(`已生成 ${SIZES.map((s) => `icon-${s}.png`).join(' ')} → ${OUT}`)
