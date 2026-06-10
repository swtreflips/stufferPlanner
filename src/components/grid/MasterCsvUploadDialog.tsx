import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Upload, X } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { usePlannerStore } from '../../store/plannerStore'
import {
  parseCsvUpload,
  type CsvUploadResult,
  type MatchedRow,
} from '../../utils/csvUploadParser'
import { formatDate } from '../../utils/dateHelpers'

type Phase = 'pick' | 'preview' | 'success'

export default function MasterCsvUploadDialog() {
  const open = usePlannerStore((s) => s.csvUploadDialog.open)
  const closeCsvUploadDialog = usePlannerStore((s) => s.closeCsvUploadDialog)
  const masterItems = usePlannerStore((s) => s.masterItems)
  const updateMasterCargoReady = usePlannerStore((s) => s.updateMasterCargoReady)
  const updateMasterCbmPerCase = usePlannerStore((s) => s.updateMasterCbmPerCase)
  const { user } = useAuth()

  const [phase, setPhase] = useState<Phase>('pick')
  const [fileName, setFileName] = useState<string>('')
  const [result, setResult] = useState<CsvUploadResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [successCount, setSuccessCount] = useState(0)

  useEffect(() => {
    if (!open) {
      setPhase('pick')
      setFileName('')
      setResult(null)
      setSubmitting(false)
      setSuccessCount(0)
    }
  }, [open])

  const scopeSupplierId = useMemo(
    () => (user.role === 'factory' ? user.supplierId : null),
    [user],
  )

  const onOpenChange = (next: boolean) => {
    if (!next) closeCsvUploadDialog()
  }

  const handleFile = useCallback(
    async (file: File) => {
      const text = await file.text()
      const parsed = parseCsvUpload({
        csvText: text,
        masterItems,
        scopeSupplierId,
      })
      setFileName(file.name)
      setResult(parsed)
      setPhase('preview')
    },
    [masterItems, scopeSupplierId],
  )

  const handlePickInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) void handleFile(file)
  }

  const handleConfirm = async () => {
    if (!result?.matched.length) return
    setSubmitting(true)
    try {
      for (const row of result.matched) {
        if (row.newCargoReady) {
          await updateMasterCargoReady(row.masterItemId, row.newCargoReady)
        }
        if (row.newCbmPerCase !== null) {
          await updateMasterCbmPerCase(row.masterItemId, row.newCbmPerCase)
        }
      }
      setSuccessCount(result.matched.length)
      setPhase('success')
      setTimeout(() => closeCsvUploadDialog(), 1500)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-navy-950/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl max-h-[90vh] overflow-auto -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-xl border border-navy-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-navy-200">
            <Dialog.Title className="flex items-center gap-2 text-base font-semibold text-navy-900">
              <Upload className="w-4 h-4 text-teal-accent" />
              Upload factory CSV
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="text-navy-400 hover:text-navy-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>

          <Dialog.Description className="px-5 pt-3 text-xs text-navy-500">
            Updates <span className="font-semibold">Cargo Ready</span> and{' '}
            <span className="font-semibold">CBM per Case</span> for the rows in
            the file. Rows are matched by <code>Document Number</code> +{' '}
            <code>Item</code>. Empty cells are left untouched.
          </Dialog.Description>

          {phase === 'pick' ? (
            <PickPhase
              onPick={handlePickInput}
              onDrop={handleDrop}
              fatalError={null}
            />
          ) : null}

          {phase === 'preview' && result ? (
            <PreviewPhase
              fileName={fileName}
              result={result}
              submitting={submitting}
              onConfirm={handleConfirm}
              onCancel={closeCsvUploadDialog}
              onReplace={() => setPhase('pick')}
            />
          ) : null}

          {phase === 'success' ? (
            <div className="px-5 py-8 text-center">
              <div className="text-sm font-semibold text-teal-accent">
                Updated {successCount} {successCount === 1 ? 'row' : 'rows'} from{' '}
                {fileName}.
              </div>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PickPhase({
  onPick,
  onDrop,
  fatalError,
}: {
  onPick: (e: ChangeEvent<HTMLInputElement>) => void
  onDrop: (e: DragEvent<HTMLDivElement>) => void
  fatalError: string | null
}) {
  return (
    <div className="p-5 space-y-3">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="relative border-2 border-dashed border-navy-200 rounded-xl p-8 text-center bg-navy-50/60 hover:border-amber-accent transition-colors"
      >
        <Upload className="w-6 h-6 mx-auto text-navy-400" />
        <div className="mt-2 text-sm text-navy-700">
          Drop a CSV file here, or click to choose one.
        </div>
        <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-navy-400">
          Required columns: Document Number, Item, and Cargo Ready and/or CBM per Case
        </div>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={onPick}
          className="absolute inset-0 opacity-0 cursor-pointer"
          aria-label="Choose CSV file"
        />
      </div>
      {fatalError ? (
        <div className="text-xs text-coral-accent">{fatalError}</div>
      ) : null}
    </div>
  )
}

function PreviewPhase({
  fileName,
  result,
  submitting,
  onConfirm,
  onCancel,
  onReplace,
}: {
  fileName: string
  result: CsvUploadResult
  submitting: boolean
  onConfirm: () => void
  onCancel: () => void
  onReplace: () => void
}) {
  if (result.fatalError) {
    return (
      <div className="p-5 space-y-3">
        <div className="text-xs text-coral-accent">{result.fatalError}</div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onReplace}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-navy-600 hover:bg-navy-100 transition-colors"
          >
            Choose a different file
          </button>
        </div>
      </div>
    )
  }

  const canConfirm = !submitting && result.matched.length > 0

  return (
    <div className="px-5 py-4 space-y-3">
      <div className="text-[11px] font-mono uppercase tracking-widest text-navy-500">
        {fileName}
      </div>

      <div className="flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-widest">
        <Stat label={`${result.matched.length} matched`} tone="teal" />
        {result.unmatched.length > 0 ? (
          <Stat label={`${result.unmatched.length} not found`} tone="coral" />
        ) : null}
        {result.skippedOtherSupplier > 0 ? (
          <Stat
            label={`${result.skippedOtherSupplier} skipped (other supplier)`}
            tone="navy"
          />
        ) : null}
        {result.skippedNoChange > 0 ? (
          <Stat label={`${result.skippedNoChange} unchanged`} tone="navy" />
        ) : null}
      </div>

      {result.matched.length > 0 ? (
        <div className="border border-navy-200 rounded-lg max-h-80 overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-navy-50 sticky top-0">
              <tr className="text-left text-[10px] font-mono uppercase tracking-widest text-navy-500">
                <th className="px-3 py-2 font-semibold">Document</th>
                <th className="px-3 py-2 font-semibold">Item</th>
                <th className="px-3 py-2 font-semibold">Cargo Ready</th>
                <th className="px-3 py-2 font-semibold">CBM / case</th>
              </tr>
            </thead>
            <tbody>
              {result.matched.map((row) => (
                <PreviewRow key={row.masterItemId} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-xs italic text-navy-400">
          Nothing to apply from this file.
        </div>
      )}

      {result.unmatched.length > 0 ? (
        <details className="text-xs text-navy-500">
          <summary className="cursor-pointer">
            Show {result.unmatched.length} not-found / invalid rows
          </summary>
          <ul className="mt-2 space-y-0.5">
            {result.unmatched.map((u, i) => (
              <li key={i} className="font-mono text-[11px]">
                {u.documentNumber} · {u.sku} — {u.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="flex justify-end gap-2 pt-2 border-t border-navy-100">
        <button
          type="button"
          onClick={onReplace}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-navy-600 hover:bg-navy-100 transition-colors"
        >
          Replace file
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-navy-600 hover:bg-navy-100 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canConfirm}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-teal-accent text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Apply {result.matched.length} {result.matched.length === 1 ? 'row' : 'rows'}
        </button>
      </div>
    </div>
  )
}

function PreviewRow({ row }: { row: MatchedRow }) {
  return (
    <tr className="border-t border-navy-100 even:bg-navy-50/40">
      <td className="px-3 py-2 font-mono">{row.documentNumber}</td>
      <td className="px-3 py-2 font-mono">{row.sku}</td>
      <td className="px-3 py-2">
        {row.newCargoReady ? (
          <DiffPair
            current={row.currentCargoReady ? formatDate(row.currentCargoReady) : '—'}
            next={formatDate(row.newCargoReady)}
          />
        ) : (
          <span className="text-navy-300">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        {row.newCbmPerCase !== null ? (
          <DiffPair
            current={row.currentCbmPerCase?.toFixed(4) ?? '—'}
            next={row.newCbmPerCase.toFixed(4)}
          />
        ) : (
          <span className="text-navy-300">—</span>
        )}
      </td>
    </tr>
  )
}

function DiffPair({ current, next }: { current: string; next: string }) {
  return (
    <span className="font-mono">
      <span className="text-navy-400 line-through">{current}</span>
      <span className="mx-1 text-navy-400">→</span>
      <span className="text-navy-900 font-semibold">{next}</span>
    </span>
  )
}

function Stat({
  label,
  tone,
}: {
  label: string
  tone: 'teal' | 'coral' | 'navy'
}) {
  const cls =
    tone === 'teal'
      ? 'bg-teal-accent/10 text-teal-accent border-teal-accent/30'
      : tone === 'coral'
        ? 'bg-coral-accent/10 text-coral-accent border-coral-accent/30'
        : 'bg-navy-100 text-navy-600 border-navy-200'
  return (
    <span className={`px-2 py-0.5 rounded border ${cls}`}>{label}</span>
  )
}
