# 官网语言下拉菜单设计说明

> 日期：2026-08-11
> 分支：`feat/public-site`
> 范围：官网顶栏语言切换与 Contact 运营主体标签

## 1. 目标

将官网当前横向排列的 `中文 / EN / 日本語` 三个语言链接改为自定义下拉菜单。桌面顶栏与移动端抽屉复用同一组件，保持当前页面路径，并完整沿用官网的零圆角、发丝线和蓝图式视觉体系。

同时将 Contact 页第一段的合作方标签从固定英文 `RECRUITING PARTNER` 改为当前语言对应的运营主体标签：

- 中文：`运营主体`
- 日文：`運営主体`
- 英文：`Operating Entity`

`PRODUCTION PARTNER` 保持不变。

## 2. 视觉设计

### 2.1 触发按钮

- 只显示当前语言，例如 `● 日本語`。
- 右侧使用细线向下箭头，打开时旋转 180°。
- 与 `ThemeToggle` 等高，使用 `border-site-line-strong`、`font-condensed` 和现有字距。
- 零圆角、无旗帜、无后台 UI 的阴影和圆角样式。
- 当前语言文字与状态点使用 `site-accent`；hover 时边框和文字转为 `site-accent`。

### 2.2 下拉层

- 位于触发按钮下方并右侧对齐；宽度以完整容纳 `中文 / EN / 日本語` 三个选项为准。
- 背景使用 `site-canvas`，边框使用 `site-line-strong`，选项之间用 `site-line` 发丝线分隔。
- 每个选项为整行可点击链接；hover 使用 `site-panel`，不使用圆角。
- 当前语言显示青色方点和青色文字，并带 `aria-current="true"`。
- 下拉层使用明确的层级，覆盖内容但不改变顶栏高度或推动页面布局。

## 3. 交互与无障碍

- 点击触发按钮切换菜单开关。
- 点击菜单外部关闭。
- 按 `Escape` 关闭，并把焦点还给触发按钮。
- 触发按钮使用 `aria-haspopup="menu"`、`aria-expanded` 与当前语言的可读标签。
- 菜单使用 `role="menu"`，选项使用 `role="menuitem"`；现有 `next-intl` `Link` 继续负责语言路由。
- 选择语言后关闭菜单并保留 `usePathname()` 返回的当前无语言前缀路径。
- 移动端抽屉中的下拉菜单行为一致；切换完成后路由变化自然关闭当前页面状态。

## 4. 组件边界

- 修改 `src/components/site/LocaleSwitch.tsx`：管理开关状态、外部点击、Escape、焦点恢复和下拉渲染。
- 新增 `src/lib/site/locale-menu.ts` 与对应测试：从官网语言列表和当前语言生成顺序稳定、仅一项激活的菜单数据。
- `src/components/site/SiteHeader.tsx` 继续在桌面和移动端复用 `LocaleSwitch`，不复制菜单逻辑。
- 在 `messages/{zh,en,ja}.json` 的 `site.locale` 下增加菜单无障碍文案：中文 `切换语言 / 语言选项`、日文 `言語を切り替える / 言語オプション`、英文 `Switch language / Language options`。
- 修改三语 `site.contact.sections[0].partner`，写入对应的运营主体标签。
- 不修改后台 `src/components/layout/LanguageSwitcher.tsx`；其圆角、旗帜和后台 token 不属于官网体系。

## 5. 响应式与主题

- 桌面端菜单从按钮右下方展开，不遮挡 RECRUIT CTA。
- 移动端菜单保持在抽屉可视宽度内，不产生横向溢出。
- 深色和浅色主题都只使用现有 `site-*` token；浅色主题发丝线和 panel 对比度与 Contact 参考页面一致。

## 6. 测试与验收

测试先行：

1. 为语言菜单选项与当前语言状态增加纯函数测试，先观察测试因缺少实现而失败。
2. 实现最小菜单数据函数和下拉组件后，使测试转绿。
3. 更新 Contact 三语合作方标签，并由内容测试锁定三种值。
4. 运行完整单测、三语 parity、裸汉字与样式 token 检查。
5. 在 3099 浏览器验证桌面和移动端：打开/关闭、外部点击、Escape、当前语言状态、三种语言切换、路径保持、深浅主题和无横向溢出。

验收标准：三个并排语言链接不再出现；桌面与移动端均显示单一当前语言按钮；下拉交互可用且符合官网蓝图视觉；Contact 第一段按当前语言显示运营主体标签；`PRODUCTION PARTNER` 不变。
