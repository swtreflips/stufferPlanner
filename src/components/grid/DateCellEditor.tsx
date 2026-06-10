import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import type { CustomCellEditorProps } from 'ag-grid-react'

// Custom AG Grid cell editor backed by the native <input type="date">.
// Reads/writes ISO strings (yyyy-mm-dd...); MasterItem.cargoReady is ISO.
// AG Grid passes value/onValueChange via CustomCellEditorProps; we surface a
// getValue() ref method as required by the editor lifecycle and commit on
// blur/Enter via stopEditing — handled by the grid container.
const DateCellEditor = forwardRef(function DateCellEditor(
  props: CustomCellEditorProps<unknown, string | null>,
  ref,
) {
  const initial = isoToInputDate(props.value)
  const [value, setValue] = useState<string>(initial)
  const inputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    getValue: () => (value ? inputDateToIso(value) : null),
  }))

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <input
      ref={inputRef}
      type="date"
      value={value}
      onChange={(e) => {
        setValue(e.target.value)
        props.onValueChange(e.target.value ? inputDateToIso(e.target.value) : null)
      }}
      className="w-full h-full px-2 text-sm text-navy-900 bg-white border border-amber-accent focus:outline-none"
    />
  )
})

export default DateCellEditor

function isoToInputDate(iso: string | null | undefined): string {
  if (!iso) return ''
  // Trim ISO timestamp to yyyy-mm-dd; UTC so display matches grid formatter
  // (which also formats with timeZone: 'UTC').
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function inputDateToIso(input: string): string {
  // input is yyyy-mm-dd; anchor at UTC midnight so downstream UTC formatters
  // render the same day.
  return new Date(`${input}T00:00:00.000Z`).toISOString()
}
