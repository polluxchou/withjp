# 工时任务强关联业务分工事项 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让任务中心「工时任务」(`work_tasks`) 在创建/编辑时强制关联业务分工的最小单元「事项」(`task_items`),并携带事项名快照。

**Architecture:** DB 加两列(`business_task_item_id` 可空外键 + `business_task_item_name` 快照);纯函数模块负责「事项→预填值」的映射与「按名匹配事项」;API/service 负责持久化与权威快照;`WorkTaskForm` 加级联选择器(业务→任务→事项,事项必填)并预填负责人/部门/标题。

**Tech Stack:** Next.js (App Router) + TypeScript + Supabase(Postgres)+ `node --test --experimental-strip-types` 纯函数单测 + next-intl(zh/en/ja 三语 parity)。

**关键约定(来自 spec `docs/superpowers/specs/2026-07-21-worktask-taskitem-link-design.md`):**
- 关联层级 = 事项(`task_items`);仅约束工时任务。
- 约束强度 B:DB 可空,UI 必选。
- 预填规则 A:预填可改。事项负责人为主播(creator)时不预填工时任务负责人(工时任务负责人必须是 `users`)。
- 存事项名快照;快照由服务端权威写入(不信任客户端传入的名字)。
- 反向视图放二期,本计划不做。

**部门映射(本计划锁定的启发式默认,可后续调优):** 岗位 `key` → `agent_role`
`streamer→content`, `mc→content`, `agent→growth`, `group_ops→ops`, `makeup→content`, `dance_coach→content`, `video_editor→content`, `photographer→content`, `guild_leader→ops`, `finance_tax→finance`。
一个业务分工「任务」可挂多个岗位:把该任务所有岗位映射成部门集合去重,**恰好 1 个**才预填,否则留空让用户选。

**环境前置(执行 UI 验证前必须完成):** Task 2 的迁移必须已应用到开发用 Supabase 数据库,否则表单拉取 `/api/org` 与写入新列都会失败。

**文件清单:**
- 新建 `src/lib/work-tasks/org-link.ts` — 纯函数:部门映射、预填、按名匹配(可单测,不依赖 DB)。
- 新建 `src/lib/work-tasks/org-link.test.ts` — 上述纯函数的单测。
- 新建 `src/lib/work-tasks/item-snapshot.ts` — 服务端小工具:按 id 取事项名(供 API/service 写权威快照)。
- 新建 `supabase/migrations/042_work_task_org_link.sql` — 加列 + 外键 + 索引。
- 改 `src/lib/types/index.ts` — `WorkTask` 增两字段。
- 改 `src/lib/intent/schema.ts` — `WorkTaskCreatePayloadSchema` 增可选字段。
- 改 `src/app/api/work-tasks/route.ts` — POST 持久化关联 + 权威快照。
- 改 `src/app/api/work-tasks/[id]/route.ts` — PATCH 换绑时刷新快照。
- 改 `src/lib/work-tasks/service.ts` — 意图创建时按名匹配事项并写入。
- 改 `src/components/work-tasks/WorkTaskForm.tsx` — 级联选择器(必填)+ 预填。
- 改 `messages/zh.json`、`messages/en.json`、`messages/ja.json` — 新增文案(三语 parity)。
- 改 `package.json` — 把新测试文件登记进 `test` 脚本。

---

## Task 1: 纯函数模块 org-link(部门映射 / 预填 / 按名匹配)

**Files:**
- Create: `src/lib/work-tasks/org-link.ts`
- Test: `src/lib/work-tasks/org-link.test.ts`
- Modify: `package.json`(`test` 脚本追加测试文件)

- [ ] **Step 1: 写失败测试**

