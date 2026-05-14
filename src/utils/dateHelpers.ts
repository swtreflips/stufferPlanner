const EXCEL_EPOCH_OFFSET_DAYS = 25569
const MS_PER_DAY = 86_400_000

export function excelSerialToISO(serial: number): string {
  return new Date((serial - EXCEL_EPOCH_OFFSET_DAYS) * MS_PER_DAY).toISOString()
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
