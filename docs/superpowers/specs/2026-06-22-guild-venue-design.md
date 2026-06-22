# 公会场地 2D 布置页设计说明

## 目标

新增一个第一版 2D 场地布置工具，用于线下公会直播间和办公区域规划。页面要让管理者在简单的平面画布上摆放设备、装修区域、通道、工位、安全出口、消防和安全相关对象。第一版不引入 CAD、3D、多人实时协作、审批流或施工任务关联。

## 路由和导航

- 新增 App Router 页面：`src/app/[locale]/(app)/guild-venue/page.tsx`，访问路径为 `/zh/guild-venue`、`/en/guild-venue` 以及其他已配置 locale。
- 在左侧 Sidebar 增加场地工具入口，使用 Lucide 图标。
- 不新增独立的 `/guild-venue.html` 文件，因为当前项目使用 Next.js App Router 和多语言应用内导航。

## 布局方向

采用已确认的“画布优先”布局：

- 顶部工具栏：场地/楼层控制、添加设备、添加区域、添加通道、底图控制、撤销、重做、保存、导出。
- 左侧窄工具栏：场地列表、区域列表、对象库、图层、网格设置。
- 中间画布：核心工作区，包含大尺寸网格 2D 平面、缩放控制、可选中对象，以及可选的平面图底图层。
- 右侧属性面板：常驻显示当前选中对象的属性。

小屏幕上保留可访问性，但可以使用横向滚动或面板堆叠，不强行把完整编辑器优化成手机主流程。第一版主要面向桌面端后台管理场景。

## 数据模型

MVP 阶段保持本地、简单的数据结构：

```ts
type VenueLayout = {
  venueId: string
  name: string
  width: number
  height: number
  floors: VenueFloor[]
}

type VenueFloor = {
  id: string
  name: string
  width: number
  height: number
  backgroundImage?: string
  items: VenueItem[]
}

type VenueItem = {
  id: string
  type: 'equipment' | 'renovation' | 'area' | 'corridor' | 'workstation' | 'fire' | 'exit' | 'safety'
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  status: 'planned' | 'in_progress' | 'completed' | 'maintenance'
  note: string
}
```

初始数据放在 `src/venue/layoutData.ts`。运行时编辑结果可以用 `localStorage` 按版本化 key 保存，例如 `guild-venue:layout:v1`。这样第一版不需要数据库迁移也能形成可用闭环。

## 画布技术

第一版使用 React + SVG 实现。

理由：

- 当前项目没有 `konva` 或 `react-konva` 依赖。
- MVP 里的对象主要是矩形和图标，交互范围是基础选中、拖拽、缩放、旋转和导出，SVG 足够覆盖。
- 现在工作树已有其他未提交改动，避免新增画布依赖可以降低构建和集成风险。

组件边界要保留后续替换到 Konva 的空间。如果以后需要更成熟的框选、多选、复杂变换或图片导出能力，可以只替换画布层。

## 组件划分

新增：

- `src/venue/layoutData.ts`：类型定义、状态/类型选项、示例场地数据、localStorage 辅助函数、小型纯数据更新函数。
- `src/venue/VenueCanvas.jsx`：画布优先的 SVG 编辑区。负责 pointer 拖拽、选中命中区域、缩放状态、网格显示、对象渲染和导出辅助能力。
- `src/venue/VenueInspector.jsx`：右侧属性编辑面板。负责编辑名称、类型、状态、x/y、宽高、旋转和备注。
- `src/app/[locale]/(app)/guild-venue/page.tsx`：页面组合，管理撤销/重做/保存/导出的状态流。

如果实现时没有额外阻碍，优先使用 `.tsx`/`.ts`，即使最初需求里写的是 `.jsx`。当前代码库以 TypeScript 为主，类型约束对这个编辑器更有价值。

## 交互范围

第一版支持：

- 在画布或列表中点击对象并选中。
- 在画布中拖拽选中对象。
- 在属性面板中编辑位置、尺寸、旋转、类型、状态、名称和备注。
- 从顶部工具栏添加常见对象类型。
- 放大、缩小、重置缩放。
- 显示或切换网格。
- 通过简单控件配置底图 URL 或 base64 字符串。
- 当前会话内支持撤销/重做布局变更。
- 将编辑结果保存到浏览器 localStorage。
- 下载当前布局 JSON。
- 下载 SVG 图片。PNG 导出如果后续需要浏览器端 SVG 栅格化再补。

第一版不做：

- 精准 CAD 单位、真实尺寸吸附、墙体绘制、3D、多人实时协作、服务端持久化、审批流、施工任务关联、超出现有路由访问控制的权限体系、历史版本 UI。

## 错误处理

- 如果 localStorage 里是无效 JSON，忽略它并回退到示例数据。
- 如果没有选中对象，属性面板显示空状态，并禁用对象编辑控件。
- 如果浏览器导出失败，在工具栏附近显示简短内联错误。
- 底图保持可选；无效图片 URL 不应导致画布崩溃。

## 测试

为纯数据辅助函数增加聚焦测试：

- 添加对象时生成唯一对象，并带有默认尺寸和状态。
- 更新对象时只修改目标对象。
- 删除对象时在必要情况下清空当前选中状态。
- 撤销/重做状态流正确保留 previous 和 next 布局。
- 持久化数据无效时回退到默认布局。

手动验证：

- 打开应用内 `/zh/guild-venue`。
- 添加对象、拖拽对象、编辑属性面板字段、旋转对象、保存、刷新，并确认保存状态能恢复。
- 导出 JSON 和 SVG，确认文件包含当前对象状态。
