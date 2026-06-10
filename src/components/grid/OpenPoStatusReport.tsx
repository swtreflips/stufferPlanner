import { useEffect, useMemo, useRef } from 'react'
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type CellDoubleClickedEvent,
  type CellEditingStartedEvent,
  type CellEditingStoppedEvent,
  type ColDef,
  type EditableCallbackParams,
  type GridApi,
  type GridReadyEvent,
  type ICellRendererParams,
} from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import type { MasterItem } from '../../types/masterItem'
import type { Profile } from '../../types/profile'
import { masterLockId } from '../../types/lock'
import { useAuth } from '../../auth/AuthProvider'
import { usePlannerStore } from '../../store/plannerStore'
import { formatDate } from '../../utils/dateHelpers'
import DraggableRowHandle from '../drag/DraggableRowHandle'
import DateCellEditor from './DateCellEditor'
import SetFilter from './SetFilter'

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

// Cargo Ready + CBM per Case are factory-owned master-data fields. Admin can
// edit any row; factories edit own-supplier rows only; internal is read-only
// (they own planning, not master data).
function canEditRow(item: MasterItem | undefined, user: Profile): boolean {
  if (!item) return false
  if (user.role === 'admin') return true
  if (user.role === 'factory') return item.supplierId === user.supplierId
  return false
}

const EDITABLE_FIELDS = new Set(['cargoReady', 'cbmPerCase'])

export default function OpenPoStatusReport() {
  const masterItems = usePlannerStore((s) => s.masterItems)
  const availableQty = usePlannerStore((s) => s.availableQty)
  const allocations = usePlannerStore((s) => s.allocations)
  const containers = usePlannerStore((s) => s.containers)
  const isLockedByOther = usePlannerStore((s) => s.isLockedByOther)
  const acquireLock = usePlannerStore((s) => s.acquireLock)
  const releaseLock = usePlannerStore((s) => s.releaseLock)
  const openAllocationDialog = usePlannerStore((s) => s.openAllocationDialog)
  const updateMasterCargoReady = usePlannerStore((s) => s.updateMasterCargoReady)
  const updateMasterCbmPerCase = usePlannerStore((s) => s.updateMasterCbmPerCase)
  const recentlySavedKey = usePlannerStore((s) => s.recentlySavedKey)
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

  // Repaint the two editable columns when the saved-flash key changes so the
  // teal highlight comes on and off without rebuilding the whole grid.
  useEffect(() => {
    gridApiRef.current?.refreshCells({
      columns: ['cargoReady', 'cbmPerCase'],
      force: true,
    })
  }, [recentlySavedKey])

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
      { field: 'name', headerName: 'Name', width: 180, filter: SetFilter },
      { field: 'documentNumber', headerName: 'Document Number', width: 150 },
      { field: 'shipTo', headerName: 'Ship To', width: 150, filter: SetFilter },
      { field: 'sku', headerName: 'Item', width: 170, filter: SetFilter },
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
        editable: (params: EditableCallbackParams<MasterItem>) =>
          canEditRow(params.data, user),
        cellEditor: 'agNumberCellEditor',
        cellEditorParams: { precision: 4, min: 0 },
        cellClass: (params) => {
          const classes: string[] = []
          if (canEditRow(params.data, user)) classes.push('bg-amber-accent/[0.04]')
          if (
            params.data &&
            params.colDef.field &&
            recentlySavedKey === `${params.data.id}:${params.colDef.field}`
          ) {
            classes.push('!bg-teal-accent/[0.18]')
          }
          return classes.join(' ')
        },
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
        editable: (params: EditableCallbackParams<MasterItem>) =>
          canEditRow(params.data, user),
        cellEditor: DateCellEditor,
        cellEditorPopup: true,
        cellClass: (params) => {
          const classes: string[] = []
          if (canEditRow(params.data, user)) classes.push('bg-amber-accent/[0.04]')
          if (
            params.data &&
            params.colDef.field &&
            recentlySavedKey === `${params.data.id}:${params.colDef.field}`
          ) {
            classes.push('!bg-teal-accent/[0.18]')
          }
          return classes.join(' ')
        },
      },
    ],
    [availableQty, user, recentlySavedKey],
  )

  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: true,
      filter: false,
      resizable: true,
    }),
    [],
  )

  const getRowClass = (params: { data?: MasterItem }) => {
    if (!params.data) return undefined
    return availableQty(params.data.id) === 0 ? 'opacity-50' : undefined
  }

  // Cell double-click drives two distinct flows: editing the field (handled by
  // AG Grid for editable cells) or opening the allocation picker (every other
  // cell). The editable-field path returns early so the row-level allocation
  // dialog does not fire on the same gesture.
  const handleCellDoubleClicked = (event: CellDoubleClickedEvent<MasterItem>) => {
    const field = event.colDef.field
    if (field && EDITABLE_FIELDS.has(field)) return
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

  // Inline edits acquire the master lock for the row at edit start and release
  // it at edit stop. If another tab already holds the lock, cancel the edit
  // before the user types anything.
  const handleCellEditingStarted = (event: CellEditingStartedEvent<MasterItem>) => {
    const item = event.data
    if (!item) return
    const resourceId = masterLockId(item.id)
    if (isLockedByOther(resourceId)) {
      event.api.stopEditing(true)
      return
    }
    acquireLock(resourceId, { id: user.id, displayName: user.displayName })
  }

  const handleCellEditingStopped = (event: CellEditingStoppedEvent<MasterItem>) => {
    const item = event.data
    if (!item) return
    const resourceId = masterLockId(item.id)
    releaseLock(resourceId)

    if (event.valueChanged !== true) return
    if (event.colDef.field === 'cargoReady') {
      const next = event.newValue
      if (typeof next === 'string' && next) {
        void updateMasterCargoReady(item.id, next)
      }
      return
    }
    if (event.colDef.field === 'cbmPerCase') {
      const next = event.newValue
      const parsed = typeof next === 'number' ? next : Number(next)
      if (Number.isFinite(parsed) && parsed >= 0) {
        void updateMasterCbmPerCase(item.id, parsed)
      }
      return
    }
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
        onCellDoubleClicked={handleCellDoubleClicked}
        onCellEditingStarted={handleCellEditingStarted}
        onCellEditingStopped={handleCellEditingStopped}
      />
    </div>
  )
}
