import type { Container } from '../../types/container'

/**
 * How a new container is named and numbered, in one place.
 *
 * There are now two doors into creating one — the tray's Add container dialog, and the
 * allocation dialog when the line you are placing has nowhere to go. Both need the same default
 * name and the same code preview, and they had already started to disagree: the tray counted the
 * SUPPLIER-FILTERED set, so the name it proposed depended on which filter happened to be on.
 */

/**
 * The default name offered for the next container: `Container 7`.
 *
 * Counts every container the user can see, NOT the filtered subset. A name that changes because
 * of a dropdown is a name that means nothing, and two people on different filters would be
 * offered the same one.
 */
export const nextContainerName = (containers: Container[]): string =>
  `Container ${containers.length + 1}`

/**
 * The code the database is likely to mint: `DS0010`.
 *
 * Derived from the codes already loaded rather than from a counter. A counter that did not know
 * what already existed is precisely what was re-issuing numbers and tripping the UNIQUE
 * constraint.
 *
 * INDICATIVE, NOT AUTHORITATIVE. The real number comes from `next_container_code`, which
 * advances `planner_sequences` in a single atomic statement — so if a colleague creates one for
 * the same supplier in the meantime, this preview is one behind. That costs nothing; minting the
 * number in the client cost a failed save with no message.
 */
export function previewContainerCode(
  containers: Container[],
  supplierCode: string | null | undefined,
): string | null {
  if (!supplierCode) return null
  const prefix = supplierCode.toUpperCase()
  const used = containers
    .filter((c) => c.code.startsWith(prefix))
    .map((c) => Number(c.code.slice(prefix.length)))
    .filter((n) => Number.isFinite(n))
  return `${prefix}${String(Math.max(0, ...used) + 1).padStart(4, '0')}`
}
