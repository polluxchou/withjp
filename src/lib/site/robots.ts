import type { MetadataRoute } from 'next'
import { isPublicSiteHost, PUBLIC_SITE_HOST } from './domain-routing.ts'

// 同一次部署同时服务官网域名和内部后台域名，robots.txt 必须按请求的 host 分开给：
// 官网允许抓取并指向 sitemap；其余（内部域名、*.vercel.app 预览、本地）一律禁止，
// 内部后台的登录页之类不该出现在搜索结果里。
//
// 把官网误判成禁止 = 整站被撤出 Google，所以判定只走 isPublicSiteHost 这一处，
// robots.test.ts 覆盖了 Host 头的各种写法。
export function buildRobots(host: string | null): MetadataRoute.Robots {
  if (isPublicSiteHost(host)) {
    return {
      rules: { userAgent: '*', allow: '/' },
      sitemap: `https://${PUBLIC_SITE_HOST}/sitemap.xml`,
    }
  }
  return { rules: { userAgent: '*', disallow: '/' } }
}
