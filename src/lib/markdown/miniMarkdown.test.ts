// src/lib/markdown/miniMarkdown.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { parseInline, parseMarkdown, type Block, type InlineNode } from './miniMarkdown.ts'

const text = (value: string): InlineNode => ({ type: 'text', value })
const strong = (...children: InlineNode[]): InlineNode => ({ type: 'strong', children })
const code = (value: string): InlineNode => ({ type: 'code', value })
const br: InlineNode = { type: 'break' }

// ---------- 空输入 ----------

test('parseMarkdown: 空串、纯空白、非字符串都返回空数组', () => {
  assert.deepEqual(parseMarkdown(''), [])
  assert.deepEqual(parseMarkdown('   \n\n\t\n'), [])
  assert.deepEqual(parseMarkdown(undefined as unknown as string), [])
  assert.deepEqual(parseMarkdown(null as unknown as string), [])
})

// ---------- 标题 ----------

test('parseMarkdown: ## 与 ### 是两级标题', () => {
  assert.deepEqual(parseMarkdown('## 总览\n### 日本'), [
    { type: 'heading', level: 2, children: [text('总览')] },
    { type: 'heading', level: 3, children: [text('日本')] },
  ])
})

test('parseMarkdown: # 收进二级、#### 及更深收进三级（不当成正文漏出井号）', () => {
  assert.deepEqual(parseMarkdown('# 大标题\n#### 小标题\n###### 更小'), [
    { type: 'heading', level: 2, children: [text('大标题')] },
    { type: 'heading', level: 3, children: [text('小标题')] },
    { type: 'heading', level: 3, children: [text('更小')] },
  ])
})

test('parseMarkdown: 标题去掉收尾井号，标题里可以有粗体', () => {
  assert.deepEqual(parseMarkdown('## **重点** 时段 ##'), [
    { type: 'heading', level: 2, children: [strong(text('重点')), text(' 时段')] },
  ])
})

test('parseMarkdown: 井号后不跟空格不是标题，七个井号也不是', () => {
  assert.deepEqual(parseMarkdown('##没空格'), [{ type: 'paragraph', children: [text('##没空格')] }])
  assert.deepEqual(parseMarkdown('####### 七个'), [{ type: 'paragraph', children: [text('####### 七个')] }])
})

// ---------- 段落 ----------

test('parseMarkdown: 空行分段，段内换行保留成 break', () => {
  assert.deepEqual(parseMarkdown('第一行\n第二行\n\n另一段'), [
    { type: 'paragraph', children: [text('第一行'), br, text('第二行')] },
    { type: 'paragraph', children: [text('另一段')] },
  ])
})

test('parseMarkdown: 分隔线 --- 单独成块', () => {
  assert.deepEqual(parseMarkdown('上\n\n---\n\n下'), [
    { type: 'paragraph', children: [text('上')] },
    { type: 'rule' },
    { type: 'paragraph', children: [text('下')] },
  ])
})

// ---------- 列表 ----------

test('parseMarkdown: - 无序列表（* 与 + 同样认）', () => {
  const expected: Block[] = [
    {
      type: 'list',
      ordered: false,
      start: 1,
      items: [
        { children: [text('甲')], sublist: null },
        { children: [text('乙')], sublist: null },
      ],
    },
  ]
  assert.deepEqual(parseMarkdown('- 甲\n- 乙'), expected)
  assert.deepEqual(parseMarkdown('* 甲\n+ 乙'), expected)
})

test('parseMarkdown: 两格缩进是一层嵌套，挂在上一项下面', () => {
  assert.deepEqual(parseMarkdown('- 日本\n  - 20:00 档\n  - 22:00 档\n- 韩国'), [
    {
      type: 'list',
      ordered: false,
      start: 1,
      items: [
        {
          children: [text('日本')],
          sublist: {
            type: 'list',
            ordered: false,
            start: 1,
            items: [
              { children: [text('20:00 档')], sublist: null },
              { children: [text('22:00 档')], sublist: null },
            ],
          },
        },
        { children: [text('韩国')], sublist: null },
      ],
    },
  ])
})

