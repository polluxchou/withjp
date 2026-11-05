# 自托管字体

构建不再依赖 Google Fonts（`next/font/google` 在 CI 上会偶发抓取失败，导致 `next build` 整体报错）。
字体文件来自 npm 上的 fontsource 包（只取 latin 子集），三个字族均为 SIL OFL 1.1，许可证文本在同目录。

| 字族 | 文件 | 来源 |
|---|---|---|
| Open Sans（可变 wght） | `open-sans-latin-wght-normal.woff2` | `@fontsource-variable/open-sans@5.3.0` |
| Barlow 400/500/600 | `barlow-latin-*-normal.woff2` | `@fontsource/barlow@5.3.0` |
| Barlow Condensed 400/500/600/700 | `barlow-condensed-latin-*-normal.woff2` | `@fontsource/barlow-condensed@5.3.0` |

用法见 `src/app/layout.tsx`（Open Sans）与 `src/app/[locale]/site/layout.tsx`（Barlow 两族），均为 `next/font/local`。
