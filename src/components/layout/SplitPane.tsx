import { type ReactNode } from 'react'

interface SplitPaneProps {
  left: ReactNode
  right: ReactNode
}

/*
  Containers left, open PO lines right, 30/70.

  It began at 50/50 as a placeholder while the two halves were being built. The split that
  actually fits the work is uneven: the right pane is a wide table — supplier, destination,
  document number, item, three quantities, two CBM figures and a date — and every column it
  cannot show becomes a horizontal scroll during the one task this screen exists for. The left
  pane is a stack of cards with a fixed set of fields, and it stops getting more useful past the
  width it needs to render them.

  Percentages rather than a draggable divider, deliberately. A drag handle is a preference to
  set, remember and get wrong, and nobody opens this screen wanting to arrange panes. Below
  `md` they stack and the ratio does not apply at all.
*/
export default function SplitPane({ left, right }: SplitPaneProps) {
  return (
    <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
      <div className="w-full md:w-[30%] border-r border-navy-200 bg-white overflow-hidden">
        {left}
      </div>
      <div className="w-full md:w-[70%] bg-navy-50 overflow-hidden">
        {right}
      </div>
    </div>
  )
}