test('parseMarkdown: 更深的缩进压平到同一层嵌套', () => {
  const blocks = parseMarkdown('- a\n  - b\n    - c')
  assert.equal(blocks.length, 1)
  const list = blocks[0] as Extract<Block, { type: 'list' }>
  assert.equal(list.items.length, 1)
  assert.deepEqual(list.items[0].sublist?.items.map((it) => it.children), [[text('b')], [text('c')]])
})

test('parseMarkdown: 列表第一项就缩进时按顶层处理', () => {
  const blocks = parseMarkdown('  - 孤儿')
  assert.deepEqual(blocks, [
    { type: 'list', ordered: false, start: 1, items: [{ children: [text('孤儿')], sublist: null }] },
  ])
})

test('parseMarkdown: 1. 有序列表，记住起始序号', () => {
  assert.deepEqual(parseMarkdown('1. 先\n2. 后'), [
    {
      type: 'list',
      ordered: true,
      start: 1,
      items: [
        { children: [text('先')], sublist: null },
        { children: [text('后')], sublist: null },
      ],
    },
  ])
  const fromThree = parseMarkdown('3. 接着\n4. 再接') as Extract<Block, { type: 'list' }>[]
  assert.equal(fromThree[0].start, 3)
})

test('parseMarkdown: 有序列表下挂三格缩进的无序子项', () => {
  const blocks = parseMarkdown('1. 周末\n   - 提前一小时\n2. 平日') as Extract<Block, { type: 'list' }>[]
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].ordered, true)
  assert.equal(blocks[0].items.length, 2)
  assert.equal(blocks[0].items[0].sublist?.ordered, false)
  assert.deepEqual(blocks[0].items[0].sublist?.items[0].children, [text('提前一小时')])
})

test('parseMarkdown: 无序换成有序时另起一个列表', () => {
  const blocks = parseMarkdown('- 甲\n1. 乙') as Extract<Block, { type: 'list' }>[]
  assert.equal(blocks.length, 2)
  assert.deepEqual(blocks.map((b) => b.ordered), [false, true])
})

test('parseMarkdown: 缩进的续行接在上一项后面（break 隔开）', () => {
  assert.deepEqual(parseMarkdown('- 第一项\n  接着说\n- 第二项'), [
    {
      type: 'list',
      ordered: false,
      start: 1,
      items: [
        { children: [text('第一项'), br, text('接着说')], sublist: null },
        { children: [text('第二项')], sublist: null },
      ],
    },
  ])
})

test('parseMarkdown: 段落后紧跟列表、列表后不缩进的行另起段落', () => {
  assert.deepEqual(
    parseMarkdown('要点：\n- 甲\n结论'),
    [
      { type: 'paragraph', children: [text('要点：')] },
      { type: 'list', ordered: false, start: 1, items: [{ children: [text('甲')], sublist: null }] },
      { type: 'paragraph', children: [text('结论')] },
    ],
  )
})

test('parseMarkdown: 只有符号没有空格的 "-" 与 "1." 不是列表', () => {
  assert.deepEqual(parseMarkdown('-不是列表'), [{ type: 'paragraph', children: [text('-不是列表')] }])
  assert.deepEqual(parseMarkdown('2026.10 月'), [{ type: 'paragraph', children: [text('2026.10 月')] }])
})

// ---------- 表格 ----------

test('parseMarkdown: GFM 表格——表头、分隔行、数据行，对齐方式', () => {
  const md = '| 账号 | 场次 | 主档 |\n|:---|---:|:---:|\n| sample.a | 12 | 20:00 |\n| sample.b | 8 | 21:30 |'
  assert.deepEqual(parseMarkdown(md), [
    {
      type: 'table',
      align: ['left', 'right', 'center'],
      header: [[text('账号')], [text('场次')], [text('主档')]],
      rows: [
        [[text('sample.a')], [text('12')], [text('20:00')]],
        [[text('sample.b')], [text('8')], [text('21:30')]],
      ],
    },
  ])
})

