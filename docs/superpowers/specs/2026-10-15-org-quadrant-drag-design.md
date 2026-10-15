# 业务分工四象限：拖拽编辑 —— 设计

## 1. 背景与目标

四象限视图（PR 348、PR 349）上线后，管理员改一个事项要「点开详情 → 点重要 → 填截止日 → 关面板」。上线时 33 个事项全部在「待评估」，逐条分级很慢，日常调整也一样。

本设计让管理员直接拖动事项完成编辑，取代 `2026-10-15-org-quadrant-board-design.md` 第 1 节「不做拖拽」那一条。其余口径（重要手动是/否、紧急按截止日 7 天自动算、东京业务日）一律不变。

**目标**

1. 桌面：从「待评估」区拖进任一格即完成分级；四格之间互拖改重要与紧急；拖进「已完成」即结项，拖出来即重开。
2. 手机：列表层长按卡片后拖到底部放置区，效果同桌面。
3. 键盘也能完成同样的操作（无障碍）。
4. 拖完立即看到结果，不等网络；拖错能一键撤销。

**不做**

- 格内手动排序（同格仍按截止日排序，spec 2.4 不变）。
- 多选批量拖。
- 拖拽改负责人。
- 手机首层（四个统计方块）不支持拖拽：首层没有卡片。
- 非管理员不能拖（与写入权限一致）。
- 不改数据库、不改 API。

## 2. 拖放规则

「横向」在本口径里等于改截止日，所以拖进或拖出「紧急」列时由系统决定日期（pollux 10-15 定）：拖进紧急列自动设日期；拖出紧急列让用户选日期。

### 2.1 规则表

设 `today` 为东京业务日，`row` 为被拖事项，`current = bucketOf(row, today)`，`target` 为放下的区域。

| 目标 | 写入 |
| --- | --- |
| 与 `current` 相同 | 不写入（noop） |
| 已完成 | `status = 'done'` |
| 待评估 | `is_important = null`；若原状态为 done，`status = 'todo'` |
| ① 立即做 / ③ 速办或转交（紧急列） | `is_important = true / false`；若当前不紧急（无截止日或距今 > 7 天），`due_date = today + 7`（自动设，见 2.2）；若原状态为 done，`status = 'todo'` |
| ② 排进计划 / ④ 放一放（不紧急列） | `is_important = true / false`；若当前紧急（距今 ≤ 7 天，含已逾期），**先问日期**（见 2.3），用户确认后连同新日期一起写入；若原状态为 done，`status = 'todo'` |

- 「当前紧急 / 不紧急」只看截止日（`isUrgent`），与状态无关；已完成的事项也按它自己的截止日判断。
- 「进行中」「卡住」在象限之间移动时保持不变。
- 「今天 + 7」恰好是紧急窗口的最后一天，所以自动设的日期一定落在紧急列，与 spec 2.2 的「差 7 天算紧急」一致。
- 从已完成拖回任一格或待评估区，都视为「重开」：状态改回 `todo`。

### 2.2 自动设日期

只在拖进紧急列、且当前不紧急时发生。日期 = `today + 7`。拖放完成后提示条写明「截止日设为 MM-DD」，并提供撤销（第 4 节）。撤销会恢复原来的截止日（包括原来为空的情况）。

### 2.3 拖出紧急列时询问日期

拖进不紧急列、且当前紧急时，事项**留在原格**，弹出一个小对话框（复用 `Modal`）：

- 标题「设置新的截止日」，说明「放进不紧急的一列，截止日需在 MM-DD 之后」（MM-DD = today + 7）。
- 一个日期输入，`min = today + 8`，默认值 `today + 8`。
- 「确定」：日期合法且 ≥ today + 8 时可点，写入（重要 + 新日期 + 必要时状态）。
- 「取消」或 Esc：不写入，事项保持原位。
- 输入非法或早于下限时「确定」不可点，并显示原因。

### 2.4 纯函数

全部放在 `src/lib/org/quadrant.ts`，`node --test` 覆盖：

```ts
export type DropTarget = Bucket

export type DropPlan =
  | { kind: 'noop' }
  | { kind: 'patch'; patch: ItemPatch; autoDue: string | null }
  | { kind: 'askDate'; base: ItemPatch; minDate: string }

/** 'YYYY-MM-DD' + n 天，UTC 零点计算，不经过本地时区。 */
export function addDays(ymd: string, n: number): string

/** 2.1 的规则表。 */
export function planDrop(row: QuadrantRow, target: DropTarget, today: string): DropPlan

/** 2.3：用户在询问框里填的日期 → 最终补丁；非法或早于 minDate 返回 null。 */
export function confirmAskedDate(plan: { base: ItemPatch; minDate: string }, value: string): ItemPatch | null
```

