import { loadReports } from '@/lib/admin-actions'
import ReportQueue from '@/components/admin/ReportQueue'

export const dynamic = 'force-dynamic'

export default async function AdminReportsPage() {
  const reports = await loadReports()
  return <ReportQueue initial={reports} />
}
