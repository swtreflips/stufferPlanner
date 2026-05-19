export interface LockEntry {
  resourceId: string         // "master:<masterItemId>"
  userId: string
  sessionId: string
  displayName: string
  acquiredAt: string         // ISO
  expiresAt: string          // ISO
}

export type PresenceMessage =
  | { type: 'lock-add'; lock: LockEntry }
  | { type: 'lock-remove'; resourceId: string; sessionId: string }
  | { type: 'lock-refresh'; resourceId: string; sessionId: string; expiresAt: string }
  | { type: 'snapshot'; locks: LockEntry[] }
  | { type: 'snapshot-request' }

export function masterLockId(masterItemId: string): string {
  return `master:${masterItemId}`
}
