import { type ReactNode } from 'react'

interface SplitPaneProps {
  left: ReactNode
  right: ReactNode
}

/*
  Containers left, open PO lines right, 40/60.

  It began at 50/50 as a placeholder while both halves were being built, and the split that fits
  the work is uneven — the right pane is a wide table and every column it cannot show becomes a
  horizontal scroll during the one task this screen exists for.

  But only so far. At 30/70 the grid gained a column and the container cards lost their line
  items: 208px of the left pane is a fixed info column, so the four line columns were sharing
  around 200px and document number, item and cargo-ready all truncated to three characters. The
  cards still said what was IN a container; they stopped saying which lines. 40/60 keeps most of
  the grid's gain while leaving those readable.

  Percentages rather than a draggable divider, deliberately. A drag handle is a preference to
  set, remember and get wrong, and nobody opens this screen wanting to arrange panes. Below
  `md` they stack and the ratio does not apply at all.
*/
export default function SplitPane({ left, right }: SplitPaneProps) {
  return (
    <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
      <div className="w-full md:w-[40%] border-r border-navy-200 bg-white overflow-hidden">
        {left}
      </div>
      <div className="w-full md:w-[60%] bg-navy-50 overflow-hidden">
        {right}
      </div>
    </div>
  )
}
