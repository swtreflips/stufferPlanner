import type { LockEntry } from '../../types/lock'
import { colorForUser, initialFor } from '../../utils/userColor'

interface Props {
  lock: LockEntry
  size?: 'sm' | 'md'
}

export default function LockedAvatar({ lock, size = 'sm' }: Props) {
  const color = colorForUser(lock.userId)
  const initial = initialFor(lock.displayName)
  const dim = size === 'md' ? 'w-6 h-6 text-[11px]' : 'w-5 h-5 text-[10px]'
  return (
    <span
      title={`${lock.displayName} is editing this row`}
      aria-label={`${lock.displayName} is editing this row`}
      className={`inline-flex items-center justify-center rounded-full font-mono font-bold shadow-sm border ${dim}`}
      style={{
        backgroundColor: color.bg,
        color: color.text,
        borderColor: color.border,
      }}
    >
      {initial}
    </span>
  )
}
