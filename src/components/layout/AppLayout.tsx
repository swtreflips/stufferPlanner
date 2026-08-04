import { lazy, Suspense, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import AccountMenu from './AccountMenu'
import SplitPane from './SplitPane'
import SupplierFilter from './SupplierFilter'
import logoUrl from '../../assets/logo.png'
import { masterLockId } from '../../types/lock'
import { useAuth } from '../../auth/AuthProvider'
import { usePlannerStore } from '../../store/plannerStore'
import ContainerTray from '../containers/ContainerTray'
import DragOverlayRenderer from '../drag/DragOverlayRenderer'
import { Upload } from 'lucide-react'
import AllocationDialog from '../containers/AllocationDialog'
import CommitConfirmDialog from '../containers/CommitConfirmDialog'
import ContainerLogisticsDialog from '../containers/ContainerLogisticsDialog'
import MasterCsvUploadDialog from '../grid/MasterCsvUploadDialog'
import PresenceManager from '../presence/PresenceManager'

const OpenPoStatusReport = lazy(() => import('../grid/OpenPoStatusReport'))

const gridLoadingFallback = (
  <div className="flex items-center justify-center h-full text-navy-400 text-xs font-mono uppercase tracking-widest">
    Loading grid...
  </div>
)

interface DraggedItemData {
  type: 'masterItem' | 'allocation'
  masterItemId?: string
  allocationId?: string
  shipTo?: string
  supplierId?: string
  sourceContainerId?: string
}

interface DropTargetData {
  // 'container' — a container card. 'masterList' — the open-PO pane, i.e. taking cases back out.
  type?: string
  containerId?: string
  destination?: string
  supplierId?: string
}

export default function AppLayout() {
  const { user } = useAuth()
  const openPoCount = usePlannerStore((s) => s.masterItems.length)
  const openAllocationDialog = usePlannerStore((s) => s.openAllocationDialog)
  const openCsvUploadDialog = usePlannerStore((s) => s.openCsvUploadDialog)
  const acquireLock = usePlannerStore((s) => s.acquireLock)
  const releaseLock = usePlannerStore((s) => s.releaseLock)
  const hydrate = usePlannerStore((s) => s.hydrate)
  const loadError = usePlannerStore((s) => s.loadError)

  // Load here, not in the store creator. AppLayout mounts only after AuthProvider has both a
  // session and a profile, so every request carries a JWT and RLS can scope it. Keyed on the
  // user id so switching accounts refetches instead of leaving the previous person's rows.
  useEffect(() => {
    void hydrate(user)
  }, [hydrate, user])

  // Admin + factory can upload factory CSVs (master-data edits); internal is
  // read-only on master data, no upload affordance.
  const canUploadCsv = user.role === 'admin' || user.role === 'factory'

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as DraggedItemData | undefined
    if (!data?.masterItemId) return
    acquireLock(masterLockId(data.masterItemId), {
      id: user.id,
      displayName: user.displayName,
    })
  }

  const releaseForActive = (data: DraggedItemData | undefined) => {
    if (data?.masterItemId) releaseLock(masterLockId(data.masterItemId))
  }

  const handleDragCancel = (event: DragCancelEvent) => {
    releaseForActive(event.active.data.current as DraggedItemData | undefined)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    const activeData = active.data.current as DraggedItemData | undefined
    const overData = over?.data.current as DropTargetData | undefined

    /*
      DROPPED ON THE MASTER PANE — pulling a line back out of a container.

      This is the gesture people reach for first, and until the pane became a drop target it
      released over nothing and was discarded in silence. It opens the split dialog rather than
      returning the cases outright: "take it out" rarely means "take ALL of it out", and a drag
      that emptied a line on release would be a destructive action fired by a slipped mouse.

      The lock is deliberately NOT released here — the dialog owns it from this point and lets it
      go when it closes, exactly as it does for a click.
    */
    if (
      overData?.type === 'masterList' &&
      activeData?.type === 'allocation' &&
      activeData.allocationId
    ) {
      openAllocationDialog({ kind: 'edit', allocationId: activeData.allocationId })
      return
    }

    if (!over || overData?.type !== 'container' || !overData.containerId) {
      releaseForActive(activeData)
      return
    }

    if (activeData?.type === 'masterItem') {
      if (
        !activeData.masterItemId ||
        activeData.shipTo !== overData.destination ||
        (activeData.supplierId &&
          overData.supplierId &&
          activeData.supplierId !== overData.supplierId)
      ) {
        releaseForActive(activeData)
        return
      }
      // Valid create-drop: leave the lock held; AllocationDialog releases on close.
      openAllocationDialog({
        kind: 'create',
        containerId: overData.containerId,
        masterItemId: activeData.masterItemId,
      })
      return
    }

    if (activeData?.type === 'allocation') {
      if (
        !activeData.allocationId ||
        !activeData.sourceContainerId ||
        activeData.shipTo !== overData.destination ||
        activeData.sourceContainerId === overData.containerId ||
        (activeData.supplierId &&
          overData.supplierId &&
          activeData.supplierId !== overData.supplierId)
      ) {
        releaseForActive(activeData)
        return
      }
      /*
        Opens the dialog with this container preselected instead of moving the whole line.

        A drop used to move EVERYTHING, silently — which made "move 500 of these 3500 across"
        impossible by drag and gave no chance to reconsider a mis-drop. The gesture now says
        WHERE and the dialog says HOW MANY, which is the same division of labour as every other
        path. The lock stays held; the dialog releases it on close.
      */
      openAllocationDialog({
        kind: 'edit',
        allocationId: activeData.allocationId,
        toContainerId: overData.containerId,
      })
      return
    }

    releaseForActive(activeData)
  }

  return (
    <DndContext
      sensors={sensors}
      /*
        THE CURSOR DECIDES, not the dragged card's rectangle.

        dnd-kit defaults to `rectIntersection`, which picks whichever droppable the DRAGGED
        ELEMENT overlaps most. That was fine while every drop target was a container card of
        roughly the same size. It stops being fine now that the master pane is a target too:
        the pane is most of the screen and a card is a few hundred pixels, so an allocation
        dragged anywhere near the divider would have the pane out-overlap the card underneath
        the cursor and steal the drop — sending a line back to the master list when the user
        was moving it one container to the left.

        `pointerWithin` asks a simpler question: what is under the pointer? That is what someone
        is aiming with, and it makes a huge target and a small one compete fairly. It requires a
        pointer-based sensor, which is the only kind configured here.
      */
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="h-screen w-screen flex flex-col bg-navy-50">
        {loadError && (
          // An empty board and a failed load look identical, and only one of them is your
          // fault. Say which.
          <div className="px-6 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700">
            Could not load planner data: {loadError}
          </div>
        )}
        {/* The account is still on the password internal read out at onboarding. Left alone, a
            temporary password becomes a permanent one — nobody remembers months later which
            accounts were handed over and never changed. Persistent rather than dismissable for
            that reason, but it never blocks the board: someone mid-shift should not be stopped
            from planning to deal with an account chore. */}
        {user.mustChangePassword && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-accent/30 bg-amber-accent/5 px-6 py-2">
            <span className="text-xs text-navy-700">
              You are still using the temporary password you were given. Set one only you know.
            </span>
            <Link
              to="/settings"
              className="rounded-lg border border-navy-200 bg-white px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest text-navy-700 transition-colors hover:bg-navy-100"
            >
              Change it
            </Link>
          </div>
        )}
        <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-navy-200">
          <img
            src={logoUrl}
            alt="Prime Time Packaging"
            className="h-11 w-auto"
          />
          <SupplierFilter />
          <div className="flex items-center gap-3">
            {canUploadCsv ? (
              <button
                type="button"
                onClick={openCsvUploadDialog}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded text-[10px] font-mono uppercase tracking-widest bg-navy-900 text-navy-50 hover:bg-navy-800 transition-colors"
              >
                <Upload className="w-3 h-3" />
                Upload CSV
              </button>
            ) : null}
            <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-navy-800 text-navy-300 border border-navy-700">
              {openPoCount} open POs
            </span>
            <span className="mx-1 hidden h-6 w-px bg-navy-200 sm:block" />
            {/* Replaces a bare role caption. Same identity, but now it is somewhere to sign out
                from — which the app had no way to do at all. */}
            <AccountMenu />
          </div>
        </header>
        <SplitPane
          left={<ContainerTray />}
          right={
            <Suspense fallback={gridLoadingFallback}>
              <OpenPoStatusReport />
            </Suspense>
          }
        />
      </div>
      <DragOverlay dropAnimation={null} style={{ width: 'auto', height: 'auto' }}>
        <DragOverlayRenderer />
      </DragOverlay>
      <AllocationDialog />
      <CommitConfirmDialog />
      <ContainerLogisticsDialog />
      <MasterCsvUploadDialog />
      <PresenceManager />
    </DndContext>
  )
}
