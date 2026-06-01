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
import { masterLockId } from '../../types/lock'
import { useAuth } from '../../auth/AuthProvider'
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
  const availableQty = usePlannerStore((s) => s.availableQty)
  const allocations = usePlannerStore((s) => s.allocations)
  const containers = usePlannerStore((s) => s.containers)
  const isLockedByOther = usePlannerStore((s) => s.isLockedByOther)
  const acquireLock = usePlannerStore((s) => s.acquireLock)
  const openAllocationDialog = usePlannerStore((s) => s.openAllocationDialog)
  const supplierFilterId = usePlannerStore((s) => s.supplierFilterId)
  const { user } = useAuth()

  // Hide fully-committed rows; for factory users, also restrict to their
  // supplier; for admin/internal, honor the optional supplier focus filter.
  const visibleRows = useMemo(
    () =>
      masterItems.filter((m) => {
        if (m.committedQuantity >= m.originalQuantity) return false
        if (user.role === 'factory' && user.supplierId) {
          return m.supplierId === user.supplierId
        }
        if (supplierFilterId) return m.supplierId === supplierFilterId
        return true
      }),
    [masterItems, user.role, user.supplierId, supplierFilterId],
  )

  const gridApiRef = useRef<GridApi<MasterItem> | null>(null)

  const onGridReady = (event: GridReadyEvent<MasterItem>) => {
    gridApiRef.current = event.api
  }

  useEffect(() => {
    gridApiRef.current?.refreshCells({ force: true })
    gridApiRef.current?.redrawRows()
  }, [allocations, containers, masterItems])

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
      { field: 'name', headerName: 'Name', width: 180 },
      { field: 'documentNumber', headerName: 'Document Number', width: 150 },
      { field: 'shipTo', headerName: 'Ship To', width: 150 },
      { field: 'sku', headerName: 'Item', width: 170 },
      {
        field: 'originalQuantity',
        headerName: 'Quantity Remaining',
        width: 150,
        type: 'numericColumn',
      },
      {
        field: 'committedQuantity',
        headerName: 'Committed',
        width: 110,
        type: 'numericColumn',
      },
      {
        headerName: 'Available',
        width: 110,
        type: 'numericColumn',
        valueGetter: (params) =>
          params.data ? availableQty(params.data.id) : null,
        cellClassRules: {
          'text-coral-accent font-semibold': (params) => params.value === 0,
        },
      },
      {
        field: 'cbmPerCase',
        headerName: 'CBM per Case',
        width: 120,
        type: 'numericColumn',
        valueFormatter: formatCbmCell,
      },
      {
        field: 'cbmTotal',
        headerName: 'Total CBM',
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
    ],
    [availableQty],
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
    return availableQty(params.data.id) === 0 ? 'opacity-50' : undefined
  }

  const handleRowDoubleClick = (event: { data?: MasterItem }) => {
    const item = event.data
    if (!item) return
    if (availableQty(item.id) === 0) return
    const resourceId = masterLockId(item.id)
    if (isLockedByOther(resourceId)) return
    if (!acquireLock(resourceId, { id: user.id, displayName: user.displayName })) {
      return
    }
    openAllocationDialog({ kind: 'create', masterItemId: item.id })
  }

  return (
    <div className="h-full w-full">
      <AgGridReact<MasterItem>
        rowData={visibleRows}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        theme={stufferTheme}
        headerHeight={40}
        rowHeight={34}
        animateRows
        getRowClass={getRowClass}
        onGridReady={onGridReady}
        onRowDoubleClicked={handleRowDoubleClick}
      />
    </div>
  )
}
