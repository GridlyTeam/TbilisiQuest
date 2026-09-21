'use client'

import { useState, useTransition } from 'react'

import {
  searchPlayers,
  loadPlayerActivity,
  setPlayerStatus,
  type Player,
  type PlayerActivity,
} from '@/lib/admin-actions'

export default function PlayerManager({ initial }: { initial: Player[] }) {
  const [players, setPlayers] = useState(initial)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function search(next: string) {
    setQuery(next)
    startTransition(async () => {
      setPlayers(await searchPlayers(next))
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Players</h1>
        <p className="mt-0.5 text-sm text-muted">
          {players.length} shown ·{' '}
          {players.filter((p) => p.status !== 'active').length} restricted
        </p>
      </div>

      <input
        value={query}
        onChange={(e) => search(e.target.value)}
        placeholder="Search by email or name…"
        className="w-full max-w-md rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-indigo"
      />

      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {players.map((player) => (
          <PlayerRow
            key={player.user_id}
            player={player}
            expanded={expanded === player.user_id}
            onToggle={() =>
              setExpanded(expanded === player.user_id ? null : player.user_id)
            }
            onChanged={(updated) =>
              setPlayers((prev) =>
                prev.map((p) => (p.user_id === updated.user_id ? updated : p)),
              )
            }
          />
        ))}
        {players.length === 0 && (
          <li className="p-8 text-center text-sm text-muted">
            {pending ? 'Searching…' : 'No players match.'}
          </li>
        )}
      </ul>
    </div>
  )
}

function PlayerRow({
  player,
  expanded,
  onToggle,
  onChanged,
}: {
  player: Player
  expanded: boolean
  onToggle: () => void
  onChanged: (p: Player) => void
}) {
  const [activity, setActivity] = useState<PlayerActivity[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  async function toggle() {
    onToggle()
    if (!expanded && activity === null) {
      setActivity(await loadPlayerActivity(player.user_id))
    }
  }

  async function moderate(status: 'active' | 'suspended' | 'banned') {
    setBusy(true)
    setError(null)
    try {
      await setPlayerStatus(player.user_id, status, reason || undefined)
      onChanged({ ...player, status, status_reason: reason || null })
      setReason('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li>
      <div className="flex flex-wrap items-center gap-3 p-4">
        <StatusBadge status={player.status} />

        <button onClick={toggle} className="min-w-0 flex-1 text-left">
          <div className="truncate text-sm font-medium text-ink">
            {player.email}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            Level {player.level} · {player.total_xp} XP · {player.redeemed}{' '}
            redeemed of {player.claimed} claimed
            {player.streak_days > 0 && ` · ${player.streak_days} day streak`}
          </p>
        </button>

        <div className="flex gap-2">
          {player.status === 'active' ? (
            <>
              <button
                onClick={() => moderate('suspended')}
                disabled={busy}
                className="rounded-lg bg-warn px-3 py-1.5 text-xs font-semibold text-warn-ink disabled:opacity-40"
              >
                Suspend
              </button>
              <button
                onClick={() => moderate('banned')}
                disabled={busy}
                className="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-danger-ink disabled:opacity-40"
              >
                Ban
              </button>
            </>
          ) : (
            <button
              onClick={() => moderate('active')}
              disabled={busy}
              className="rounded-lg bg-live px-3 py-1.5 text-xs font-semibold text-live-ink disabled:opacity-40"
            >
              Reinstate
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-line bg-canvas p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Joined" value={formatDate(player.created_at)} />
            <Stat label="Last seen" value={formatDate(player.last_seen_at)} />
            <Stat label="Last redeem" value={formatDate(player.last_activity)} />
            <Stat label="Locale" value={player.locale} />
          </div>

          {player.status !== 'active' && player.status_reason && (
            <p className="rounded-lg bg-warn px-3 py-2 text-xs text-warn-ink">
              Reason on file: {player.status_reason}
            </p>
          )}

          <label className="block space-y-1">
            <span className="block text-xs text-muted">
              Reason (recorded with the next status change)
            </span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Repeated GPS spoofing"
              className="w-full max-w-md rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm"
            />
          </label>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">
              Recent activity
            </h3>
            {activity === null ? (
              <p className="text-xs text-muted">Loading…</p>
            ) : activity.length === 0 ? (
              <p className="text-xs text-muted">Nothing yet.</p>
            ) : (
              <ul className="space-y-1">
                {activity.map((row, i) => (
                  <li key={i} className="flex gap-2 text-xs">
                    <span className="w-32 shrink-0 tabular-nums text-faint">
                      {formatDate(row.occurred_at)}
                    </span>
                    <span
                      className={
                        row.kind === 'redeemed'
                          ? 'w-20 shrink-0 font-semibold text-live-ink'
                          : 'w-20 shrink-0 text-muted'
                      }
                    >
                      {row.kind}
                    </span>
                    <span className="text-ink">
                      {row.detail}
                      {row.venue_name && (
                        <span className="text-muted"> · {row.venue_name}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <p className="text-xs text-danger-ink">{error}</p>}
        </div>
      )}
    </li>
  )
}

function StatusBadge({ status }: { status: Player['status'] }) {
  const map = {
    active: { cls: 'bg-live text-live-ink', label: 'Active' },
    suspended: { cls: 'bg-warn text-warn-ink', label: 'Suspended' },
    banned: { cls: 'bg-danger text-danger-ink', label: 'Banned' },
  }[status]

  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${map.cls}`}>
      {map.label}
    </span>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-faint">{label}</p>
      <p className="text-xs text-ink">{value}</p>
    </div>
  )
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
