import type { PresenceMessage } from '../types/lock'

const CHANNEL_NAME = 'stuffer-planner-presence'

export type PresenceListener = (msg: PresenceMessage) => void

export interface PresenceChannel {
  send(msg: PresenceMessage): void
  subscribe(listener: PresenceListener): () => void
  close(): void
}

// Thin wrapper around BroadcastChannel. Phase 12 swaps the internals for a
// Supabase Realtime channel; the surface stays identical.
export function createPresenceChannel(): PresenceChannel {
  if (typeof BroadcastChannel === 'undefined') {
    // Server-side / older browsers: no-op channel.
    return {
      send() {},
      subscribe() {
        return () => {}
      },
      close() {},
    }
  }

  const channel = new BroadcastChannel(CHANNEL_NAME)
  const listeners = new Set<PresenceListener>()

  channel.onmessage = (event: MessageEvent<PresenceMessage>) => {
    for (const l of listeners) l(event.data)
  }

  return {
    send(msg) {
      channel.postMessage(msg)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    close() {
      listeners.clear()
      channel.close()
    },
  }
}
