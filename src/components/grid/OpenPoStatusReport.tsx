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

// ag-Grid is themed through JS params, not Tailwind, so it cannot inherit the skin the way the
// rest of the app does. These read the same CSS variables index.css defines — otherwise the
// grid, which is the densest surface here, keeps the old palette while everything around it
// changes. Values are resolved at module load, which is fine: the skin does not change at
// runtime in this app.
const token = (name: string, fallback: string) =>
  (typeof window !== 'undefined'
    && getComputedStyle(document.documentElement).getPropertyValue(name).trim())
  || fallback

const stufferTheme = themeQuartz.withParams({
  backgroundColor: token('--color-navy-50', '#f7f7f5'),
  foregroundColor: token('--color-navy-900', '#112424'),
  // Light header: a column header is content, not chrome. Mirrors RatesApp's grids and the
  // container tray beside it. See OS/DESIGN.md.
  chromeBackgroundColor: token('--color-navy-50', '#f7f7f5'),
  headerTextColor: token('--color-navy-500', '#625d55'),
  borderColor: token('--color-navy-200', '#dad7d3'),
  accentColor: token('--color-amber-accent', '#ad552a'),
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
function canEditRow(
  item: MasterItem | undefined,
  user: Profile,
  myOrgIds: string[],
): boolean {
  if (!item) return false
  if (user.role === 'admin') return true
  // Any plant the user belongs to, not just their primary organization. A Junsun Thailand
  // login is the same people as Qingdao — checking user.supplierId alone made a sibling's
  // rows visible but read-only, which looks like a broken grid rather than a rule.
  if (user.role === 'factory') return myOrgIds.includes(item.supplierId)
  return false
}

// Declared once and composed per role below — the same column must not be able to drift into
// two different widths or filters depending on who is looking at it.
const NAME_COL: ColDef<MasterItem> =
  { field: 'name', headerName: 'Name', width: 180, filter: SetFilter }
const DOC_COL: ColDef<MasterItem> =
  { field: 'documentNumber', headerName: 'Document Number', width: 150 }
const SHIP_TO_COL: ColDef<MasterItem> =
  { field: 'shipTo', headerName: 'Ship To', width: 150, filter: SetFilter }

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
  const myOrgIds = usePlannerStore((s) => s.myOrgIds)
  const { user } = useAuth()
  const isInternal = user.role === 'internal' || user.role === 'admin'

  // Hide fully-committed rows, then honor the supplier focus filter — for EVERY role.
  //
  // This used to pin factory users to `user.supplierId`, which was wrong once sibling plants
  // existed: a Junsun Thailand user is entitled to Qingdao's rows too, RLS returns all 34, and
  // the client then threw 9 of them away. The scoping is the database's job, and it already
  // does it — my_orgs() covers own-org plus siblings. Re-applying a narrower rule here did not
  // add safety, it subtracted data the user is allowed to see, invisibly.
  const visibleRows = useMemo(
    () =>
      masterItems.filter((m) => {
        if (m.committedQuantity >= m.originalQuantity) return false
        if (supplierFilterId) return m.supplierId === supplierFilterId
        return true
      }),
    [masterItems, supplierFilterId],
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
      /*
        SHIP TO COMES BEFORE DOCUMENT NUMBER for both roles. Destination is what you scan by —
        it groups rows into things that could share a container, which is the whole job of this
        screen. A document number identifies a row once you have found it; it is a lookup key,
        not something you read down a column.

        The only difference is the supplier column, and it is internal-only. Internal spans
        eighteen suppliers, so "whose is this" leads. An external user works for one company and
        the plant dropdown already fixes which — the column repeated that on every row and cost
        180px of a dense grid to do it.

        Everything after these is identical for both.
      */
      ...(isInternal
        ? [NAME_COL, SHIP_TO_COL, DOC_COL]
        : [SHIP_TO_COL, DOC_COL]),
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
          canEditRow(params.data, user, myOrgIds),
        cellEditor: 'agNumberCellEditor',
        cellEditorParams: { precision: 4, min: 0 },
        cellClass: (params) => {
          const classes: string[] = []
          if (canEditRow(params.data, user, myOrgIds)) classes.push('bg-amber-accent/[0.04]')
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
        headerName: 'Cargo Ready Date',
        width: 130,
        valueFormatter: formatDateCell,
        editable: (params: EditableCallbackParams<MasterItem>) =>
          canEditRow(params.data, user, myOrgIds),
        cellEditor: DateCellEditor,
        cellEditorPopup: true,
        cellClass: (params) => {
          const classes: string[] = []
          if (canEditRow(params.data, user, myOrgIds)) classes.push('bg-amber-accent/[0.04]')
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
    [availableQty, user, myOrgIds, recentlySavedKey, isInternal],
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
