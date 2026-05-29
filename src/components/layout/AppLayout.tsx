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
import { masterLockId } from '../../types/lock'
import { useAuth } from '../../auth/AuthProvider'
import { usePlannerStore } from '../../store/plannerStore'
import ContainerTray from '../containers/ContainerTray'
import DragOverlayRenderer from '../drag/DragOverlayRenderer'
import AllocationDialog from '../containers/AllocationDialog'
import CommitConfirmDialog from '../containers/CommitConfirmDialog'
import ContainerLogisticsDialog from '../containers/ContainerLogisticsDialog'
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
  const moveAllocation = usePlannerStore((s) => s.moveAllocation)
  const acquireLock = usePlannerStore((s) => s.acquireLock)
  const releaseLock = usePlannerStore((s) => s.releaseLock)

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
        <header className="flex items-center justify-between px-6 py-3 bg-navy-900 border-b border-navy-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-accent flex items-center justify-center">
              <span className="text-navy-950 font-mono font-bold text-sm">SP</span>
            </div>
            <h1 className="text-lg font-semibold text-navy-100 tracking-tight">
              Stuffer Planner
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-navy-800 text-navy-300 border border-navy-700">
              {openPoCount} open POs
            </span>
            <div className="flex flex-col items-end">
              <span className="text-xs font-semibold text-navy-100">
                {user.displayName}
              </span>
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
      <PresenceManager />
    </DndContext>
  )
}
