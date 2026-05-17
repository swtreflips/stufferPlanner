import { useEffect, useMemo, useRef } from 'react'
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type GridApi,
  type GridReadyEvent,
  type ICellRendererParams,
} from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import type { MasterItem } from '../../types/masterItem'
import { usePlannerStore } from '../../store/plannerStore'
import { formatDate } from '../../utils/dateHelpers'
import DraggableRowHandle from '../drag/DraggableRowHandle'

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
  const masterItems = usePlannerStore((s) => s.masterItems)
  const currentScenarioId = usePlannerStore((s) => s.currentScenarioId)
  const availableQty = usePlannerStore((s) => s.availableQty)
  const allocations = usePlannerStore((s) => s.allocations)

  const gridApiRef = useRef<GridApi<MasterItem> | null>(null)

  const onGridReady = (event: GridReadyEvent<MasterItem>) => {
    gridApiRef.current = event.api
  }

  useEffect(() => {
    gridApiRef.current?.refreshCells({ force: true })
    gridApiRef.current?.redrawRows()
  }, [allocations, currentScenarioId])

  const columnDefs = useMemo<ColDef<MasterItem>[]>(
    () => [
      {
        headerName: '',
        width: 36,
        sortable: false,
        filter: false,
        resizable: false,
        suppressMovable: true,
        cellRenderer: (params: ICellRendererParams<MasterItem>) =>
          params.data ? <DraggableRowHandle masterItem={params.data} /> : null,
        cellStyle: { padding: 0 },
      },
      { field: 'documentNumber', headerName: 'PO #', width: 110 },
      { field: 'lineId', headerName: 'Line', width: 70, type: 'numericColumn' },
      { field: 'sku', headerName: 'SKU', width: 160 },
      { field: 'name', headerName: 'Vendor', width: 130 },
      { field: 'shipTo', headerName: 'Ship To', width: 140 },
      { field: 'originalQuantity', headerName: 'Qty', width: 90, type: 'numericColumn' },
      {
        headerName: 'Available',
        width: 110,
        type: 'numericColumn',
        valueGetter: (params) =>
          params.data ? availableQty(currentScenarioId, params.data.id) : null,
        cellClassRules: {
          'text-coral-accent font-semibold': (params) => params.value === 0,
        },
      },
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
    [availableQty, currentScenarioId],
  )

  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
    }),
    [],
  )

  const getRowClass = (params: { data?: MasterItem }) => {
    if (!params.data) return undefined
    return availableQty(currentScenarioId, params.data.id) === 0
      ? 'opacity-50'
      : undefined
  }

  return (
    <div className="h-full w-full">
      <AgGridReact<MasterItem>
        rowData={masterItems}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        theme={stufferTheme}
        headerHeight={40}
        rowHeight={34}
        animateRows
        getRowClass={getRowClass}
        onGridReady={onGridReady}
      />
    </div>
  )
}
