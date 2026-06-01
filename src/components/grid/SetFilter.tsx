import { useCallback, useState } from 'react'
import { useGridFilter, type CustomFilterProps } from 'ag-grid-react'
import type { IDoesFilterPassParams, IRowNode } from 'ag-grid-community'

/**
 * Excel-style "set filter" for AG Grid Community: a checkbox list of the
 * column's unique values rather than a contains/equals text condition. The
 * model is the array of selected values (null when everything is selected, i.e.
 * the filter is inactive). Values are recomputed each time the popup opens, so
 * they track the currently loaded (supplier-scoped) rows.
 */
export default function SetFilter({
  model,
  onModelChange,
  getValue,
  api,
}: CustomFilterProps) {
  const [values, setValues] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  const doesFilterPass = useCallback(
    (params: IDoesFilterPassParams) => {
      if (!model) return true
      const raw = getValue(params.node)
      const value = raw == null ? '' : String(raw)
      return (model as string[]).includes(value)
    },
    [model, getValue],
  )

  const afterGuiAttached = useCallback(() => {
    const set = new Set<string>()
    api.forEachNode((node: IRowNode) => {
      const raw = getValue(node)
      if (raw != null && raw !== '') set.add(String(raw))
    })
    const list = Array.from(set).sort((a, b) => a.localeCompare(b))
    setValues(list)
    setSearch('')
    setSelected(
      model
        ? new Set((model as string[]).filter((v) => list.includes(v)))
        : new Set(list),
    )
  }, [api, getValue, model])

  useGridFilter({ doesFilterPass, afterGuiAttached })

  // All values selected → the filter is inactive (model null); otherwise the
  // model is exactly the chosen subset.
  const apply = useCallback(
    (next: Set<string>, total: number) => {
      setSelected(next)
      onModelChange(next.size === total ? null : Array.from(next))
    },
    [onModelChange],
  )

  const toggle = (value: string) => {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    apply(next, values.length)
  }

  const filtered = search
    ? values.filter((v) => v.toLowerCase().includes(search.toLowerCase()))
    : values

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((v) => selected.has(v))

  const toggleAllVisible = () => {
    const next = new Set(selected)
    if (allVisibleSelected) filtered.forEach((v) => next.delete(v))
    else filtered.forEach((v) => next.add(v))
    apply(next, values.length)
  }

  return (
    <div className="w-56 p-2 bg-white text-navy-900">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search…"
        className="w-full mb-2 px-2 py-1 rounded border border-navy-200 bg-navy-50 text-sm focus:outline-none focus:border-amber-accent"
      />
      <label className="flex items-center gap-2 px-1 py-1 mb-1 text-xs font-semibold text-navy-700 border-b border-navy-100 cursor-pointer">
        <input
          type="checkbox"
          className="accent-navy-900"
          checked={allVisibleSelected}
          onChange={toggleAllVisible}
        />
        (Select all)
      </label>
      <ul className="max-h-56 overflow-auto space-y-0.5">
        {filtered.map((v) => (
          <li key={v}>
            <label className="flex items-center gap-2 px-1 py-1 text-sm rounded cursor-pointer hover:bg-navy-50">
              <input
                type="checkbox"
                className="accent-navy-900"
                checked={selected.has(v)}
                onChange={() => toggle(v)}
              />
              <span className="truncate">{v}</span>
            </label>
          </li>
        ))}
        {filtered.length === 0 ? (
          <li className="px-1 py-2 text-xs text-navy-400">No values</li>
        ) : null}
      </ul>
    </div>
  )
}