## 3. 交互

### 3.1 依赖

新增 `@dnd-kit/core@6.3.1`（peer：react ≥ 16.8，本仓 React 18 满足）。只用 core：`DndContext`、`useDraggable`、`useDroppable`、`DragOverlay`、`MouseSensor`、`TouchSensor`、`KeyboardSensor`。不引入 sortable（不做格内排序）。

### 3.2 桌面（≥768px）

- **可拖**：四格里的事项行、「待评估」区的事项、「已完成」区展开后的事项行。
- **可放**：四个格子（整块 section）、「待评估」区、「已完成」区（收起时整个标题栏也能放）。
- **起拖**：鼠标按下后移动 ≥ 6px 才开始拖（`MouseSensor` 的 `distance: 6`）；原地点击仍是打开详情。
- **拖动中**：原事项半透明；跟手的是一个精简卡片（`DragOverlay`：事项名 + 负责人）；悬停的可放区高亮（primary 色描边 + 浅底）；当前所在区不高亮。
- **放下**：按 2.1 执行；放在可放区以外 → 取消，不写入。

### 3.3 手机（<768px）

- 只在**列表层**（`?q=`）生效：长按卡片 250ms 起拖（`TouchSensor` 的 `delay: 250, tolerance: 5`），长按前的滑动仍是页面滚动。
- 起拖后底部滑出**放置区**（固定在视口底部，覆盖页面下半部）：上面 2×2 四个象限小方块（带名称与色调），下面两个横条「待评估」「已完成」。当前所在的目标置灰不可放。
- 拖到目标上放下 → 按 2.1 执行；在放置区以外松手 → 取消。放下或取消后放置区收起。
- 所有目标高度 ≥ 44px。
- 卡片需设 `touch-action: manipulation`（dnd-kit 对按住延迟起拖的要求）。

### 3.4 键盘

- 焦点在事项上：**Enter** 打开详情（现有行为不变）；**Space** 拿起。`KeyboardSensor` 的 `keyboardCodes.start` 只设 `Space`——默认还含 `Enter`，会吞掉打开详情。
- 拿起后：**方向键**在可放区之间跳转（按方向找最近的可放区，见 3.5），**Space** 放下，**Esc** 取消。
- 屏幕阅读器播报拿起、经过、放下、取消（dnd-kit 的 `announcements`，文案走 i18n）。

### 3.5 键盘跳转的纯函数

dnd-kit 默认键盘每次只移 25px，跨不过大格子。改用自定义 `coordinateGetter`：按方向在可放区中心点里选「方向上最近」的一个，跳到它的中心。选择逻辑写成纯函数放 `src/lib/org/dragZones.ts`，`node --test` 覆盖：

```ts
export interface ZoneRect { id: string; left: number; top: number; width: number; height: number }
export type Direction = 'up' | 'down' | 'left' | 'right'
/** 从当前点出发，按方向选最近的可放区；没有就返回 null（停在原地）。 */
export function nextZone(zones: ZoneRect[], from: { x: number; y: number }, dir: Direction): ZoneRect | null
```

规则：只考虑中心点严格位于该方向的半平面内的区域；距离 = 主轴距离 + 2 × 副轴距离（偏向正方向的邻居）；取最小者。

## 4. 写入、乐观更新与撤销

### 4.1 乐观更新

`useOrgSnapshot.updateItemFields` 改为先改界面再写库，详情面板的编辑也一起受益：

1. 记下该事项这几个字段的旧值（`pickItemFields`，见下）。
2. 立即用 `applyUpdateItemFields` 更新本地快照。
3. 发 PATCH；成功则结束。
4. 失败：弹出原因（沿用现有 `api()` 的 alert），并把这几个字段恢复成旧值——**仅当这期间同一事项没有更新的写入发起过**（每个事项一个递增序号，失败的写入序号不是最新就不回滚，避免覆盖后来的修改）。

```ts
// src/lib/org/tree.ts
/** 读出某事项指定字段的当前值，作为回滚/撤销用的补丁。事项不存在返回 null。 */
export function pickItemFields(snapshot: OrgSnapshot, itemId: string, keys: (keyof ItemPatch)[]): ItemPatch | null
```

### 4.2 撤销

- 每次拖放写入后，视图底部居中出现提示条（`role="status"`，5 秒后自动消失）：
  - 一般：「已移到「立即做」」
  - 自动设日期：「已移到「立即做」，截止日设为 10-22」
  - 结项 / 重开：「已标为完成」/「已重新打开」
