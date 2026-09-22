'use client'

import { useState } from 'react'

import { setReportStatus, type Report } from '@/lib/admin-actions'

/**
 * What players told us is wrong.
 *
 * Open reports first, newest within that, because this is a queue rather than
 * a history. An unsafe-location report is the one thing in the whole operator
 * portal that can be urgent, so it is visually loud and sorted to the top.
 */
const KIND_LABEL: Record<Report['kind'], string> = {
  unsafe_location: 'Unsafe spot',
  venue_problem: 'Shop problem',
  wrong_place: 'Wrong pin',
  other: 'Other',
}

export default function ReportQueue({ initial }: { initial: Report[] }) {
  const [reports, setReports] = useState(initial)

  const open = reports.filter((r) => r.report_state === 'open')
  const unsafe = open.filter((r) => r.kind === 'unsafe_location')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Reports</h1>
        <p className="mt-0.5 text-sm text-muted">
          {open.length} open
          {unsafe.length > 0 && (
            <span className="font-semibold text-danger-ink">
              {' '}
              · {unsafe.length} flagged as an unsafe location
            </span>
          )}
        </p>
      </div>

      <ul className="space-y-3">
        {reports.map((report) => (
          <ReportCard
            key={report.id}
            report={report}
            onChanged={(updated) =>
              setReports((prev) =>
                prev.map((r) => (r.id === updated.id ? updated : r)),
              )
            }
          />
        ))}
        {reports.length === 0 && (
          <li className="rounded-xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">
            Nothing reported yet.
          </li>
        )}
      </ul>
    </div>
  )
}

function ReportCard({
  report,
  onChanged,
}: {
  report: Report
  onChanged: (r: Report) => void
}) {
  const [notes, setNotes] = useState(report.admin_notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isOpen = report.report_state === 'open'
  const urgent = isOpen && report.kind === 'unsafe_location'

  async function resolve(status: Report['report_state']) {
    setBusy(true)
    setError(null)
    try {
      await setReportStatus(report.id, status, notes || undefined)
      onChanged({ ...report, report_state: status, admin_notes: notes || null })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li
      className={`rounded-xl border bg-surface p-4 ${
        urgent ? 'border-danger-ink' : 'border-line'
      } ${isOpen ? '' : 'opacity-60'}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            urgent ? 'bg-danger text-danger-ink' : 'bg-canvas text-muted'
          }`}
        >
          {KIND_LABEL[report.kind]}
        </span>
        {!isOpen && (
          <span className="rounded-full bg-canvas px-2.5 py-1 text-[11px] font-semibold capitalize text-muted">
            {report.report_state}
          </span>
        )}
        <span className="text-xs text-faint">{formatDate(report.created_at)}</span>
        <span className="text-xs text-muted">{report.reporter_email}</span>
        {report.reporter_status !== 'active' && (
          <span className="rounded-full bg-warn px-2 py-0.5 text-[10px] font-semibold uppercase text-warn-ink">
            {report.reporter_status}
          </span>
        )}
      </div>

      {report.note && (
        <p className="mt-3 text-sm leading-relaxed text-ink">
          &ldquo;{report.note}&rdquo;
        </p>
      )}

      <p className="mt-2 text-xs text-muted">
        {report.venue_name ?? 'No venue'}
        {report.drop_title && ` · ${report.drop_title}`}
        {report.distance_m != null &&
          ` · reported ${Math.round(Number(report.distance_m))} m from the drop`}
        {report.lat != null && report.lng != null && (
          <>
            {' · '}
            <a
              href={`https://www.google.com/maps?q=${report.lat},${report.lng}`}
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-ink"
            >
              where they stood
            </a>
          </>
        )}
      </p>

      {isOpen && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What did you do about it?"
            className="min-w-56 flex-1 rounded-lg border border-line-strong bg-canvas px-3 py-1.5 text-sm"
          />
          <button
            onClick={() => resolve('actioned')}
            disabled={busy}
            className="rounded-lg bg-live px-3 py-1.5 text-xs font-semibold text-live-ink disabled:opacity-40"
          >
            Fixed
          </button>
          <button
            onClick={() => resolve('reviewed')}
            disabled={busy}
            className="rounded-lg bg-canvas px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-40"
          >
            Reviewed
          </button>
          <button
            onClick={() => resolve('dismissed')}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink disabled:opacity-40"
          >
            Dismiss
          </button>
        </div>
      )}

      {!isOpen && report.admin_notes && (
        <p className="mt-2 text-xs text-muted">Note: {report.admin_notes}</p>
      )}

      {error && <p className="mt-2 text-xs text-danger-ink">{error}</p>}
    </li>
  )
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    timeZone: 'Asia/Tbilisi',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