test('parseMarkdown: 表格不写首尾竖线也认，未标对齐为 null', () => {
  assert.deepEqual(parseMarkdown('a | b\n--- | ---\n1 | 2'), [
    {
      type: 'table',
      align: [null, null],
      header: [[text('a')], [text('b')]],
      rows: [[[text('1')], [text('2')]]],
    },
  ])
})

test('parseMarkdown: 单元格里的粗体与行内代码', () => {
  const blocks = parseMarkdown('| 号 | 说明 |\n|---|---|\n| **sample.a** | 固定 `20:00` 开 |')
  const table = blocks[0] as Extract<Block, { type: 'table' }>
  assert.deepEqual(table.rows[0], [[strong(text('sample.a'))], [text('固定 '), code('20:00'), text(' 开')]])
})

test('parseMarkdown: 参差的行——少的补空格子、多的丢掉（同 GFM）', () => {
  const blocks = parseMarkdown('| a | b | c |\n|---|---|---|\n| 1 |\n| 1 | 2 | 3 | 4 |')
  const table = blocks[0] as Extract<Block, { type: 'table' }>
  assert.deepEqual(table.rows, [
    [[text('1')], [], []],
    [[text('1')], [text('2')], [text('3')]],
  ])
})

test('parseMarkdown: 转义的竖线留在格子里，不拆格', () => {
  const blocks = parseMarkdown('| 写法 | 意思 |\n|---|---|\n| a \\| b | 或 |')
  const table = blocks[0] as Extract<Block, { type: 'table' }>
  assert.deepEqual(table.rows[0], [[text('a | b')], [text('或')]])
})

test('parseMarkdown: 表格在空行或不含竖线的行处结束', () => {
  const blocks = parseMarkdown('| a |\n|---|\n| 1 |\n之后的段落\n\n| x |\n|---|\n\n尾巴')
  assert.deepEqual(blocks.map((b) => b.type), ['table', 'paragraph', 'table', 'paragraph'])
  assert.equal((blocks[0] as Extract<Block, { type: 'table' }>).rows.length, 1)
  assert.equal((blocks[2] as Extract<Block, { type: 'table' }>).rows.length, 0)
})

test('parseMarkdown: 段落后紧跟表格时先收段落', () => {
  const blocks = parseMarkdown('下表是近 30 天：\n| a | b |\n|---|---|\n| 1 | 2 |')
  assert.deepEqual(blocks.map((b) => b.type), ['paragraph', 'table'])
})

test('parseMarkdown: 有竖线但不是表格——没有分隔行，或分隔行列数对不上', () => {
  assert.deepEqual(parseMarkdown('20:00 | 21:00 两档'), [{ type: 'paragraph', children: [text('20:00 | 21:00 两档')] }])
  assert.deepEqual(parseMarkdown('a | b\nc | d'), [{ type: 'paragraph', children: [text('a | b'), br, text('c | d')] }])
  assert.deepEqual(
    parseMarkdown('| a | b |\n|---|'),
    [{ type: 'paragraph', children: [text('| a | b |'), br, text('|---|')] }],
  )
})

// ---------- 行内 ----------

test('parseInline: 粗体、行内代码、普通文本', () => {
  assert.deepEqual(parseInline('周五 **20:00** 开，`sample.a` 最早'), [
    text('周五 '),
    strong(text('20:00')),
    text(' 开，'),
    code('sample.a'),
    text(' 最早'),
  ])
})

test('parseInline: 粗体里可以套行内代码', () => {
  assert.deepEqual(parseInline('**看 `22:00` 档**'), [strong(text('看 '), code('22:00'), text(' 档'))])
})

test('parseInline: 代码里的星号原样保留，不当粗体', () => {
  assert.deepEqual(parseInline('`**不是粗体**`'), [code('**不是粗体**')])
})

test('parseInline: 没闭合的 ** 与反引号按原文输出', () => {
  assert.deepEqual(parseInline('**没闭合'), [text('**没闭合')])
  assert.deepEqual(parseInline('一个 ` 反引号'), [text('一个 ` 反引号')])
})