写入 `src/lib/work-tasks/org-link.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { POSITION_DEPARTMENT, departmentForPositions, prefillFromItem, matchItemByName } from './org-link.ts'
import type { TaskItem } from '../types/index.ts'

test('POSITION_DEPARTMENT: 覆盖全部 10 个岗位 key', () => {
  const keys = ['streamer','mc','agent','group_ops','makeup','dance_coach','video_editor','photographer','guild_leader','finance_tax']
  for (const k of keys) assert.ok(POSITION_DEPARTMENT[k], `missing mapping for ${k}`)
})

test('departmentForPositions: 单一部门 → 预填该部门', () => {
  assert.equal(departmentForPositions(['finance_tax']), 'finance')
  assert.equal(departmentForPositions(['streamer','makeup','dance_coach']), 'content')
})

test('departmentForPositions: 多部门或空 → null', () => {
  assert.equal(departmentForPositions(['finance_tax','streamer']), null)
  assert.equal(departmentForPositions([]), null)
  assert.equal(departmentForPositions(['unknown_key']), null)
})

const baseItem = (over: Partial<TaskItem> = {}): TaskItem => ({
  id: 'it1', task_id: 't1', name: '对账', sort_order: 1,
  owner_member_type: null, owner_user_id: null, owner_creator_id: null, ...over,
})

test('prefillFromItem: user 负责人 → 预填 owner_user_id,ownerIsCreator=false', () => {
  const r = prefillFromItem(baseItem({ owner_member_type: 'user', owner_user_id: 'u9' }), ['finance_tax'])
  assert.equal(r.business_task_item_id, 'it1')
  assert.equal(r.business_task_item_name, '对账')
  assert.equal(r.title, '对账')
  assert.equal(r.owner_user_id, 'u9')
  assert.equal(r.ownerIsCreator, false)
  assert.equal(r.department, 'finance')
})

test('prefillFromItem: creator 负责人 → 不预填 owner_user_id,ownerIsCreator=true', () => {
  const r = prefillFromItem(baseItem({ owner_member_type: 'creator', owner_creator_id: 'c3' }), ['streamer'])
  assert.equal(r.owner_user_id, null)
  assert.equal(r.ownerIsCreator, true)
  assert.equal(r.department, 'content')
})

test('prefillFromItem: 无负责人 + 多岗位 → owner null,department null', () => {
  const r = prefillFromItem(baseItem(), ['finance_tax','streamer'])
  assert.equal(r.owner_user_id, null)
  assert.equal(r.ownerIsCreator, false)
  assert.equal(r.department, null)
})

test('matchItemByName: 唯一大小写不敏感匹配 → 返回 id', () => {
  const items = [{ id: 'a', name: '对账' }, { id: 'b', name: '招募' }]
  assert.equal(matchItemByName(items, ' 对账 '), 'a')
  assert.equal(matchItemByName(items, '招募'), 'b')
})

test('matchItemByName: 无匹配或重名歧义 → null', () => {
  const items = [{ id: 'a', name: '对账' }, { id: 'b', name: '对账' }, { id: 'c', name: '招募' }]
  assert.equal(matchItemByName(items, '对账'), null)   // 重名歧义
  assert.equal(matchItemByName(items, '不存在'), null)
})
```

同一步:把测试文件登记进 `package.json` 的 `test` 脚本(在末尾 `src/lib/org/tree.test.ts` 后追加,保持一行、空格分隔):

```
... src/lib/org/tree.test.ts src/lib/work-tasks/org-link.test.ts
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`
Expected: FAIL —— 报 `Cannot find module './org-link.ts'`(实现文件尚未创建)。

- [ ] **Step 3: 写最小实现**

写入 `src/lib/work-tasks/org-link.ts`:

