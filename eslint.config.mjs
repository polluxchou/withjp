import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

// 由 .eslintrc.json 迁移而来（Next 16 移除了 `next lint`，eslint-config-next 16
// 只提供 flat config）。规则集与迁移前一致：只 extends core-web-vitals，
// 不加 eslint-config-next/typescript。
//
// 扫描范围由 package.json 的 `eslint src` 决定，与 next lint 默认只扫 src/ 一致。
// 不用 `eslint .`：flat config 不再默认忽略点目录，在主仓跑会把 .claude/worktrees/
// 下其它 worktree 的源码和 .next 产物一起扫进来。
const eslintConfig = [
  ...nextCoreWebVitals,
  {
    ignores: ['node_modules/**', '.next/**', 'out/**', 'messages/**'],
  },
  {
    rules: {
      'react-hooks/exhaustive-deps': 'error',

      // eslint-config-next 16 带入 eslint-plugin-react-hooks 7，recommended 里新增了一批
      // React Compiler 系规则。本仓没有启用 React Compiler，下面四条在升级时的存量命中
      // 全是 React 19 运行时下正确、但不满足编译器假设的写法，逐条评估后关闭；其余新规则
      // （static-components、use-memo、globals、error-boundaries、set-state-in-render 等）
      // 保持开启。以后要上 React Compiler，先把这四条重新打开、清完存量再说。
      //
      // set-state-in-effect（55 处 / 约 40 个文件）：effect 里同步 setState，主要是
      // 「打开时 setLoading(true) 再拉数据」和「props 变了重置本地状态」。代价是多一次
      // 渲染，不是错误；改写要逐页手动回归，本仓没有 DOM 测试环境，不在升级里顺带做。
      'react-hooks/set-state-in-effect': 'off',
      // refs（8 处）：渲染期读写 ref —— 「最新值 ref」（xxxRef.current = xxx）、
      // 惰性初始化的单例 ref、以及从自定义 hook 返回的 { ref, ... } 对象被整体当成 ref。
      'react-hooks/refs': 'off',
      // immutability（3 处）：effect 里改 R3F 相机参数、改 DOM 节点的 scrollLeft、
      // 调用在 effect 之后才声明的函数 —— 都是有意为之的命令式操作。
      'react-hooks/immutability': 'off',
      // purity（5 处）：渲染期读时钟。其中服务端组件按请求取「今天」是刻意设计
      // （force-dynamic 页面），useRef(Date.now()) 只用首次渲染的值。
      'react-hooks/purity': 'off',

      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXText[value=/[\\u4e00-\\u9fff]/]',
          message:
            'Bare Chinese in JSX text. Move the string into messages/{zh,en}.json and use useTranslations(). See docs/copy-glossary.md.',
        },
        {
          selector: 'JSXAttribute Literal[value=/[\\u4e00-\\u9fff]/]',
          message:
            'Bare Chinese in JSX attribute. Move the string into messages/{zh,en}.json and use useTranslations(). See docs/copy-glossary.md.',
        },
        {
          selector: 'JSXExpressionContainer Literal[value=/[\\u4e00-\\u9fff]/]',
          message:
            'Bare Chinese inside a JSX expression. Move the string into messages/{zh,en}.json and use useTranslations(). See docs/copy-glossary.md.',
        },
        {
          selector: 'JSXExpressionContainer TemplateElement[value.raw=/[\\u4e00-\\u9fff]/]',
          message:
            'Bare Chinese inside a JSX template literal. Move the string into messages/{zh,en}.json — use t() with placeholders. See docs/copy-glossary.md.',
        },
      ],
    },
  },
  {
    files: ['**/milestones/NextTimelineView.tsx'],
    rules: { 'no-restricted-syntax': 'off' },
  },
]

export default eslintConfig
