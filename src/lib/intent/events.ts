export const INTENT_APPLIED_EVENT = 'intent:applied'

type IntentEventTarget = Pick<Window, 'dispatchEvent'> | Pick<EventTarget, 'dispatchEvent'>

export function notifyIntentApplied(target?: IntentEventTarget): boolean {
  const eventTarget = target ?? (typeof window === 'undefined' ? undefined : window)
  if (!eventTarget) return false

  eventTarget.dispatchEvent(new Event(INTENT_APPLIED_EVENT))
  return true
}
