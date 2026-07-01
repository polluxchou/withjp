# 3D 空格 + 左键拖拽平移 — 设计文档

日期:2026-07-01
状态:已评审通过,待实现
实现隔离:worktree `/Users/fengzhou/Code/newWith-spacepan`(分支 `feat/venue-space-pan`)。

## 背景与目标
3D 视图目前左键旋转、右键/双指平移、滚轮缩放。用户希望增加一种更顺手的平移方式:**按住空格 + 左键拖拽 = 平移画面中心**(相机角度不变,只移动 orbit 中心),松开空格恢复左键旋转。这是很多 3D 软件的标准手感。

## 架构(单文件:`src/venue/Venue3DCanvas.client.tsx`)

- **`spaceHeld` 状态**:在 `Venue3DCanvas` 主组件里 `const [spaceHeld, setSpaceHeld] = useState(false)`。用一个 `useEffect` 监听 window `keydown`/`keyup`(仿照现有 `ItemTransformGizmo` 的 `shiftHeld` 写法):
  - `keydown` 且 `e.code === 'Space'`:若焦点在输入元素(input/textarea/[contenteditable])则忽略;否则 `e.preventDefault()`(防页面滚动)+ `setSpaceHeld(true)`。
  - `keyup` 且 `e.code === 'Space'`:`setSpaceHeld(false)`。
  - 因为 `Venue3DCanvas` 只在 3D 视图挂载,监听自然只在 3D 生效;卸载时移除。
- **OrbitControls `mouseButtons`**:新增 prop,受 `spaceHeld` 控制:
  ```ts
  mouseButtons={{
    LEFT: spaceHeld ? MOUSE.PAN : MOUSE.ROTATE,
    MIDDLE: MOUSE.DOLLY,
    RIGHT: MOUSE.PAN,
  }}
  ```
  从 `three` 引入 `MOUSE`。右键/双指平移、滚轮缩放不变。平移灵敏度用默认(不设 `panSpeed`)。
- **光标反馈**:容器 `<div ref={containerRef} ...>` 的 className 在 `spaceHeld` 时追加 `cursor-grab`(空闲即抓手提示);不特别处理拖拽中的 `grabbing`(YAGNI)。

## 边界
- 输入框聚焦时空格照常输入(不拦截、不进入平移)。
- 松开空格立即恢复旋转;切到 2D(组件卸载)自动清理监听。
- 视角(polar/azimuth)在平移时不变——这是 `MOUSE.PAN` 的天然行为。

## 测试
交互 + R3F,无纯函数可单测;靠 `npx tsc --noEmit` + `next build` + 人工验证(3D 里按住空格左键拖拽平移、松开恢复旋转、输入框空格不受影响)。

## 涉及文件
- 改:`src/venue/Venue3DCanvas.client.tsx`(MOUSE 引入、spaceHeld 状态+监听、OrbitControls mouseButtons、容器 cursor)。

## 风险
- 极小。唯一注意点:空格 `preventDefault` 只在非输入焦点时执行,避免影响表单输入与页面滚动预期。
