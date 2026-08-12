# Contact 公司官网链接设计

## 目标

在官网 Contact 页的 01、02 资料表中分别增加对应公司的官网链接：

- Contact 01（Chiron）：`https://chi-ron.com/`
- Contact 02（吉光片羽株式会社）：`https://kikkou.jp/`

## 设计

沿用现有 Contact 资料行的数据驱动结构，在三语字典的 01、02 区块各新增一条官网资料行。行标题分别使用 `会社サイト`、`公司官网`、`Website`。

`SiteContactRowCopy.link` 从仅支持邮件扩展为支持 `email` 和 `external`。`buildContactSections` 将外链行的值直接映射为 `href`，组件根据链接类型为外链增加 `target="_blank"` 与 `rel="noreferrer"`，邮件链接保持当前行为不变。

## 验收标准

- 三种语言的 Contact 01 均展示并可点击 `https://chi-ron.com/`。
- 三种语言的 Contact 02 均展示并可点击 `https://kikkou.jp/`。
- 两个公司官网在新标签页打开。
- Contact 03 的 `mailto:business@echoamp.jp` 行为保持不变。
- Contact 定向测试、文案检查、完整测试和生产构建全部通过。

## 范围

不调整 Contact 页面布局、配色、其他资料行或其他页面内容。
