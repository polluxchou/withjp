export type LatestSaveQueueStatus = 'saving' | 'saved' | 'error'

export function createLatestSaveQueue<T>(
  save: (snapshot: T) => Promise<void>,
  onStatus?: (status: LatestSaveQueueStatus) => void,
) {
  let inFlight = false
  let hasQueued = false
  let queuedSnapshot: T | undefined

  async function run(snapshot: T) {
    inFlight = true
    onStatus?.('saving')

    let next: T | undefined = snapshot
    while (next !== undefined) {
      const current = next
      next = undefined

      try {
        await save(current)
        if (!hasQueued) onStatus?.('saved')
      } catch {
        if (!hasQueued) onStatus?.('error')
      }

      if (hasQueued) {
        next = queuedSnapshot
        queuedSnapshot = undefined
        hasQueued = false
        onStatus?.('saving')
      }
    }

    inFlight = false
  }

  return {
    enqueue(snapshot: T) {
      if (inFlight) {
        queuedSnapshot = snapshot
        hasQueued = true
        onStatus?.('saving')
        return
      }

      void run(snapshot)
    },

    isSaving() {
      return inFlight || hasQueued
    },
  }
}