```ts
import type { AgentRole, TaskItem } from '../types/index.ts'

// 岗位 key → 部门(agent_role)启发式映射,可后续调优。
export const POSITION_DEPARTMENT: Record<string, AgentRole> = {
  streamer:     'content',
  mc:           'content',
  agent:        'growth',
  group_ops:    'ops',
  makeup:       'content',
  dance_coach:  'content',
  video_editor: 'content',
  photographer: 'content',
  guild_leader: 'ops',
  finance_tax:  'finance',
}

// 任务的岗位集合 → 去重后的部门:恰好 1 个才返回,否则 null。
export function departmentForPositions(positionKeys: string[]): AgentRole | null {
  const depts = new Set<AgentRole>()
  for (const k of positionKeys) {
    const d = POSITION_DEPARTMENT[k]
    if (d) depts.add(d)
  }
  return depts.size === 1 ? [...depts][0] : null
}

export interface ItemPrefill {
  business_task_item_id:   string
  business_task_item_name: string
  title:                   string
  owner_user_id:           string | null
  department:              AgentRole | null
  ownerIsCreator:          boolean
}

// 从选中的事项 + 其所属任务的岗位 keys,算出工时任务表单的预填值。
export function prefillFromItem(item: TaskItem, taskPositionKeys: string[]): ItemPrefill {
  const ownerIsCreator = item.owner_member_type === 'creator'
  return {
    business_task_item_id:   item.id,
    business_task_item_name: item.name,
    title:                   item.name,
    owner_user_id:           item.owner_member_type === 'user' ? item.owner_user_id : null,
    department:              departmentForPositions(taskPositionKeys),
    ownerIsCreator,
  }
}

// 按名(去空白、大小写不敏感)唯一匹配事项;无匹配或重名歧义 → null。
export function matchItemByName(items: { id: string; name: string }[], name: string): string | null {
  const norm = name.trim().toLowerCase()
  if (!norm) return null
  const hits = items.filter((it) => it.name.trim().toLowerCase() === norm)
  return hits.length === 1 ? hits[0].id : null
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`
Expected: PASS —— org-link 的 8 个用例全绿,其余既有测试不受影响。

- [ ] **Step 5: 提交**

```bash
git add src/lib/work-tasks/org-link.ts src/lib/work-tasks/org-link.test.ts package.json
git commit -m "feat(work-tasks): org-link 纯函数(部门映射/事项预填/按名匹配) + 单测"
```

---

## Task 2: 迁移 042 — work_tasks 加关联列 + 快照列

**Files:**
- Create: `supabase/migrations/042_work_task_org_link.sql`

- [ ] **Step 1: 写迁移**

写入 `supabase/migrations/042_work_task_org_link.sql`:

```sql
-- ============================================================
-- Migration 042: 工时任务 ⇄ 业务分工事项 关联
-- work_tasks 关联到 task_items(最小单元/事项);快照列保留下发时的事项名。
-- 可空(交互层强制,DB 层过渡期留空);删除事项时断开关联,历史任务与快照保留。
-- ============================================================

ALTER TABLE work_tasks
  ADD COLUMN business_task_item_id   uuid REFERENCES task_items(id) ON DELETE SET NULL,
  ADD COLUMN business_task_item_name text;

CREATE INDEX IF NOT EXISTS idx_work_tasks_business_task_item
  ON work_tasks(business_task_item_id);
```

- [ ] **Step 2: 校验 SQL 有效性**

- 若本地可用 Supabase CLI:`supabase db reset`(或对开发库执行该迁移),Expected:无报错,`\d work_tasks` 出现 `business_task_item_id`、`business_task_item_name` 两列与 `idx_work_tasks_business_task_item` 索引。
- 若无 CLI:人工核对 —— 语句风格与 `024_work_task_extensions.sql` 一致,外键指向 041 的 `task_items(id)`,`ON DELETE SET NULL` 与 041 中 owner 外键约定一致。

- [ ] **Step 3: 提交**

```bash
git add supabase/migrations/042_work_task_org_link.sql
git commit -m "feat(work-tasks): 迁移 042 — work_tasks 加 business_task_item_id + 事项名快照"
```

---

## Task 3: WorkTask 类型 + 意图 payload schema 增字段

**Files:**
- Modify: `src/lib/types/index.ts:457-480`(`WorkTask` 接口)
- Modify: `src/lib/intent/schema.ts:163-176`(`WorkTaskCreatePayloadSchema`)

