import { Constants } from './database.types.ts'
import type { Enums } from './database.types.ts'

// 数据库 enum 的运行时取值，直接取自生成的类型文件（npm run gen:types），
// 不再在业务代码里手抄一份清单。
export type DbEnumName = keyof typeof Constants.public.Enums

export function dbEnumValues(name: DbEnumName): readonly string[] {
  return Constants.public.Enums[name]
}

/**
 * 把外部输入（查询参数、请求体）收窄成数据库 enum。
 * 用在 .eq('<enum 列>', value) 之前：不合法的值以前会让 Postgres 报
 * "invalid input value for enum" 变成 500，现在由调用方返回 400。
 */
export function isDbEnum<N extends DbEnumName>(name: N, value: unknown): value is Enums<N> {
  return typeof value === 'string' && dbEnumValues(name).includes(value)
}

/**
 * 可选的 enum 过滤参数：空（null / undefined / ''）→ null 表示不过滤；合法 → 收窄后的值；
 * 不合法 → undefined，调用方回 400。返回的是新的常量，分页回调等闭包里直接可用，
 * 不依赖控制流收窄。
 */
export function optionalDbEnum<N extends DbEnumName>(
  name: N,
  value: string | null | undefined,
): Enums<N> | null | undefined {
  if (value === null || value === undefined || value === '') return null
  return isDbEnum(name, value) ? value : undefined
}
