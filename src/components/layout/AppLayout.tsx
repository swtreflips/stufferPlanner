import { lazy, Suspense } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
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
  const moveAllocation = usePlannerStore((s) => s.moveAllocation)
  const acquireLock = usePlannerStore((s) => s.acquireLock)
  const releaseLock = usePlannerStore((s) => s.releaseLock)

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
      void moveAllocation(activeData.allocationId, overData.containerId)
      releaseForActive(activeData)
      return
    }

    releaseForActive(activeData)
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="h-screen w-screen flex flex-col bg-navy-50">
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
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-mono uppercase tracking-widest text-navy-400">
                {user.role}
                {user.supplierName ? ` · ${user.supplierName}` : ''}
              </span>
            </div>
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
