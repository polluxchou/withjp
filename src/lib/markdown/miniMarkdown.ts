// src/lib/markdown/miniMarkdown.ts
// 极简 markdown → 块级 AST。只认「开播时段趋势总结」实际会用到的那几样：
//   块级：## / ### 标题、段落、- 无序列表（比第一项多缩两格 = 一层嵌套）、1. 有序列表、GFM 竖线表格、--- 分隔线
//   行内：**粗体**、`代码`、普通文本、反斜杠转义
// 其余语法（链接、斜体、引用、代码块、HTML……）一律当普通文字原样留着，绝不抛错。
//
// 为什么不引一个现成的 markdown 库：node_modules 是共享的软链，这个仓不新增依赖；
// 而且总结只用这么一小撮语法，几百行就能写全、写死、测全。
//
// 安全性靠构造保证：这里只产出数据（字符串 + 结构），渲染端（MarkdownBlocks.tsx）把它们
// 交给 React 当文本节点输出，从不走 dangerouslySetInnerHTML——正文里的 <script> 就是几个字符。

export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: InlineNode[] }
  | { type: 'code'; value: string }
  /** 段内换行：总结里的换行多半是作者有意分行，照原样断开，不像标准 markdown 那样合并成空格。 */
  | { type: 'break' }

export interface ListItem {
  children: InlineNode[]
  /** 只支持一层嵌套；更深的缩进压平到这一层。 */
  sublist: ListBlock | null
}

export interface ListBlock {
  type: 'list'
  ordered: boolean
  /** 有序列表的起始序号（"3." 开头就从 3 数）；无序列表恒为 1。 */
  start: number
  items: ListItem[]
}

export type TableAlign = 'left' | 'center' | 'right' | null

export interface TableBlock {
  type: 'table'
  align: TableAlign[]
  header: InlineNode[][]
  /** 每行的格子数已补齐/截齐到表头列数（同 GFM：少的补空，多的丢掉）。 */
  rows: InlineNode[][][]
}

export type Block =
  /** level 是 markdown 语义层级：# / ## → 2，### 及更深 → 3。渲染成几号 h 元素由渲染端定。 */
  | { type: 'heading'; level: 2 | 3; children: InlineNode[] }
  | { type: 'paragraph'; children: InlineNode[] }
  | ListBlock
  | TableBlock
  | { type: 'rule' }

// ---------------------------------------------------------------- 行内

/** 反斜杠能转义的标点（CommonMark 的 ASCII 标点子集里与本解析器有关的那些）。 */
const ESCAPABLE = new Set(['\\', '`', '*', '_', '#', '+', '-', '.', '!', '|', '[', ']', '(', ')', '<', '>', '~', '{', '}'])

const isSpace = (ch: string | undefined) => ch === undefined || /\s/.test(ch)

function pushText(out: InlineNode[], value: string) {
  if (!value) return
  const last = out[out.length - 1]
  if (last && last.type === 'text') last.value += value
  else out.push({ type: 'text', value })
}

/** 从 from 起找恰好 n 个反引号的一段（前后都不紧挨反引号），返回起点；找不到返回 -1。 */
function findBacktickRun(src: string, n: number, from: number): number {
  let i = from
  while (i < src.length) {
    const at = src.indexOf('`', i)
    if (at === -1) return -1
    let len = 1
    while (src[at + len] === '`') len++
    if (len === n) return at
    i = at + len
  }
  return -1
}

/**
 * 从 from 起找粗体的收尾 **：前一个字符不能是空白（"2 ** 3" 不是粗体），
 * 跳过转义字符与成对的代码段（`**` 在代码里不算收尾）。找不到返回 -1。
 */
function findStrongClose(src: string, from: number): number {
  let i = from
  while (i < src.length - 1) {
    const ch = src[i]
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === '`') {
      let n = 1
      while (src[i + n] === '`') n++
      const close = findBacktickRun(src, n, i + n)
      i = close === -1 ? i + n : close + n
      continue
    }
    if (ch === '*' && src[i + 1] === '*' && !isSpace(src[i - 1])) return i
    i++
  }
  return -1
}

