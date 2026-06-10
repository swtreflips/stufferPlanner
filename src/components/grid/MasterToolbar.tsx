import { Upload } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { usePlannerStore } from '../../store/plannerStore'

// Slim toolbar above the master grid. Admin + factory get the Upload CSV
// affordance; internal does not (read-only on master data).
export default function MasterToolbar() {
  const { user } = useAuth()
  const openCsvUploadDialog = usePlannerStore((s) => s.openCsvUploadDialog)

  const canUpload = user.role === 'admin' || user.role === 'factory'
  if (!canUpload) return null

  return (
    <div className="flex items-center justify-end h-10 px-4 bg-navy-50 border-b border-navy-200">
      <button
        type="button"
        onClick={openCsvUploadDialog}
        className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold bg-navy-900 text-navy-50 hover:bg-navy-800 transition-colors"
      >
        <Upload className="w-3.5 h-3.5" />
        Upload CSV
      </button>
    </div>
  )
}
