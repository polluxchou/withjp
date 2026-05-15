export type ServiceKey = 'expenses' | 'finance_forecast' | 'creators'

export type SubjectType = 'record' | 'filter' | 'saved_view'

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
    filters?: Record<string, unknown>
  }
}

export type ThreadStatus = 'open' | 'resolved'

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

export type SenderType = 'user' | 'agent' | 'external'
export type MessageChannel = 'web' | 'email' | 'im'

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
