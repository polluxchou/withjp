// src/components/site/staff-application-form.ts — StaffApplicationForm 的提交前
// 必选项判空，抽成纯函数以便测试（组件本身不方便直接跑 node --test）。
//
// 为什么这道判空不能靠"默认预选第一项"或"服务端补"：
//   - kind 决定这条投递走哪条招募线（摄影师／化妆师／团播运营）。如果两个
//     radio 组都不预选、用户没选就提交，FormData.get('kind') 是 null；
//     validateApplication（../../lib/site/application.ts）把「kind 是 null」
//     和「完全没传 kind」同等对待，静默按 creator 处理——而 creator 分支要求
//     age，这个表单压根没有 age 字段，必然以 fields.age = 'required' 失败，
//     但表单没有绑定 age 的 <Field>，用户什么提示都看不到。
//   - 反过来如果给 kind 默认预选（例如默认选中"摄影师"），没留意单选组已经
//     有默认值的用户会在「提交成功」的假象下把简历投错类别，且没有自由文本
//     字段能让 ops 事后发现——这个后果比「不选就报错」更隐蔽、更难挽回。
//   - 所以两组都不预选，改成提交前在客户端判空，复用已经写好的
//     `<Field error={fields.kind}>` 展示路径，判空失败时不发网络请求。
//
// 相对路径 + 显式 .ts 后缀（而非 @/ alias）：本文件要被
// staff-application-form.test.ts 用 `node --experimental-strip-types` 直接跑，
// Node 的 ESM 解析不认识 tsconfig 的 @/ path alias。
import type { ApplicationFields } from '../../lib/site/application.ts'

/**
 * 判断 kind／commuteMode 是否都已选择。两者都是 radio 组，未选中时
 * `FormData.get(name)` 返回 null；空字符串同样视为未选。
 * 返回值可直接喂给渲染错误提示的 state——非空即代表「不要发请求」。
 */
export function checkStaffRequiredChoices(input: {
  kind: FormDataEntryValue | null
  commuteMode: FormDataEntryValue | null
}): ApplicationFields {
  const fields: ApplicationFields = {}
  if (!input.kind) fields.kind = 'required'
  if (!input.commuteMode) fields.commuteMode = 'required'
  return fields
}
