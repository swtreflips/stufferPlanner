import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { usePlannerStore } from '../../store/plannerStore'
import ContainerCard from './ContainerCard'
import AddContainerDialog from './AddContainerDialog'

export default function ContainerTray() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const containers = usePlannerStore((s) => s.containers)
  const scenarios = usePlannerStore((s) => s.scenarios)
  const currentScenarioId = usePlannerStore((s) => s.currentScenarioId)

  const currentScenario = useMemo(
    () => scenarios.find((s) => s.id === currentScenarioId) ?? null,
    [scenarios, currentScenarioId],
  )

  const scenarioContainers = useMemo(
    () =>
      containers
        .filter((c) => c.scenarioId === currentScenarioId)
        .sort((a, b) => a.displayOrder - b.displayOrder),
    [containers, currentScenarioId],
  )

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b border-navy-200 bg-white">
        <div className="text-[10px] font-mono uppercase tracking-widest text-navy-400">
          Scenario
        </div>
        <div className="text-lg font-semibold text-navy-900">
          {currentScenario?.name ?? 'Loading…'}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-3">
        {scenarioContainers.length === 0 ? (
          <EmptyState />
        ) : (
          scenarioContainers.map((c) => <ContainerCard key={c.id} container={c} />)
        )}
      </div>

      <div className="border-t border-navy-200 px-4 py-3 bg-white">
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          disabled={!currentScenarioId}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-navy-300 hover:border-amber-accent text-navy-500 hover:text-amber-accent text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          Add container
        </button>
      </div>

      <AddContainerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultName={`Container ${scenarioContainers.length + 1}`}
      />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-navy-400 pt-12">
      <div className="w-16 h-16 rounded-xl border-2 border-dashed border-navy-300 flex items-center justify-center">
        <span className="text-2xl font-mono font-bold text-navy-300">+</span>
      </div>
      <div className="text-center max-w-xs">
        <div className="text-sm font-semibold tracking-wide uppercase text-navy-500">
          No containers yet
        </div>
        <div className="text-xs mt-1 text-navy-400">
          Click <span className="font-mono">Add container</span> to start building an OFQ.
        </div>
      </div>
    </div>
  )
}
