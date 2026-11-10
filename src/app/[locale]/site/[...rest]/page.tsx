import { notFound } from 'next/navigation'

// 官网下不存在的子路径 → site/not-found.tsx。官网域名上这类地址在 proxy 就被
// domain-routing 的白名单挡成 404 了，这里接的是经内部域名 /<locale>/site/... 进来的。
export default function SiteCatchAll() {
  notFound()
}
