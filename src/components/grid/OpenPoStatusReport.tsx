import { useMemo } from 'react'
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
} from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import type { OpenPoItem } from '../../types/openPoItem'
import { usePlannerStore } from '../../store/plannerStore'
import { formatDate } from '../../utils/dateHelpers'

ModuleRegistry.registerModules([AllCommunityModule])

const stufferTheme = themeQuartz.withParams({
  backgroundColor: '#f4f6fa',
  foregroundColor: '#0f1629',
  chromeBackgroundColor: '#0f1629',
  headerTextColor: '#e8ecf4',
  borderColor: '#c5d0e6',
  accentColor: '#f59e0b',
  fontFamily: 'DM Sans, system-ui, sans-serif',
  fontSize: 13,
  spacing: 6,
})

const formatDateCell = (params: { value: unknown }): string =>
  typeof params.value === 'string' && params.value ? formatDate(params.value) : ''

const formatCbmCell = (params: { value: unknown }): string =>
  typeof params.value === 'number' ? params.value.toFixed(4) : ''

export default function OpenPoStatusReport() {
  const openPoStatusReport = usePlannerStore((s) => s.openPoStatusReport)

  const columnDefs = useMemo<ColDef<OpenPoItem>[]>(
    () => [
      { field: 'documentNumber', headerName: 'PO #', width: 110 },
      { field: 'lineId', headerName: 'Line', width: 70, type: 'numericColumn' },
      { field: 'sku', headerName: 'SKU', width: 160 },
      { field: 'name', headerName: 'Vendor', width: 130 },
      { field: 'shipTo', headerName: 'Ship To', width: 140 },
      { field: 'quantityRemaining', headerName: 'Qty', width: 90, type: 'numericColumn' },
      {
        field: 'cbmPerCase',
        headerName: 'CBM / case',
        width: 110,
        type: 'numericColumn',
        valueFormatter: formatCbmCell,
      },
      {
        field: 'cbmTotal',
        headerName: 'CBM total',
        width: 110,
        type: 'numericColumn',
        valueFormatter: formatCbmCell,
      },
      {
        field: 'cargoReady',
        headerName: 'Cargo Ready',
        width: 130,
        valueFormatter: formatDateCell,
      },
      {
        field: 'requestedShipBy',
        headerName: 'Requested Ship',
        width: 140,
        valueFormatter: formatDateCell,
      },
      { field: 'etd', headerName: 'ETD (days)', width: 100, type: 'numericColumn' },
      {
        field: 'eta',
        headerName: 'ETA',
        width: 130,
        valueFormatter: formatDateCell,
      },
      {
        field: 'dateIssued',
        headerName: 'Date Issued',
        width: 130,
        valueFormatter: formatDateCell,
      },
    ],
    [],
  )

  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
    }),
    [],
  )

  return (
    <div className="h-full w-full">
      <AgGridReact<OpenPoItem>
        rowData={openPoStatusReport}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        theme={stufferTheme}
        headerHeight={40}
        rowHeight={34}
        animateRows
      />
    </div>
  )
}
