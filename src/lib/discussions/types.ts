import type { Enums, Json } from '../supabase/database.types.ts'

export type ServiceKey = 'expenses' | 'finance_forecast' | 'creators'

// 枚举直接取自数据库类型（npm run gen:types），库里改了 enum 这里跟着变。
export type SubjectType = Enums<'discussion_subject_type'>

export type RecordSubjectInput = {
  subjectType: 'record'
  serviceKey: ServiceKey
  entityType: string
  entityId: string
  label: string
  route: string
}

export type FilterSubjectInput = {
  subjectType: 'filter'
  serviceKey: ServiceKey
  entityType: string
  filters: Record<string, unknown>
  label: string
  route: string
}

export type SavedViewSubjectInput = {
  subjectType: 'saved_view'
  serviceKey: ServiceKey
  entityType: string
  entityId: string
  label: string
  route: string
}

export type SubjectInput =
  | RecordSubjectInput
  | FilterSubjectInput
  | SavedViewSubjectInput

export interface NormalizedSubject {
  serviceKey: ServiceKey
  subjectType: SubjectType
  entityType: string
  entityId: string | null
  subjectHash: string | null
  subjectPayload: {
    label: string
    route: string
    filters?: { [key: string]: Json }
  }
}

export type ThreadStatus = Enums<'discussion_status'>

export type Thread = {
  id: string
  topicCode: string
  serviceKey: ServiceKey
  assignedAgentId: string
  subjectType: SubjectType
  entityType: string
  entityId: string | null
  subjectHash: string | null
  subjectPayload: Record<string, unknown>
  title: string
  status: ThreadStatus
  createdByUserId: string
  resolvedByUserId: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

export type SenderType = Enums<'discussion_sender_type'>
export type MessageChannel = Enums<'discussion_channel'>

export type Message = {
  id: string
  threadId: string
  parentId: string | null
  senderType: SenderType
  senderUserId: string | null
  senderAgentId: string | null
  channel: MessageChannel
  body: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}
