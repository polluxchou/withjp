// src/components/competitors/live/MarkdownBlocks.tsx
// 把 lib/markdown/miniMarkdown 解析出的块渲染成 React 元素。
// 只输出元素与文本节点，从不 dangerouslySetInnerHTML：正文里的尖括号就是字符（安全性见 miniMarkdown.ts 顶部）。
// 排版照评审过的 mock：正文 14px / 行高 1.7，二级标题 17px，表格放在带边框的圆角盒子里、超宽时盒内横滚。
import type { CSSProperties } from 'react'
import type { Block, InlineNode, ListBlock, TableAlign } from '@/lib/markdown/miniMarkdown'

const ALIGN: Record<Exclude<TableAlign, null>, CSSProperties['textAlign']> = {
  left: 'left',
  center: 'center',
  right: 'right',
}

function Inline({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case 'text':
            return <span key={i}>{node.value}</span>
          case 'strong':
            return (
              <strong key={i} className="font-semibold text-ink-900">
                <Inline nodes={node.children} />
              </strong>
            )
          case 'code':
            return (
              <code key={i} className="rounded bg-line-soft px-1 py-px font-mono text-[0.9em] text-ink-900">
                {node.value}
              </code>
            )
          case 'break':
            return <br key={i} />
        }
      })}
    </>
  )
}

/** 列表：一层嵌套。子列表收紧上下间距、换成空心圆点，与上一层分得开。 */
function List({ list, nested = false }: { list: ListBlock; nested?: boolean }) {
  const Tag = list.ordered ? 'ol' : 'ul'
  const marker = list.ordered ? 'list-decimal' : nested ? 'list-[circle]' : 'list-disc'
  return (
    <Tag
      start={list.ordered && list.start !== 1 ? list.start : undefined}
      className={`${marker} pl-5 marker:text-ink-400 ${nested ? 'my-1' : 'mb-2.5 mt-1.5'}`}
    >
      {list.items.map((item, i) => (
        <li key={i} className="my-[3px]">
          <Inline nodes={item.children} />
          {item.sublist && <List list={item.sublist} nested />}
        </li>
      ))}
    </Tag>
  )
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'heading':
      // 文章卡片的标题是 h2，正文里的 ## 降一级成 h3、### 成 h4，页面标题层级不乱。
      return block.level === 2 ? (
        <h3 className="mb-2.5 mt-7 text-[17px] font-semibold text-ink-900">
          <Inline nodes={block.children} />
        </h3>
      ) : (
        <h4 className="mb-2 mt-5 text-lg font-semibold leading-snug text-ink-900">
          <Inline nodes={block.children} />
        </h4>
      )
    case 'paragraph':
      return (
        <p className="my-2.5">
          <Inline nodes={block.children} />
        </p>
      )
    case 'list':
      return <List list={block} />
    case 'rule':
      return <hr className="my-5 border-line" />
    case 'table':
      // 表格超宽时只在自己的盒子里横滚，整页不出横向滚动条；表头不折行，数字列等宽对齐。
      return (
        <div className="mb-3.5 mt-2.5 overflow-x-auto rounded-field border border-line" data-md-table>
          <table className="w-full border-collapse text-sm leading-[1.7] tabular-nums">
            <thead>
              <tr>
                {block.header.map((cell, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="whitespace-nowrap border-b border-line bg-canvas px-3 py-[7px] text-left font-medium text-ink-500"
                    style={block.align[i] ? { textAlign: ALIGN[block.align[i]!] } : undefined}
                  >
                    <Inline nodes={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-b border-line-soft last:border-b-0">
                  {row.map((cell, i) => (
                    <td
                      key={i}
                      className="px-3 py-[7px] align-top"
                      style={block.align[i] ? { textAlign: ALIGN[block.align[i]!] } : undefined}
                    >
                      <Inline nodes={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}

/** 一份总结的正文。首块不留上边距、末块不留下边距，贴住卡片的内边距。 */
export default function MarkdownBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="text-md leading-[1.7] text-ink-700 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  )
}
