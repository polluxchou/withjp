'use client'

import { useMemo, useState } from 'react'
import type { Expense, ExpenseCategory } from '@/lib/types'
import { EXPENSE_CATEGORY_LABELS, crossBorderFee, effectiveCost } from '@/lib/expenses/costs'
import { useCurrency } from '@/lib/currency'

// ── Layout constants ──────────────────────────────────────────────
// SVG_W matches typical content-area width so scale factor ≈ 1 and
// text does not blow up on wide screens.
const SVG_W    = 860
const LABEL_W  = 76    // label area on each side
const NODE_W   = 8     // bar width
const DATA_H   = 190   // SVG units for 100% of spend
const NODE_GAP = 6     // gap between nodes in same column

const SX1 = LABEL_W + NODE_W          // right edge of source nodes
const TX0 = SVG_W - LABEL_W - NODE_W  // left edge of target nodes
const CX  = (SX1 + TX0) / 2          // bezier control-point x

const CROSS_BORDER_BUYERS = new Set(['chenhao', 'xiaoshou'])
const BUYER_DISPLAY: Record<string, string> = { chenhao: '陈昊', xiaoshou: '小兽' }

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  tangible_asset:  '#6366f1',
  salary:          '#f59e0b',
  rent:            '#10b981',
  travel:          '#3b82f6',
  office_supplies: '#8b5cf6',
  cloud_services:  '#ec4899',
}

// ── Types ─────────────────────────────────────────────────────────
interface SankeyNode {
  id:    string
  label: string
  value: number
  color: string
  y0:   number   // top y
  y1:   number   // bottom y
  col:  0 | 1
}

interface SankeyLink {
  id:          string
  source:      string
  target:      string
  value:       number
  crossBorder: number
  sy0: number; sy1: number   // source y start / end
  ty0: number; ty1: number   // target y start / end
  color:       string
}

// ── Layout computation ────────────────────────────────────────────
function computeLayout(
  expenses: Expense[],
  selectedCategory: string,
): { catNodes: SankeyNode[]; buyerNodes: SankeyNode[]; links: SankeyLink[]; chartH: number } {
  const src = selectedCategory
    ? expenses.filter((e) => e.expense_category === selectedCategory)
    : expenses

  if (src.length === 0) return { catNodes: [], buyerNodes: [], links: [], chartH: 0 }

  // Accumulate per-category, per-buyer, per-pair totals
  const catMap    = new Map<string, number>()
  const buyerMap  = new Map<string, { total: number; crossBorder: number }>()
  const pairMap   = new Map<string, Map<string, { value: number; crossBorder: number }>>()

  for (const e of src) {
    const cat   = e.expense_category
    const buyer = (e.buyer_name ?? '').trim() || '—'
    const eff   = effectiveCost(e)
    const cb    = crossBorderFee(e)

    catMap.set(cat, (catMap.get(cat) ?? 0) + eff)
    const prevB = buyerMap.get(buyer) ?? { total: 0, crossBorder: 0 }
    buyerMap.set(buyer, { total: prevB.total + eff, crossBorder: prevB.crossBorder + cb })

    if (!pairMap.has(cat)) pairMap.set(cat, new Map())
    const m = pairMap.get(cat)!
    const prev = m.get(buyer) ?? { value: 0, crossBorder: 0 }
    m.set(buyer, { value: prev.value + eff, crossBorder: prev.crossBorder + cb })
  }

  const grandTotal = Array.from(catMap.values()).reduce((s, v) => s + v, 0)
  if (grandTotal === 0) return { catNodes: [], buyerNodes: [], links: [], chartH: 0 }

  const scale = (v: number) => (v / grandTotal) * DATA_H

  // Build category nodes (sorted by value desc)
  const catEntries = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1])

  let yAcc = 0
  const catNodes: SankeyNode[] = catEntries.map(([cat, val]) => {
    const h    = scale(val)
    const node = { id: cat, label: EXPENSE_CATEGORY_LABELS[cat as ExpenseCategory] ?? cat,
                   value: val, color: CATEGORY_COLORS[cat as ExpenseCategory] ?? '#94a3b8',
                   y0: yAcc, y1: yAcc + h, col: 0 as const }
    yAcc += h + NODE_GAP
    return node
  })

  // Build buyer nodes (sorted by value desc)
  const buyerEntries = Array.from(buyerMap.entries()).sort((a, b) => b[1].total - a[1].total)
  yAcc = 0
  const buyerNodes: SankeyNode[] = buyerEntries.map(([buyer, { total, crossBorder }]) => {
    const h    = scale(total)
    const node = { id: buyer, label: BUYER_DISPLAY[buyer] ?? buyer,
                   value: total, color: crossBorder > 0 ? '#f43f5e' : '#94a3b8',
                   y0: yAcc, y1: yAcc + h, col: 1 as const }
    yAcc += h + NODE_GAP
    return node
  })

  const chartH = Math.max(
    catNodes.at(-1)?.y1   ?? DATA_H,
    buyerNodes.at(-1)?.y1 ?? DATA_H,
  ) + 16

  // Build links — track cumulative y-offset within each node
  const srcOff = new Map(catNodes.map((n)   => [n.id, n.y0]))
  const tgtOff = new Map(buyerNodes.map((n) => [n.id, n.y0]))

  const links: SankeyLink[] = []
  for (const catNode of catNodes) {
    const pairs = pairMap.get(catNode.id)
    if (!pairs) continue
    // Sort pairs by buyer value desc for visual consistency
    const sorted = Array.from(pairs.entries()).sort((a, b) => {
      const bA = buyerMap.get(a[0])?.total ?? 0
      const bB = buyerMap.get(b[0])?.total ?? 0
      return bB - bA
    })
    for (const [buyer, { value, crossBorder }] of sorted) {
      if (value === 0) continue
      const lh  = scale(value)
      const sy0 = srcOff.get(catNode.id)!
      const ty0 = tgtOff.get(buyer)!
      links.push({
        id: `${catNode.id}→${buyer}`,
        source: catNode.id, target: buyer,
        value, crossBorder,
        sy0, sy1: sy0 + lh,
        ty0, ty1: ty0 + lh,
        color: catNode.color,
      })
      srcOff.set(catNode.id, sy0 + lh)
      tgtOff.set(buyer,      ty0 + lh)
    }
  }

  return { catNodes, buyerNodes, links, chartH }
}

