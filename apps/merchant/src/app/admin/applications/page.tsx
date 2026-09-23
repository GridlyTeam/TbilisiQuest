import { loadApplications } from '@/lib/apply-actions'
import ApplicationQueue from '@/components/admin/ApplicationQueue'

export const dynamic = 'force-dynamic'

export default async function AdminApplicationsPage() {
  const applications = await loadApplications()
  return <ApplicationQueue initial={applications} />
}
