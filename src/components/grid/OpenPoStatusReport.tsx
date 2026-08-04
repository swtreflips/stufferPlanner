import { useEffect, useMemo, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
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
  // Headers are quieter and denser than the data, so every label fits on one line at these
  // column widths without wrapping or truncating.
  headerFontSize: 11,
  headerFontWeight: 600,
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
  { field: 'name', headerName: 'Supplier', flex: 0.77, minWidth: 77, filter: SetFilter }
const DOC_COL: ColDef<MasterItem> =
  { field: 'documentNumber', headerName: 'Doc #', flex: 0.90, minWidth: 90 }
const SHIP_TO_COL: ColDef<MasterItem> =
  { field: 'shipTo', headerName: 'Ship To', flex: 1.26, minWidth: 126, filter: SetFilter }

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

  // Local, not in the store: it is a way of looking at the board, not a fact about it, and it
  // should not survive a reload or follow you between sessions.
  const [showClosed, setShowClosed] = useState(false)

  // The whole master pane is a drop zone for allocations being pulled back out of a container.
  // `isOver` alone would light up for master rows being dragged INTO containers as well — those
  // pass over this pane constantly — so the affordance is gated on what is actually being held.
  const { setNodeRef: setDropRef, isOver, active } = useDroppable({
    id: 'master-list',
    data: { type: 'masterList' },
  })
  const returningAllocation =
    isOver && (active?.data.current as { type?: string } | undefined)?.type === 'allocation'

  // Hide fully-committed rows, then honor the supplier focus filter — for EVERY role.
  //
  // This used to pin factory users to `user.supplierId`, which was wrong once sibling plants
  // existed: a Junsun Thailand user is entitled to Qingdao's rows too, RLS returns all 34, and
  // the client then threw 9 of them away. The scoping is the database's job, and it already
  // does it — my_orgs() covers own-org plus siblings. Re-applying a narrower rule here did not
  // add safety, it subtracted data the user is allowed to see, invisibly.
  // Closed lines are LOADED but not shown. They are excluded here rather than in the repository
  // because a container built last week can still hold a PO that closed on Monday — the cards
  // resolve those rows by id, and dropping them from the store would leave an allocation unable
  // to name what is inside it. The board filters; the store keeps everything.
  const visibleRows = useMemo(
    () =>
      masterItems.filter((m) => {
        if (m.isClosed && !showClosed) return false
        // A closed line has nothing left to plan, so the fully-committed rule — which exists to
        // clear finished work off the board — must not also hide it when someone has explicitly
        // asked to see closed rows.
        if (!m.isClosed && m.committedQuantity >= m.originalQuantity) return false
        if (supplierFilterId) return m.supplierId === supplierFilterId
        return true
      }),
    [masterItems, supplierFilterId, showClosed],
  )

  const closedCount = useMemo(
    () => masterItems.filter((m) => m.isClosed).length,
    [masterItems],
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
        width: 32,
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

        DEFAULT SORT follows the same order: supplier, then destination. Internal viewing all
        suppliers gets every plant's rows stacked together and each plant's rows grouped by where
        they are going — which is the shape you need to see what could share a container. With a
        single supplier selected, Name is constant, so that sort degenerates to Ship To on its
        own and no special case is needed. External has no Name column, so Ship To simply leads.

        initialSort, NOT sort. `sort` is re-applied every time the column definitions are
        rebuilt, and this memo rebuilds on recentlySavedKey — which changes on every inline
        edit. That would silently throw away a user's own sort seconds after they set it.
        initialSort applies once and then leaves them alone.
      */
      ...(isInternal
        ? [
            { ...NAME_COL, initialSort: 'asc' as const, initialSortIndex: 0 },
            { ...SHIP_TO_COL, initialSort: 'asc' as const, initialSortIndex: 1 },
            DOC_COL,
          ]
        : [{ ...SHIP_TO_COL, initialSort: 'asc' as const, initialSortIndex: 0 }, DOC_COL]),
      { field: 'sku', headerName: 'Item', flex: 1.24, minWidth: 124, filter: SetFilter },
      {
        field: 'originalQuantity',
        headerName: 'Remaining',
        flex: 0.60,
        minWidth: 60,
        type: 'numericColumn',
      },
      {
        field: 'committedQuantity',
        headerName: 'Committed',
        flex: 0.36,
        minWidth: 36,
        type: 'numericColumn',
      },
      {
        headerName: 'Available',
        flex: 0.60,
        minWidth: 60,
        type: 'numericColumn',
        valueGetter: (params) =>
          params.data ? availableQty(params.data.id) : null,
        cellClassRules: {
          'text-coral-accent font-semibold': (params) => params.value === 0,
        },
      },
      {
        field: 'cbmPerCase',
        headerName: 'CBM/Case',
        flex: 0.70,
        minWidth: 70,
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
        flex: 0.70,
        minWidth: 70,
        type: 'numericColumn',
        valueFormatter: formatCbmCell,
      },
      {
        field: 'cargoReady',
        headerName: 'CRD',
        flex: 1.08,
        minWidth: 108,
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
      /*
        Columns FLEX to the pane instead of carrying fixed widths. The fixed set summed to 1416px
        against roughly 860px of pane, so the grid always scrolled horizontally — and a column
        you have to scroll to reach is a column you stop using.

        WIDTHS SERVE THE VALUES, NOT THE HEADERS. Eleven columns in 862px is roughly 78px each,
        so something has to give; sizing every column to fit its own LABEL meant several values
        truncated instead, which is the wrong way round. A header is read once and then known —
        a truncated value has to be hovered or widened every time you need it.

        Four columns are sized so their widest value renders in full, measured in the browser:
        Item (PECO-FH12717-1/6-A-V3), Ship To (Northampton, PA), CRD (Aug 20, 2026) and Doc #.
        The rest are squeezed to the width their values need — quantities are four digits, CBM
        is six characters — and their headers truncate to "Remaini…", "Availab…". That is the
        deliberate trade.

        Supplier is squeezed hardest despite long names, because the grid is SORTED by supplier:
        rows arrive in contiguous blocks, so the name is legible from the block you are in even
        when the cell clips. Context is doing the work the pixels would otherwise have to.
      */
    }),
    [],
  )

  const getRowClass = (params: { data?: MasterItem }) => {
    if (!params.data) return undefined
    // A closed line is history, not work. Struck through as well as faded, because fading alone
    // is what a fully-committed row already looks like and the two mean different things.
    if (params.data.isClosed) return 'opacity-50 line-through'
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
    <div ref={setDropRef} className="relative h-full w-full flex flex-col">
      {/*
        DRAGGING A LINE OUT OF A CONTAINER LANDS HERE.

        Until this existed, ContainerCard was the only drop target in the app, so pulling a line
        back towards the grid released over nothing and was silently discarded — the gesture
        everyone reaches for first did nothing at all, with no reason given.

        Dropping does not return the cases outright. It opens the same split dialog a click
        opens, because "take it out" almost never means "take all of it out", and a drag that
        silently emptied a line would be a destructive action triggered by a slip of the mouse.
      */}
      {returningAllocation && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-lg border-2 border-dashed border-amber-accent bg-amber-accent/5">
          <span className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-navy-900 shadow-lg">
            Release to choose how many cases go back
          </span>
        </div>
      )}
      {/* Only appears once something has actually closed, so the ordinary board is unchanged.
          A permanently visible switch for a state most weeks do not have is just noise. */}
      {closedCount > 0 ? (
        <label className="flex items-center justify-end gap-1.5 px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-navy-400 cursor-pointer border-b border-navy-200 bg-navy-50">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
            className="accent-amber-accent"
          />
          Show {closedCount} closed
        </label>
      ) : null}
      <AgGridReact<MasterItem>
        rowData={visibleRows}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        theme={stufferTheme}

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
