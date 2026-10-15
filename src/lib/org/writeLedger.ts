// src/lib/org/writeLedger.ts — 四象限字段乐观更新的写入账本（drag spec 4.1）。
//
// 按「事项 × 字段」记录：每个字段最近一次发起写入的序号，以及最近一次写入成功（已落库）的值。
// 写入失败时，只回滚「最近一次发起的写入就是这次」的字段，回到已落库的值——
// 不回到这次写入前的界面值，因为那可能是另一笔尚未确认、之后也失败了的乐观值。
// 相对路径 + .ts 后缀：node --test 不认 tsconfig 的 @/ 别名。
import type { ItemPatch } from './quadrant.ts'

type Field = keyof ItemPatch
type Value = ItemPatch[Field]

export interface WriteLedger {
  nextSeq: number
  latest: Map<string, number>
  confirmed: Map<string, { value: Value; seq: number }>
}

export interface PendingWrite {
  itemId: string
  seqs: Partial<Record<Field, number>>
}

const keyOf = (itemId: string, field: Field) => `${itemId}:${field}`

export function createWriteLedger(): WriteLedger {
  return { nextSeq: 1, latest: new Map(), confirmed: new Map() }
}

/** 发起写入。`current` 是写入前界面上的值，只在某字段第一次被写时作为「已落库值」的种子。 */
export function beginWrite(ledger: WriteLedger, itemId: string, fields: ItemPatch, current: ItemPatch): PendingWrite {
  const seq = ledger.nextSeq++
  const seqs: Partial<Record<Field, number>> = {}
  for (const field of Object.keys(fields) as Field[]) {
    const key = keyOf(itemId, field)
    if (!ledger.confirmed.has(key)) ledger.confirmed.set(key, { value: current[field], seq: 0 })
    ledger.latest.set(key, seq)
    seqs[field] = seq
  }
  return { itemId, seqs }
}

/**
 * 写入结束。成功：把这些字段的已落库值更新为本次的值（只接受比已记录更新的序号，防止迟到的旧响应覆盖）。
 * 失败：返回要回滚的补丁——只含「最近一次发起的写入就是这次」的字段，值为已落库值；没有则返回 null。
 */
export function settleWrite(ledger: WriteLedger, write: PendingWrite, fields: ItemPatch, ok: boolean): ItemPatch | null {
  const revert: Partial<Record<Field, Value>> = {}
  let hasRevert = false
  for (const field of Object.keys(write.seqs) as Field[]) {
    const seq = write.seqs[field]
    if (seq === undefined) continue
    const key = keyOf(write.itemId, field)
    if (ok) {
      const prev = ledger.confirmed.get(key)
      if (!prev || seq > prev.seq) ledger.confirmed.set(key, { value: fields[field], seq })
    } else if (ledger.latest.get(key) === seq) {
      revert[field] = ledger.confirmed.get(key)?.value
      hasRevert = true
    }
  }
  return !ok && hasRevert ? (revert as ItemPatch) : null
}