/** 解析一行里的行内标记。输入里不该有换行（块级解析按行切好再送进来）。 */
export function parseInline(src: string): InlineNode[] {
  const out: InlineNode[] = []
  let buf = ''
  const flush = () => {
    pushText(out, buf)
    buf = ''
  }
  // 某次从 failedFrom 起没找到收尾 **，之后更靠右的开头也不可能找到：直接当字面量，
  // 免得一长串不配对的 ** 每个都扫到行尾（平方级）。
  let failedFrom = Infinity
  let i = 0
  while (i < src.length) {
    const ch = src[i]

    if (ch === '\\' && i + 1 < src.length && ESCAPABLE.has(src[i + 1])) {
      buf += src[i + 1]
      i += 2
      continue
    }

    if (ch === '`') {
      let n = 1
      while (src[i + n] === '`') n++
      const close = findBacktickRun(src, n, i + n)
      if (close === -1) {
        buf += src.slice(i, i + n)
        i += n
        continue
      }
      let value = src.slice(i + n, close)
      // CommonMark：两头各有一个空格且不全是空格时各剥一个，好让 `` `x` `` 这种写法成立。
      if (value.length >= 2 && value.startsWith(' ') && value.endsWith(' ') && value.trim() !== '') {
        value = value.slice(1, -1)
      }
      flush()
      out.push({ type: 'code', value })
      i = close + n
      continue
    }

    if (ch === '*' && src[i + 1] === '*') {
      // 开头的 ** 后面不能紧跟空白；收尾至少隔一个字符。
      const from = i + 3
      const close = !isSpace(src[i + 2]) && from < failedFrom ? findStrongClose(src, from) : -1
      if (close === -1) {
        if (!isSpace(src[i + 2]) && from < failedFrom) failedFrom = from
        buf += '**'
        i += 2
        continue
      }
      flush()
      out.push({ type: 'strong', children: parseInline(src.slice(i + 2, close)) })
      i = close + 2
      continue
    }

    buf += ch
    i++
  }
  flush()
  return out
}

// ---------------------------------------------------------------- 块级

const RULE_RE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/
const HEADING_RE = /^ {0,3}(#{1,6})\s+(.*)$/
const BULLET_RE = /^(\s*)[-*+]\s+(.*)$/
const ORDERED_RE = /^(\s*)(\d{1,9})[.)]\s+(.*)$/
const SEPARATOR_CELL_RE = /^:?-+:?$/

/** 行首缩进宽度：tab 按 4 格算。 */
function indentOf(line: string): number {
  let n = 0
  for (const ch of line) {
    if (ch === ' ') n++
    else if (ch === '\t') n += 4
    else break
  }
  return n
}

/** 一行里有没有没被转义的竖线。 */
function hasPipe(line: string): boolean {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\') i++
    else if (line[i] === '|') return true
  }
  return false
}

/**
 * 按没转义的竖线拆格，去掉首尾各一根竖线、每格去首尾空白。
 * 转义的 \| 原样留在格子里，交给 parseInline 还原成 |。
 */
function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  const cells: string[] = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '\\' && i + 1 < s.length) {
      cur += ch + s[i + 1]
      i++
    } else if (ch === '|') {
      cells.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  cells.push(cur.trim())
  return cells
}

/** 分隔行（|:---|---:|）解析成各列对齐；不是分隔行返回 null。分隔行本身也要带竖线。 */
function parseSeparator(line: string): TableAlign[] | null {
  if (!hasPipe(line)) return null
  const cells = splitRow(line)
  if (!cells.every((c) => SEPARATOR_CELL_RE.test(c))) return null
  return cells.map((c) => {
    const left = c.startsWith(':')
    const right = c.endsWith(':')
    return left && right ? 'center' : right ? 'right' : left ? 'left' : null
  })
}

/** 表格行 → 格子，补齐/截齐到 width 列。 */
function tableRow(line: string, width: number): InlineNode[][] {
  const cells = splitRow(line).slice(0, width)
  while (cells.length < width) cells.push('')
  return cells.map((c) => parseInline(c))
}

/**
 * 去掉标题的收尾井号（"## 标题 ##" → "标题"）。井号前必须是空白才算收尾，"C#" 里的不动；
 * 整行只剩井号返回空串。
 *
 * 不用 /(^|\s+)#+\s*$/ 这类正则：标题中间夹一长串空白时它逐个起点回溯，是平方级的
 * （4 万个空格实测七百多毫秒）。这里只从尾部往前扫一遍。
 */
function stripClosingHashes(raw: string): string {
  const s = raw.trimEnd()
  let end = s.length
  while (end > 0 && s[end - 1] === '#') end--
  if (end === s.length) return s.trim()
  if (end === 0) return ''
  return isSpace(s[end - 1]) ? s.slice(0, end).trim() : s.trim()
}

function appendLine(children: InlineNode[], text: string) {
  if (children.length > 0) children.push({ type: 'break' })
  for (const node of parseInline(text)) {
    if (node.type === 'text') pushText(children, node.value)
    else children.push(node)
  }
}

