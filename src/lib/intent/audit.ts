import { createServerClient } from '@/lib/supabase/server'

// L6 — Audit log for the intent pipeline.
//
// Stages we care about and what they mean:
//   * input_gate    — empty / too long / sanitised-to-empty input
//   * parser        — Gemini returned non-JSON or schema-invalid output
//   * schema_refine — executor re-parse rejected the intent
//   * cross_check   — classifier said X, extractor produced Y
//   * authz_stage   — stageWrite resolved a target the actor can't modify
//   * authz_apply   — applyPendingAction caught a forbidden write at apply time
//
// We deliberately swallow errors here: an audit-write failure must not
// surface as a request failure, and we never want to retry.
export type ViolationStage =
  | 'input_gate'
  | 'parser'
  | 'schema_refine'
  | 'cross_check'
  | 'authz_stage'
  | 'authz_apply'

export interface ViolationRecord {
  userId?:     string
  channel?:    string
  stage:       ViolationStage
  reason:      string
  rawText?:    string
  intentJson?: unknown
}

export async function logIntentViolation(rec: ViolationRecord): Promise<void> {
  try {
    const db = createServerClient()
    await db.from('intent_violations').insert({
      user_id:     rec.userId ?? null,
      channel:     rec.channel ?? 'web',
      stage:       rec.stage,
      reason:      rec.reason,
      raw_text:    rec.rawText ?? null,
      intent_json: (rec.intentJson ?? null) as never,
    })
  } catch {
    // intentionally silent — audit failures must not break the request path
  }
}
