# 竞品截图灯箱：当天多图三连排 — 设计

日期：2026-08-15
状态：待实现

## 问题

某个竞品账号在同一天常常有多张截图（开播、榜单、下播各一张是常态）。点开某天的格子后，`ShotLightbox` 一次只显示一张，要横向比较同一天的几张只能靠左右箭头来回切，脑子里记着上一张长什么样。

## 目标

灯箱默认横向并排展示当天的 3 张截图，箭头在当天剩余的照片间左右滑动。

## 非目标

- 不改按天分组、日期轴、`+N` 角标、上传入口、后端接口。
- 不跨天：箭头只在当天范围内移动，这与现状一致。
- 不做放大/全屏单图态（见「尺寸测算」——按 80% 尺寸三连排放得下，不需要）。

## 现状澄清

需求里「箭头左右切换查看当天的其他照片」**已经实现**，不在本次工作量内：

- `ShotAlbum` 打开灯箱时传的是 `grouped.get(openDate)`（`ShotAlbum.tsx:170`），本来就只有当天的照片。
- `ShotLightbox` 已有 `ChevronLeft` / `ChevronRight` 与 `shotIndexOf` 计数器（`ShotLightbox.tsx:99-118`），到头即禁用。
- 格子右上角 `+N` 角标已经在提示当天还有几张（`ShotAlbum.tsx` 的 `FilledCell`）。

本次真正新增的只有**一次显示三张**，以及它连带引出的「操作作用于哪一张」。

## 已确定的产品决策

1. **箭头步长 1 张**，不是整页翻 3 张。当天常见 3-5 张，整页翻会出现第二页只剩一两张、右侧留空的难看情况。
2. **窗口内点选一张为「选中」**，高亮描边；改日期、保存日期、删除**只作用于选中那张**。不用「中间那张即当前」这种隐式规则——删除不可逆，作用对象必须是用户明确指过的。
3. **按 ▶ 选中新进来的最右那张，按 ◀ 选中新进来的最左那张。** 这样箭头仍然读作「看下一张」，与现在单图模式的心智模型一致，同时保证选中项永远在可视窗口内。
4. **每张高度取现在的 80%**：`max-h-[80vh]` → `max-h-[64vh]`。
5. **当天不足 3 张时有几张排几张、居中**，不占位留空。空位会被读成「图没加载出来」。

## 尺寸测算

截图是竖屏 9:16（`ShotAlbum` 的 `BOX = 'aspect-[9/16]'`）。灯箱里图片由**高度**约束宽度，所以单张宽 = `maxH × 9/16`。

取 `max-h-[64vh]`，单张宽 = `0.36 × vh`。加上两个箭头按钮（各约 36px）与四处 `gap-3`（各 12px），横向总占用 ≈ `1.08 × vh + 120px`：

| 视口 | 三张需要 | 可用宽度 | 结论 |
|---|---|---|---|
| 2000 × 1145 | ~1360 | 2000 | 宽裕 |
| 1440 × 900 | ~1092 | 1440 | 宽裕 |
| 1280 × 800 | ~984 | 1280 | 宽裕 |
| 1100 × 700 | ~876 | 1100 | 够 |

竖图很窄，三连排的瓶颈一直是高度而不是宽度。因此不需要额外的放大态或响应式断点。

## 架构

改动集中在 `src/components/competitors/ShotLightbox.tsx` 一个文件，外加一个纯函数进 `shotGrid.ts` 以便单测。

### 新增纯函数 `src/lib/competitors/shotGrid.ts`

```ts
/** 灯箱一次并排显示的张数。 */
export const LIGHTBOX_VISIBLE = 3

/**
 * 把窗口起点夹逼到合法范围：[0, max(0, total - size)]。
 * total <= size 时恒为 0（有几张排几张，不留空位）。
 */
export function clampWindowStart(start: number, total: number, size: number): number
```

