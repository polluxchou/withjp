export type SaveState = 'idle' | 'saved' | 'error'

// canEdit: may modify the canvas; canManage: may manage collaborators (owner/admin).
export type VenueSummary = { id: string; name: string; canEdit: boolean; canManage: boolean }
