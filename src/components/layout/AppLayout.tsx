import SplitPane from './SplitPane'
import { useAuth } from '../../auth/AuthProvider'

const containerPanelPlaceholder = (
  <div className="flex flex-col items-center justify-center h-full gap-3 text-navy-400">
    <div className="w-16 h-16 rounded-xl border-2 border-dashed border-navy-300 flex items-center justify-center">
      <span className="text-2xl font-mono font-bold text-navy-300">+</span>
    </div>
    <div className="text-center">
      <div className="text-sm font-semibold tracking-wide uppercase text-navy-500">
        Container Tray
      </div>
      <div className="text-xs mt-1 text-navy-400">
        Containers will appear here
      </div>
    </div>
  </div>
)

const gridPanelPlaceholder = (
  <div className="flex flex-col items-center justify-center h-full gap-3 text-navy-400">
    <div className="grid grid-cols-3 gap-1">
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="w-4 h-3 rounded-sm bg-navy-200" />
      ))}
    </div>
    <div className="text-center">
      <div className="text-sm font-semibold tracking-wide uppercase text-navy-500">
        Shipment Grid
      </div>
      <div className="text-xs mt-1 text-navy-400">
        Data grid will appear here
      </div>
    </div>
  </div>
)

export default function AppLayout() {
  const { role } = useAuth()

  return (
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
        <span className="text-xs font-mono uppercase tracking-widest text-navy-300">
          {role}
        </span>
      </header>
      <SplitPane
        left={containerPanelPlaceholder}
        right={gridPanelPlaceholder}
      />
    </div>
  )
}
