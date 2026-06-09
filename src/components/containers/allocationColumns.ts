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
 * Proportional tracks so the space spreads evenly instead of dumping all the
 * slack into Item; minmax(0,…) lets long values truncate rather than overflow.
 * Used identically by the header labels and the allocation rows.
 */
export const LINE_GRID =
  'grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.6fr)_minmax(0,1fr)] gap-2 items-center'

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
