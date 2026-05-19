// Deterministic colour assignment so each user is recognisable in presence chips.
// Hardcoded mapping for seeded sample users; deterministic hash fallback for the rest.

interface PresenceColor {
  bg: string       // tailwind-ish; used as inline style for chip background
  text: string     // foreground text color
  border: string   // ring / border accent
}

const PALETTE: PresenceColor[] = [
  { bg: '#f59e0b', text: '#0a0e1a', border: '#b45309' }, // amber
  { bg: '#0d9488', text: '#ffffff', border: '#0f766e' }, // teal
  { bg: '#f87171', text: '#0a0e1a', border: '#dc2626' }, // coral
  { bg: '#7389b8', text: '#0a0e1a', border: '#4e6399' }, // navy-400
  { bg: '#a78bfa', text: '#0a0e1a', border: '#7c3aed' }, // violet
  { bg: '#facc15', text: '#0a0e1a', border: '#a16207' }, // yellow
]

const HARDCODED: Record<string, number> = {
  'user-mike': 3,       // navy
  'user-internal': 1,   // teal
  'user-michelle': 0,   // amber
  'user-prasad': 4,     // violet
}

function hashUserId(userId: string): number {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0
  }
  return hash
}

export function colorForUser(userId: string): PresenceColor {
  const fixedIdx = HARDCODED[userId]
  const idx = fixedIdx ?? hashUserId(userId) % PALETTE.length
  return PALETTE[idx]
}

export function initialFor(displayName: string): string {
  const trimmed = displayName.trim()
  if (!trimmed) return '?'
  return trimmed.charAt(0).toUpperCase()
}
