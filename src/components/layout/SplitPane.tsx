import { type ReactNode } from 'react'

interface SplitPaneProps {
  left: ReactNode
  right: ReactNode
}

export default function SplitPane({ left, right }: SplitPaneProps) {
  return (
    <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
      <div className="w-full md:w-1/2 border-r border-navy-200 bg-white overflow-auto">
        {left}
      </div>
      <div className="w-full md:w-1/2 bg-navy-50 overflow-auto">
        {right}
      </div>
    </div>
  )
}