- [ ] **Step 1: 改 WorkTask 接口**

在 `src/lib/types/index.ts` 的 `WorkTask` 接口里,`notes` 之后、`created_at` 之前新增两行:

```ts
  notes:                string | null
  business_task_item_id:   string | null
  business_task_item_name: string | null
  created_at:           string
```

- [ ] **Step 2: 改意图 payload schema**

在 `src/lib/intent/schema.ts` 的 `WorkTaskCreatePayloadSchema` 里,`notes` 行之后新增一行(保持 `.strict()` 在最后):

```ts
  notes:               z.string().nullable().optional(),
  business_task_item_id: z.string().uuid().nullable().optional(),
}).strict()
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: PASS(无新增类型错误)。

- [ ] **Step 4: 提交**

```bash
git add src/lib/types/index.ts src/lib/intent/schema.ts
git commit -m "feat(work-tasks): WorkTask 类型与意图 payload 增 business_task_item 字段"
```

---

## Task 4: 服务端事项名解析工具

**Files:**
- Create: `src/lib/work-tasks/item-snapshot.ts`

- [ ] **Step 1: 写工具**

写入 `src/lib/work-tasks/item-snapshot.ts`(供 POST/PATCH/intent 写权威快照,避免各处重复):

```ts
import type { createServerClient } from '@/lib/supabase/server'

type DB = ReturnType<typeof createServerClient>

