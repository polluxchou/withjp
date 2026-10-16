import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { buildRobots } from '@/lib/site/robots'

// 必须每次请求现算：结果取决于请求的 host。若被构建成静态文件，所有域名会拿到
// 同一份构建期结果（构建环境没有官网 host → 官网也会拿到 disallow）。
export const dynamic = 'force-dynamic'

export default async function robots(): Promise<MetadataRoute.Robots> {
  return buildRobots((await headers()).get('host'))
}