/** 解析 markdown 正文成块列表。任何输入都返回数组，不抛错。 */
export function parseMarkdown(input: string): Block[] {
  if (typeof input !== 'string' || input.trim() === '') return []
  try {
    return parseBlocks(input)
  } catch {
    // 按构造不该走到这里（有随机输入的测试兜着）。真出了 bug 也只退化成按行显示原文，
    // 不让一份写坏的总结把整页渲染打崩——页面上没有错误边界。
    const children: InlineNode[] = []
    for (const line of input.split(/\r\n?|\n/)) {
      if (line.trim()) appendLine(children, line.trim())
    }
    return [{ type: 'paragraph', children }]
  }
}

function parseBlocks(input: string): Block[] {
  const lines = input.replace(/^\uFEFF/, '').split(/\r\n?|\n/)
  const blocks: Block[] = []

  // 当前正在累积的块：段落、列表、表格三选一（或都没有）。新块开始时前一个自然结束——
  // 它们在推进 blocks 时就已经是同一个对象，后续行直接往里追加。
  let paragraph: { type: 'paragraph'; children: InlineNode[] } | null = null
  let list: ListBlock | null = null
  let table: TableBlock | null = null
  // 当前列表第一项的缩进 = 这个列表的顶层基准。整体缩进两格写的列表（"  - a\n  - b"）
  // 每项都是顶层；比基准再多缩两格才是嵌套。新开列表时重设，所以 close() 不用管它。
  let listIndent = 0
  const close = () => {
    paragraph = null
    list = null
    table = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.trim() === '') {
      close()
      continue
    }

    if (table) {
      if (hasPipe(line)) {
        table.rows.push(tableRow(line, table.header.length))
        continue
      }
      close()
    }

    if (RULE_RE.test(line)) {
      close()
      blocks.push({ type: 'rule' })
      continue
    }

    const heading = HEADING_RE.exec(line)
    if (heading) {
      close()
      // 整行只有井号的空标题不输出。
      const content = stripClosingHashes(heading[2])
      if (content) blocks.push({ type: 'heading', level: heading[1].length <= 2 ? 2 : 3, children: parseInline(content) })
      continue
    }

    // 表格：本行带竖线、下一行是列数相同的分隔行。可以打断段落与列表（先收掉它们）。
    if (hasPipe(line) && i + 1 < lines.length) {
      const align = parseSeparator(lines[i + 1])
      const header = splitRow(line)
      if (align && align.length === header.length) {
        close()
        table = { type: 'table', align, header: header.map((c) => parseInline(c)), rows: [] }
        blocks.push(table)
        i++ // 分隔行已消费
        continue
      }
    }

    const bullet = BULLET_RE.exec(line)
    const ordered = bullet ? null : ORDERED_RE.exec(line)
    if (bullet || ordered) {
      const indent = indentOf(line)
      const isOrdered = Boolean(ordered)
      const start = ordered ? Number(ordered[2]) : 1
      const item: ListItem = { children: parseInline((bullet ? bullet[2] : ordered![3]).trim()), sublist: null }
      paragraph = null
      const current: ListBlock | null = list
      if (current && indent >= listIndent + 2 && current.items.length > 0) {
        // 比基准多缩 ≥ 2 格：挂到上一项下面。子列表的有序/无序按它的第一项定，后来混进的另一种也并进去（少见，不另起）。
        const parent = current.items[current.items.length - 1]
        if (!parent.sublist) parent.sublist = { type: 'list', ordered: isOrdered, start, items: [] }
        parent.sublist.items.push(item)
      } else if (current && current.ordered === isOrdered) {
        current.items.push(item)
      } else {
        close()
        const next: ListBlock = { type: 'list', ordered: isOrdered, start, items: [item] }
        listIndent = indent
        list = next
        blocks.push(next)
      }
      continue
    }

    // 列表里缩进的续行：接到最深的最后一项后面。不缩进的普通行则结束列表、另起段落。
    const openList: ListBlock | null = list
    if (openList && indentOf(line) >= 2) {
      const last = openList.items[openList.items.length - 1]
      const target = last.sublist ? last.sublist.items[last.sublist.items.length - 1] : last
      appendLine(target.children, line.trim())
      continue
    }

    const openParagraph: { type: 'paragraph'; children: InlineNode[] } | null = paragraph
    if (openParagraph) {
      appendLine(openParagraph.children, line.trim())
      continue
    }
    close()
    const next: { type: 'paragraph'; children: InlineNode[] } = { type: 'paragraph', children: [] }
    appendLine(next.children, line.trim())
    paragraph = next
    blocks.push(next)
  }

  return blocks
}