// 按事项 id 取当前事项名;查不到返回 null。用于写工时任务的事项名快照。
export async function fetchTaskItemName(db: DB, itemId: string): Promise<string | null> {
  const { data } = await db.from('task_items').select('name').eq('id', itemId).maybeSingle()
  return (data as { name: string } | null)?.name ?? null
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/lib/work-tasks/item-snapshot.ts
git commit -m "feat(work-tasks): 新增 fetchTaskItemName 服务端事项名解析工具"
```

---

## Task 5: POST /api/work-tasks 持久化关联 + 权威快照

**Files:**
- Modify: `src/app/api/work-tasks/route.ts:56-103`

- [ ] **Step 1: 改 POST**

在 `src/app/api/work-tasks/route.ts` 顶部 import 区加:

```ts
import { fetchTaskItemName } from '@/lib/work-tasks/item-snapshot'
```

在 POST 的解构里加 `business_task_item_id`:

```ts
  const {
    task_type, title, description, department,
    milestone_id, owner_user_id, reviewer_user_id, executor_ids,
    task_date, due_date, effort_hours, repeat_interval,
    completion_criteria, status, notes, business_task_item_id,
  } = body
```

在 insert 之前解析权威快照(放在 `VALID_EFFORTS` 校验之后):

```ts
  const itemId = business_task_item_id ?? null
  const itemName = itemId ? await fetchTaskItemName(db, itemId) : null
```

在 `.insert({ ... })` 对象末尾(`notes` 之后)加两行:

```ts
      notes:               notes ?? null,
      business_task_item_id:   itemId,
      business_task_item_name: itemName,
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/app/api/work-tasks/route.ts
git commit -m "feat(work-tasks): POST 持久化 business_task_item_id 与权威事项名快照"
```

---

## Task 6: PATCH 换绑事项时刷新快照

**Files:**
- Modify: `src/app/api/work-tasks/[id]/route.ts:14-54`

- [ ] **Step 1: 改 PATCH**

顶部 import 加:

```ts
import { fetchTaskItemName } from '@/lib/work-tasks/item-snapshot'
```

在解构 `updates` 之后、执行 `.update(updates)` 之前,加入换绑时刷新快照的逻辑:

```ts
  if ('business_task_item_id' in updates) {
    const itemId = updates.business_task_item_id ?? null
    updates.business_task_item_id   = itemId
    updates.business_task_item_name = itemId ? await fetchTaskItemName(db, itemId) : null
  }
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: PASS。

- [ ] **Step 3: 提交**

```bash
git add "src/app/api/work-tasks/[id]/route.ts"
git commit -m "feat(work-tasks): PATCH 换绑事项时刷新事项名快照"
```

---

## Task 7: 意图创建按名匹配事项

**Files:**
- Modify: `src/lib/work-tasks/service.ts:19-62`

- [ ] **Step 1: 改 createWorkTaskFromIntent**

顶部 import 加:

```ts
import { matchItemByName } from '@/lib/work-tasks/org-link'
```

在 `createWorkTaskFromIntent` 里,构造 `executor_ids` 之后、`insert` 之前,加入事项解析(优先用 payload 显式传入的 id,否则用标题按名唯一匹配;匹配不到则留空,过渡期允许 unlinked):

```ts
  let itemId = payload.business_task_item_id ?? null
  if (!itemId) {
    const { data: items } = await db.from('task_items').select('id, name')
    itemId = matchItemByName((items ?? []) as { id: string; name: string }[], payload.title)
  }
  const itemName = itemId
    ? (((await db.from('task_items').select('name').eq('id', itemId).maybeSingle()).data as { name: string } | null)?.name ?? null)
    : null
```

在 `.insert({ ... })` 对象末尾(`status: 'planned',` 之后)加两行:

```ts
      status:              'planned',
      business_task_item_id:   itemId,
      business_task_item_name: itemName,
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: PASS。

- [ ] **Step 3: 提交**

```bash
git add src/lib/work-tasks/service.ts
git commit -m "feat(work-tasks): 意图创建按事项名唯一匹配并写入关联+快照"
```

---

## Task 8: i18n 文案(zh/en/ja 三语 parity)

**Files:**
- Modify: `messages/zh.json`(`workTasks.form` 段)
- Modify: `messages/en.json`(同段)
- Modify: `messages/ja.json`(同段)

- [ ] **Step 1: zh.json 加 key**

在 `messages/zh.json` 的 `workTasks.form` 对象内追加:

```json
"selectBusiness": "选择业务",
"selectTask": "选择任务",
"selectItem": "选择事项",
"itemField": "关联事项",
"itemPlaceholder": "先选事项（必填）",
"errItem": "请先选择一个业务分工事项",
"ownerFromCreatorHint": "该事项负责人是主播，请手动指定工时任务负责人",
"unlinkedBadge": "未关联事项"
```

- [ ] **Step 2: en.json 加相同 key**

在 `messages/en.json` 的 `workTasks.form` 内追加:

```json
"selectBusiness": "Select business",
"selectTask": "Select task",
"selectItem": "Select item",
"itemField": "Linked item",
"itemPlaceholder": "Select an item first (required)",
"errItem": "Please select a business-division item first",
"ownerFromCreatorHint": "This item's owner is a streamer; please set the work-task owner manually",
"unlinkedBadge": "No linked item"
```

- [ ] **Step 3: ja.json 加相同 key**

在 `messages/ja.json` 的 `workTasks.form` 内追加:

```json
"selectBusiness": "業務を選択",
"selectTask": "タスクを選択",
"selectItem": "項目を選択",
"itemField": "関連項目",
"itemPlaceholder": "先に項目を選択（必須）",
"errItem": "先に業務分担の項目を選択してください",
"ownerFromCreatorHint": "この項目の担当者は配信者です。稼働タスクの担当者を手動で指定してください",
"unlinkedBadge": "項目未関連"
```

- [ ] **Step 4: 校验三语 parity**

Run: `npm run test:copy`
Expected: PASS —— `check-i18n` 三语 key 对齐,`check-no-bare-han` 无裸中文报错。

- [ ] **Step 5: 提交**

```bash
git add messages/zh.json messages/en.json messages/ja.json
git commit -m "i18n(work-tasks): 事项级联选择器与未关联提示文案(zh/en/ja)"
```

---

## Task 9: WorkTaskForm 加事项级联选择器 + 预填

**Files:**
- Modify: `src/components/work-tasks/WorkTaskForm.tsx`

- [ ] **Step 1: 引入类型与纯函数**

顶部 import 区新增:

```ts
import { prefillFromItem } from '@/lib/work-tasks/org-link'
import type { OrgSnapshot, Business, BusinessTask, TaskItem, Position } from '@/lib/types'
```

- [ ] **Step 2: 加 org 数据与级联选择 state**

在既有 `useState`(`users`/`milestones`)附近新增:

```ts
  const [org, setOrg] = useState<OrgSnapshot | null>(null)
  const [selBusinessId, setSelBusinessId] = useState('')
  const [selTaskId, setSelTaskId] = useState('')
  const [ownerFromCreator, setOwnerFromCreator] = useState(false)
```

在 `form` 初始 state 里(`notes` 之后)加两个字段:

```ts
    notes:                source?.notes                 ?? '',
    business_task_item_id:   source?.business_task_item_id   ?? '',
    business_task_item_name: source?.business_task_item_name ?? '',
```

- [ ] **Step 3: 拉取 org 快照,并在编辑态回填级联选择**

把首个 `useEffect`(拉 milestones/users)扩展为同时拉 `/api/org`,并在拿到后依据已有 `business_task_item_id` 反推 business/task:

```ts
  useEffect(() => {
    Promise.all([
      fetch('/api/milestones').then((r) => r.json()),
      fetch('/api/users').then((r) => r.json()),
      fetch('/api/org').then((r) => r.json()),
    ]).then(([ms, us, orgRes]) => {
      setMilestones(ms.data ?? [])
      setUsers(us.data ?? [])
      const snap: OrgSnapshot | null = orgRes.data ?? null
      setOrg(snap)
      const existingItemId = source?.business_task_item_id
      if (snap && existingItemId) {
        for (const b of snap.businesses) {
          for (const tk of b.tasks) {
            if (tk.items.some((it) => it.id === existingItemId)) {
              setSelBusinessId(b.id)
              setSelTaskId(tk.id)
            }
          }
        }
      }
    })
  }, [source?.business_task_item_id])
```

- [ ] **Step 4: 加派生列表与选中事项处理函数**

在组件内、`return` 之前加:

```ts
  const businesses: Business[] = org?.businesses ?? []
  const posKeyById = new Map<string, string>((org?.positions ?? []).map((p: Position) => [p.id, p.key]))
  const tasksOfBiz: BusinessTask[] = businesses.find((b) => b.id === selBusinessId)?.tasks ?? []
  const itemsOfTask: TaskItem[] = tasksOfBiz.find((t) => t.id === selTaskId)?.items ?? []

  function onPickItem(itemId: string) {
    const task = tasksOfBiz.find((t) => t.id === selTaskId)
    const item = task?.items.find((it) => it.id === itemId)
    if (!task || !item) {
      setForm((f) => ({ ...f, business_task_item_id: '', business_task_item_name: '' }))
      return
    }
    const posKeys = task.position_ids.map((pid) => posKeyById.get(pid)).filter(Boolean) as string[]
    const p = prefillFromItem(item, posKeys)
    setOwnerFromCreator(p.ownerIsCreator)
    setForm((f) => ({
      ...f,
      business_task_item_id:   p.business_task_item_id,
      business_task_item_name: p.business_task_item_name,
      title:                   f.title.trim() ? f.title : p.title,
      owner_user_id:           p.owner_user_id ?? f.owner_user_id,
      department:              (p.department ?? f.department) as AgentRole,
    }))
  }
```

- [ ] **Step 5: 在表单顶部加级联选择器 UI(Row 0),并加必填校验**

在 `<form>` 内、error 提示块之后、Row 1 之前插入:

```tsx
      {/* Row 0: 业务 → 任务 → 事项(必填) */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={LABEL}>{t('selectBusiness')}</label>
          <select value={selBusinessId} className={INPUT}
            onChange={(e) => { setSelBusinessId(e.target.value); setSelTaskId(''); setForm((f) => ({ ...f, business_task_item_id: '', business_task_item_name: '' })) }}>
            <option value="">{t('itemPlaceholder')}</option>
            {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL}>{t('selectTask')}</label>
          <select value={selTaskId} className={INPUT} disabled={!selBusinessId}
            onChange={(e) => { setSelTaskId(e.target.value); setForm((f) => ({ ...f, business_task_item_id: '', business_task_item_name: '' })) }}>
            <option value="">{t('selectTask')}</option>
            {tasksOfBiz.map((tk) => <option key={tk.id} value={tk.id}>{tk.name}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL}>{t('itemField')}</label>
          <select value={form.business_task_item_id} className={INPUT} disabled={!selTaskId}
            onChange={(e) => onPickItem(e.target.value)}>
            <option value="">{t('selectItem')}</option>
            {itemsOfTask.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
          </select>
        </div>
      </div>
      {ownerFromCreator && (
        <div className="text-xs text-amber-600">{t('ownerFromCreatorHint')}</div>
      )}
```

在 `submit` 里,`if (!form.owner_user_id)` 之后加:

```ts
    if (!form.business_task_item_id) { setError(t('errItem')); return }
```

`payload` 已通过 `...form` 自动携带 `business_task_item_id`/`business_task_item_name`,无需额外改动。

- [ ] **Step 6: 类型检查 + copy 校验**

Run: `npx tsc --noEmit && npm run test:copy`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/components/work-tasks/WorkTaskForm.tsx
git commit -m "feat(work-tasks): 表单加业务→任务→事项级联选择(必填)与预填"
```

---

## Task 10: 端到端验证(浏览器)

**前置:** Task 2 迁移已应用到开发库;业务分工里至少有一个业务→任务→事项、且事项设了 user 负责人。

- [ ] **Step 1: 起服务**

用 preview_start 启动 dev server(`.claude/launch.json` 的 dev 配置,端口 3001)。

- [ ] **Step 2: 验证创建流程**

进入任务中心 → 工时视图 → 新建工时任务:
- 级联选择器出现,业务/任务/事项三级联动;不选事项时提交报 `errItem`。
- 选中一个 user-负责人的事项后:标题、负责人、部门被预填。
- 选中 creator-负责人的事项时:负责人不预填,出现 `ownerFromCreatorHint`。
- 保存成功;用 read_network_requests 查 `POST /api/work-tasks` 响应,`data.business_task_item_id` 与 `business_task_item_name` 已写入。

- [ ] **Step 3: 验证快照独立性**

去业务分工把该事项改名 → 回到刚建的工时任务(GET /api/work-tasks),确认 `business_task_item_name` 仍是旧名(快照不随改名变化)。

- [ ] **Step 4: 收尾**

用 read_console_messages 确认无报错;截图创建流程留证。

---

## Self-Review

- **Spec 覆盖**:数据模型(Task 2/3)、创建流程预填(Task 1/9)、creator 负责人边界(Task 1/9)、部门映射(Task 1)、意图路径(Task 7)、快照权威写入与独立性(Task 4/5/6 + Task 10 Step 3)、迁移可空+索引(Task 2)。反向视图与 NOT NULL 收紧属二期,已在 spec 标注、不在本计划——一致。
- **Placeholder 扫描**:各步均给出完整代码/命令/期望输出,无 TBD/TODO。
- **类型/命名一致**:`business_task_item_id`/`business_task_item_name` 在迁移、`WorkTask`、schema、API、service、表单中一致;`prefillFromItem`/`departmentForPositions`/`matchItemByName`/`fetchTaskItemName` 在定义与调用处签名一致。
- **测试现实**:纯函数走 TDD(`node --test`);DB/API/React 层遵循本仓既有做法(无相应单测),以 `npx tsc --noEmit`、`npm run test:copy` 与浏览器验证兜底。
