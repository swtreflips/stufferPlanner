import { lazy, Suspense } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import SplitPane from './SplitPane'
import { useAuth } from '../../auth/AuthProvider'
import { usePlannerStore } from '../../store/plannerStore'
import ContainerTray from '../containers/ContainerTray'
import DragOverlayRenderer from '../drag/DragOverlayRenderer'
import AllocationDialog from '../containers/AllocationDialog'
import CommitConfirmDialog from '../containers/CommitConfirmDialog'

const OpenPoStatusReport = lazy(() => import('../grid/OpenPoStatusReport'))

const gridLoadingFallback = (
  <div className="flex items-center justify-center h-full text-navy-400 text-xs font-mono uppercase tracking-widest">
    Loading grid...
  </div>
)

export default function AppLayout() {
  const { role } = useAuth()
  const openPoCount = usePlannerStore((s) => s.masterItems.length)
  const openAllocationDialog = usePlannerStore((s) => s.openAllocationDialog)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return
    const activeData = active.data.current as
      | { type?: string; masterItemId?: string; shipTo?: string }
      | undefined
    const overData = over.data.current as
      | { type?: string; containerId?: string; destination?: string }
      | undefined
    if (activeData?.type !== 'masterItem' || overData?.type !== 'container') return
    if (
      !activeData.masterItemId ||
      !overData.containerId ||
      activeData.shipTo !== overData.destination
    ) {
      return
    }
    openAllocationDialog({
      kind: 'create',
      containerId: overData.containerId,
      masterItemId: activeData.masterItemId,
    })
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
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
            <span className="text-xs font-mono uppercase tracking-widest text-navy-300">
              {role}
            </span>
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
      <DragOverlay>
        <DragOverlayRenderer />
      </DragOverlay>
      <AllocationDialog />
      <CommitConfirmDialog />
    </DndContext>
  )
}