单独抽出来是因为夹逼边界是这次唯一有分支的逻辑（总数不足、贴左、贴右），值得单测；其余都是渲染。

### `ShotLightbox` 改动

state 从 `index`（当前张）改为两个：

- `start`：窗口起点，经 `clampWindowStart` 夹逼后使用。沿用现有的「渲染期夹逼、不放 `useEffect`」写法——删掉一张后 `shots` 变短，effect 版本会先渲染出越界的一帧再回来，整个灯箱会闪。
- `selectedId`：选中那张的 id。**用 id 不用下标**：删除后数组重排，下标会静默指向另一张图，而下一步操作可能就是删除。

派生值：

```
visible   = shots.slice(start, start + LIGHTBOX_VISIBLE)
selected  = visible.find(s => s.id === selectedId) ?? visible[0]
```

`selected` 兜底到 `visible[0]`，覆盖「选中项被删」「选中项滑出窗口」两种情况，天然保证操作对象可见。

箭头 handler：

```
prev: start' = clamp(start - 1); 选中 visible'[0]
next: start' = clamp(start + 1); 选中 visible'[last]
```

窗口已到头时箭头禁用，与现状一致。

其余照旧：`saveDate` / `removeCurrent` / Esc 关闭 / 删到最后一张才关闭的逻辑全部保留，只把作用对象从 `current` 换成 `selected`。

### 版式

外层由 `flex max-h-[80vh] items-center gap-3` 改为三张图并排，每张 `max-h-[64vh]`，并加 `min-w-0` 让极窄视口下等比缩小而不是横向溢出。

选中态用现有 token 描边（`ring-2 ring-primary`，与 `ShotAlbum` 里日期列选中态同款），不新增颜色。

### 可访问性

- 每张图外面包 `<button>`，`aria-pressed={s.id === selected.id}`，`aria-label` 沿用现有的 `caption || tag || 日期` 兜底链。
- `role="dialog"` 与「无 focus trap 就不写 `aria-modal`」的现有约定不变。
- 底部计数从 `shotIndexOf { index, total }` 改为显示**选中项**在当天的序号，复用同一条 i18n key，不新增文案。

## 边界情况

| 情况 | 行为 |
|---|---|
| 当天 1 张 | 排 1 张，两个箭头都禁用，与现状观感一致 |
| 当天 2 张 | 排 2 张，居中，箭头禁用 |
| 当天正好 3 张 | 排 3 张，箭头禁用 |
| 当天 > 3 张 | 排 3 张，箭头可用 |
| 删掉选中那张 | `shots` 变短 → `start` 夹逼 → `selected` 兜底到 `visible[0]`；删到 0 张才关灯箱（沿用现状） |
| 删到剩余 ≤ 3 张 | `clampWindowStart` 归 0，窗口贴左 |
| 改完日期后该图换了一天 | 沿用现状：保存成功即 `onChanged()` + `onClose()` |

## 错误处理

不变。`saveDate` 仍只在 400 时报「日期格式不对」，其余走 `actionFailed`；错误条仍在灯箱底部。

## 测试

新增 `clampWindowStart` 的单测挂到 `src/lib/competitors/shotGrid.test.ts`（该文件已在 `package.json` 的 `test` 列表里，无需改脚本）：

- 总数 ≤ size 恒返回 0
- 贴左：负数起点归 0
- 贴右：超界起点归 `total - size`
- 中间值原样返回

组件行为（选中跟随箭头、删除后兜底）无现成的组件测试设施，靠实机验证覆盖，与该模块既有做法一致。

## 仓库闸门约束

- 颜色只用既有 token，不写裸 hex——`check-style-tokens` 会挡。
- 不新增 i18n key；若确需新增，三语 `messages/{zh,en,ja}.json` 必须同步，`check-i18n` 会挡。
- JSX 里不留裸中文，`check-no-bare-han` 会挡。

## 影响面

只影响竞品监测页点开截图后的灯箱。日期轴、格子、上传、后端接口、其它页面均不受影响。
