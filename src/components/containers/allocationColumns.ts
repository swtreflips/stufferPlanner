/**
 * Shared column geometry for the container line-item table. Imported by the
 * tray's global header (ContainerTray) and by every container card
 * (ContainerCard / AllocationCard) so the columns line up across all of them.
 * Single source of truth — change a width here and the header + rows stay
 * aligned.
 */

/** Width of the left "Container" info column (header cell + each card's info column). */
export const CONTAINER_COL = 'w-52'

/**
 * The four line-item columns: Document Number · Item · Quantity · Cargo Ready.
 * Fixed edges with a flexible Item column so the left edges stay put as the
 * panel resizes. Used identically by the header labels and the allocation rows.
 */
export const LINE_GRID =
  'grid grid-cols-[5.5rem_minmax(0,1fr)_3rem_5.5rem] gap-2 items-center'

export interface LineColumn {
  key: 'documentNumber' | 'sku' | 'quantity' | 'cargoReady'
  label: string
  align: 'left' | 'right'
}

export const LINE_COLUMNS: LineColumn[] = [
  { key: 'documentNumber', label: 'Doc #', align: 'left' },
  { key: 'sku', label: 'Item', align: 'left' },
  { key: 'quantity', label: 'Qty', align: 'right' },
  { key: 'cargoReady', label: 'Cargo Ready', align: 'left' },
]