test('parseInline: 两侧是空格的 ** 不算粗体（2 ** 3 ** 4）', () => {
  assert.deepEqual(parseInline('2 ** 3 ** 4'), [text('2 ** 3 ** 4')])
})

test('parseInline: 开头 ** 后紧跟空格不算开粗体；中间两侧是空格的 ** 不算收尾', () => {
  assert.deepEqual(parseInline('** 不是粗体**'), [text('** 不是粗体**')])
  assert.deepEqual(parseInline('**甲 ** 乙**'), [strong(text('甲 ** 乙'))])
})

test('parseInline: 反斜杠转义', () => {
  assert.deepEqual(parseInline('\\*\\*字面星号\\*\\*'), [text('**字面星号**')])
})

test('parseInline: 双反引号包住含反引号的代码', () => {
  assert.deepEqual(parseInline('`` a`b ``'), [code('a`b')])
})

test('parseMarkdown: HTML 不透传——尖括号就是文本', () => {
  assert.deepEqual(parseMarkdown('<script>alert(1)</script> <b>x</b>'), [
    { type: 'paragraph', children: [text('<script>alert(1)</script> <b>x</b>')] },
  ])
})

// ---------- 换行符 ----------

test('parseMarkdown: CRLF 与 CR 和 LF 结果一致', () => {
  const lf = '## 标题\n\n- 甲\n  - 乙\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n段落\n第二行'
  const expected = parseMarkdown(lf)
  assert.deepEqual(parseMarkdown(lf.replace(/\n/g, '\r\n')), expected)
  assert.deepEqual(parseMarkdown(lf.replace(/\n/g, '\r')), expected)
  assert.equal(expected.length, 4)
})

test('parseMarkdown: 开头的 BOM 不影响首行识别', () => {
  assert.deepEqual(parseMarkdown('\uFEFF## 标题'), [{ type: 'heading', level: 2, children: [text('标题')] }])
})

// ---------- 永不抛错 ----------

test('parseMarkdown: 乱七八糟的输入不抛错，总返回数组', () => {
  const nasty = [
    '|', '||', '|-|', '| |\n| - |', '**', '***', '****', '`', '``', '- ', '-', '1.', '1. ', '#', '# ', '## ##',
    '  -', '   1.', '\t- tab', '|a|\n|-|\n|b', '\u0000', '\\', '\\|', '- a\n\n  - b', '| a\n|:-:', '> 引用', '```\ncode\n```',
  ]
  for (const s of nasty) assert.ok(Array.isArray(parseMarkdown(s)), JSON.stringify(s))

  // 确定性的伪随机拼接：只用 markdown 的结构字符，专挑边界。
  const alphabet = ['|', '-', '*', '`', '#', ' ', '  ', '\n', '\r\n', '1.', ':', '\\', 'a', '字', '**', '---']
  let seed = 42
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  for (let n = 0; n < 2000; n++) {
    let s = ''
    const len = Math.floor(rand() * 40)
    for (let i = 0; i < len; i++) s += alphabet[Math.floor(rand() * alphabet.length)]
    assert.ok(Array.isArray(parseMarkdown(s)), JSON.stringify(s))
  }
})

test('parseMarkdown: 一份完整的总结样例分出预期的块序列', () => {
  const md = [
    '## 总览',
    '',
    '近 30 天 **sample.a** 与 **sample.b** 都集中在晚间。',
    '',
    '### 主档',
    '',
    '| 账号 | 主档 | 场次 |',
    '|---|---|---:|',
    '| sample.a | 20:00 | 18 |',
    '| sample.b | 21:30 | 11 |',
    '',
    '1. 周五提前',
    '   - sample.a 提前到 19:00',
    '2. 周日休播',
  ].join('\n')
  assert.deepEqual(parseMarkdown(md).map((b) => b.type), ['heading', 'paragraph', 'heading', 'table', 'list'])
})