// ── Component ─────────────────────────────────────────────────────
interface Props {
  expenses:         Expense[]
  selectedCategory: string
}

export default function ExpenseSankeyChart({ expenses, selectedCategory }: Props) {
  const [activeLink, setActiveLink] = useState<string | null>(null)
  const [activeNode, setActiveNode] = useState<string | null>(null)

  const { fmt } = useCurrency()
  const fmtC = (v: number) => fmt(v, { compact: true })

  const { catNodes, buyerNodes, links, chartH } = useMemo(
    () => computeLayout(expenses, selectedCategory),
    [expenses, selectedCategory],
  )

  if (links.length === 0) return null

  const isActive  = (l: SankeyLink) =>
    activeLink === l.id || activeNode === l.source || activeNode === l.target
  const isAnyActive = activeLink !== null || activeNode !== null

  function linkOpacity(l: SankeyLink) {
    if (!isAnyActive)  return 0.22
    return isActive(l) ? 0.52 : 0.05
  }

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${chartH}`}
      className="w-full"
      style={{ maxHeight: 300, overflow: 'visible' }}
    >
      {/* ── Links ── */}
      {links.map((l) => {
        const d = [
          `M ${SX1} ${l.sy0}`,
          `C ${CX} ${l.sy0} ${CX} ${l.ty0} ${TX0} ${l.ty0}`,
          `L ${TX0} ${l.ty1}`,
          `C ${CX} ${l.ty1} ${CX} ${l.sy1} ${SX1} ${l.sy1}`,
          'Z',
        ].join(' ')
        return (
          <path
            key={l.id}
            d={d}
            fill={l.color}
            opacity={linkOpacity(l)}
            style={{ transition: 'opacity 120ms' }}
            onMouseEnter={() => setActiveLink(l.id)}
            onMouseLeave={() => setActiveLink(null)}
            className="cursor-pointer"
          />
        )
      })}

      {/* ── Category nodes ── */}
      {catNodes.map((n) => {
        const dimmed = isAnyActive && activeNode !== n.id
          && !links.some((l) => l.source === n.id && isActive(l))
        return (
          <g key={n.id}
            onMouseEnter={() => setActiveNode(n.id)}
            onMouseLeave={() => setActiveNode(null)}
            className="cursor-pointer"
          >
            <rect
              x={LABEL_W} y={n.y0}
              width={NODE_W} height={Math.max(n.y1 - n.y0, 2)}
              rx={2} fill={n.color}
              opacity={dimmed ? 0.3 : 1}
              style={{ transition: 'opacity 120ms' }}
            />
            <text
              x={LABEL_W - 5} y={(n.y0 + n.y1) / 2}
              textAnchor="end" dominantBaseline="middle"
              fontSize={8} fill={dimmed ? '#cbd5e1' : '#475569'}
              style={{ transition: 'fill 120ms' }}
            >
              {n.label}
            </text>
            {/* value label on right of bar when active */}
            {(activeNode === n.id || links.some((l) => l.source === n.id && isActive(l))) && (
              <text
                x={LABEL_W + NODE_W + 4} y={(n.y0 + n.y1) / 2}
                textAnchor="start" dominantBaseline="middle"
                fontSize={7.5} fill={n.color} fontWeight={600}
              >
                {fmtC(n.value)}
              </text>
            )}
          </g>
        )
      })}

      {/* ── Buyer nodes ── */}
      {buyerNodes.map((n) => {
        const isCB   = CROSS_BORDER_BUYERS.has(n.id)
        const dimmed = isAnyActive && activeNode !== n.id
          && !links.some((l) => l.target === n.id && isActive(l))
        return (
          <g key={n.id}
            onMouseEnter={() => setActiveNode(n.id)}
            onMouseLeave={() => setActiveNode(null)}
            className="cursor-pointer"
          >
            <rect
              x={TX0} y={n.y0}
              width={NODE_W} height={Math.max(n.y1 - n.y0, 2)}
              rx={2} fill={isCB ? '#f43f5e' : '#64748b'}
              opacity={dimmed ? 0.25 : 1}
              style={{ transition: 'opacity 120ms' }}
            />
            <text
              x={TX0 + NODE_W + 5} y={(n.y0 + n.y1) / 2}
              textAnchor="start" dominantBaseline="middle"
              fontSize={8}
              fill={dimmed ? '#cbd5e1' : isCB ? '#f43f5e' : '#475569'}
              fontWeight={isCB ? 600 : 400}
              style={{ transition: 'fill 120ms' }}
            >
              {n.label}
            </text>
            {/* value label on left of bar when active */}
            {(activeNode === n.id || links.some((l) => l.target === n.id && isActive(l))) && (
              <text
                x={TX0 - 4} y={(n.y0 + n.y1) / 2}
                textAnchor="end" dominantBaseline="middle"
                fontSize={7.5} fill={isCB ? '#f43f5e' : '#64748b'} fontWeight={600}
              >
                {fmtC(n.value)}
              </text>
            )}
          </g>
        )
      })}

      {/* ── Tooltip on active link ── */}
      {activeLink && (() => {
        const l = links.find((lk) => lk.id === activeLink)
        if (!l) return null
        const mx   = CX
        const my   = (l.sy0 + l.sy1 + l.ty0 + l.ty1) / 4 - 4
        const hasCB = l.crossBorder > 0
        const bh   = hasCB ? 44 : 28
        const bw   = 128
        return (
          <g style={{ pointerEvents: 'none' }}>
            <rect
              x={mx - bw / 2} y={my - bh / 2}
              width={bw} height={bh}
              rx={5}
              fill="white" stroke="#e2e8f0" strokeWidth={1}
              style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,.12))' }}
            />
            <text x={mx} y={my - (hasCB ? 9 : 2)}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={9} fill="#1e293b" fontWeight={600}
            >
              {fmtC(l.value)}
            </text>
            {hasCB && (
              <text x={mx} y={my + 10}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={7.5} fill="#f43f5e"
              >
                跨境 +{fmtC(l.crossBorder)}
              </text>
            )}
          </g>
        )
      })()}
    </svg>
  )
}