- 提示条带「撤销」按钮：用 4.1 记下的旧值再发一次写入（同样乐观更新）。
- 新的拖放会替换上一条提示；撤销后提示条消失。
- 只有拖放有撤销；详情面板里的修改不加。

## 5. 组件

| 文件 | 改动 |
| --- | --- |
| `src/lib/org/quadrant.ts` | 新增 `addDays`、`planDrop`、`confirmAskedDate` 与类型 |
| `src/lib/org/dragZones.ts` | 新文件：`nextZone` |
| `src/lib/org/tree.ts` | 新增 `pickItemFields` |
| `src/components/org/useOrgSnapshot.ts` | `updateItemFields` 改乐观更新 + 序号回滚；返回旧值供撤销 |
| `src/components/org/QuadrantView.tsx` | 包一层 `DndContext`；事项改为可拖、区域改为可放；接入询问框、提示条 |
| `src/components/org/QuadrantDnd.tsx` | 新文件：拖拽相关的小组件——`DraggableItem`、`DropZone`、`DragPreview`、手机 `DropDock`、键盘 `coordinateGetter` 的接线 |
| `src/components/org/DueDatePrompt.tsx` | 新文件：2.3 的询问框 |
| `src/components/org/DropNotice.tsx` | 新文件：4.2 的提示条 |
| `messages/{zh,en,ja}.json` | `team.org.*` 新文案（询问框、提示条、撤销、读屏播报、放置区标题），三语同步 |
| `src/lib/changelog/entries.ts` | 更新日志 |
| `package.json` | 新依赖；登记 `dragZones.test.ts` |

`QuadrantView.tsx` 现有约 316 行，拖拽接线若都写进去会过大，所以小组件拆到 `QuadrantDnd.tsx`。

## 6. 测试与验证

- **`quadrant.test.ts`**：
  - `addDays`：跨月、跨年、闰日。
  - `planDrop` 每条规则：待评估 → 四格（含自动设日期与不设）；② 截止日 30 天后 → ①（日期被改成 today+7）；① 截止日 3 天后 → ②（askDate，min = today+8）；① 已逾期 → ④（askDate）；① → ③（只翻重要，日期不动）；已完成 → ①（status todo + 日期规则）；已完成 → 待评估（status todo + 重要清空）；任意 → 已完成；同格 → noop；「卡住」状态移动后保持。
  - `confirmAskedDate`：早于下限、等于下限、非法字符串、年份越界。
- **`dragZones.test.ts`**（新文件）：四个方向各一例；同方向多个候选取最近；偏离主轴的候选被惩罚；该方向没有区域返回 null。
- **`tree.test.ts`**：`pickItemFields` 取值正确；事项不存在返回 null；只取指定字段。
- 审查时对上述测试跑突变探针（已提交基线上），交击杀表。
- **视觉与交互**（生产构建 + `/login` 下的临时夹具页，不提交）：
  - 桌面 1440：用真实鼠标拖动（浏览器工具的按下-移动-松开）把待评估事项拖进 ①，确认日期自动设为 today+7、提示条出现、撤销后恢复；① → ② 弹询问框，取消不变、确定后落格；拖进已完成再拖回；原地点击仍打开详情。
  - 键盘：Space 拿起、方向键跳区、Space 放下、Esc 取消；Enter 仍打开详情。
  - 手机 375：放置区布局、目标高度 ≥ 44px、当前目标置灰。触控长按在本机模拟器里只能送鼠标事件，**真机长按拖拽由 pollux 上线后用手机验收**。
  - 乐观更新回滚：夹具页写入会被拒（未登录），正好验证「失败后事项退回原格并弹出原因」。

## 7. 上线

纯前端改动，无迁移。合并前问 pollux；合并后核对 Vercel 生产部署与 `mcn.agenova.chat` 别名；线上用一个事项走一遍「拖进 ① → 撤销」，确认数据恢复原样。

## 8. 风险与取舍

- **自动设日期会覆盖原来的截止日**（例如原来 30 天后，拖进紧急列变成 7 天后）。这是「横向 = 改日期」的直接结果；用提示条明示新日期并提供撤销来兜底。
- **乐观更新的回滚只看同一事项的最新写入**：极端情况下（先拖 A 成功、再拖 A 失败），回滚只回到失败那次之前的值，不会再往前。
- **新依赖**：`@dnd-kit/core` 约 12KB（gzip 后），只在 `/team/org` 的客户端包里。
