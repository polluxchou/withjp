import { notFound } from 'next/navigation'

// 没有任何路由匹配的地址只会落到根上的默认 404（没有侧栏、没有语言）。
// 用一个兜底段把它们接进来，交给同级的 not-found.tsx 渲染。
// 不读任何数据；登录检查由 layout 做。
export default function AppCatchAll() {
  notFound()
}
