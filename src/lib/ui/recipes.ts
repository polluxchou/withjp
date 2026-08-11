// UI 类名配方（docs/design-system.md）——**唯一登记处**。
//
// 这里只放"必须逐字复用、且没有组件边界可以承载"的类名字符串；凡是能做成
// 组件的一律进 src/components/ui/（§6 组件唯一存放地），不要把这里当成
// 第二个组件目录。
//
// Tailwind：本文件在 tailwind.config.ts 的 content 扫描范围内
// （`./src/lib/**`），但类名必须写成完整字面量才会被 JIT 提取——禁止
// `ring-${x}` 式拼接（§7.5 教训：accent.ts 曾因 content 未纳入 src/lib
// 而整组类名静默失效）。

// §4 全站唯一 focus 配方：外扩 2px 主色环 + 1px offset。
//
// 例外不收进本常量：§4 第二配方 `focus-visible:ring-inset`（① 全出血容器
// ② chip 内部按钮 ③ 滚动容器内的项）——offset 在 overflow-*-auto 容器里会
// 被裁切，必须改内嵌。那条与容器语境强耦合、调用点也少，继续就地书写，
// 抽出来反而会诱导调用方选错配方。
export const FOCUS_RING =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1'
