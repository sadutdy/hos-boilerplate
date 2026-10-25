import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input, Label } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import { StatusBadge } from './shared'
import type { CommsLog, CommsLogsResponse } from '@/types'

const LIMIT = 50
const KEY_LABELS: Record<CommsLog['key'], string> = {
  broadcast: 'Broadcast',
  appointment: 'Appointment reminder',
  payment: 'Payment reminder',
  otp: 'Login code',
}

interface Filters { status: string; type: string; key: string; from: string; to: string; q: string }
const EMPTY: Filters = { status: '', type: '', key: '', from: '', to: '', q: '' }

export function LogTab({ canDelete }: { canDelete: boolean }) {
  const [filters, setFilters] = useState<Filters>(EMPTY)
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState<CommsLogsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)
  const [deleting, setDeleting] = useState<CommsLog | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    const qs = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) })
    for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v)
    const t = setTimeout(() => {
      setLoading(true)
      api.get<CommsLogsResponse>(`/comms-logs?${qs}`).then(
        (d) => { if (!cancelled) { setData(d); setError(null); setLoading(false) } },
        (e) => { if (!cancelled) { setError(e instanceof Error ? e.message : 'Could not load the log.'); setLoading(false) } },
      )
    }, filters.q ? 250 : 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [filters, offset, nonce])

  const set = (k: keyof Filters) => (v: string) => {
    setFilters((f) => ({ ...f, [k]: v }))
    setOffset(0)
  }

  async function onDelete() {
    if (!deleting) return
    setBusy(true)
    try {
      await api.delete(`/comms-logs/${deleting._id}`)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete. Try again.')
    } finally {
      setBusy(false)
      setDeleting(null)
    }
  }

  const filtered = Object.values(filters).some(Boolean)
  const counts = data?.counts ?? {}

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="log-q">Number</Label>
          <Input id="log-q" inputMode="tel" placeholder="Search digits" value={filters.q} onChange={(e) => set('q')(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="log-status">Status</Label>
          <NativeSelect id="log-status" value={filters.status} onChange={(e) => set('status')(e.target.value)}>
            <option value="">Any</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="queued">Queued</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="log-key">Kind</Label>
          <NativeSelect id="log-key" value={filters.key} onChange={(e) => set('key')(e.target.value)}>
            <option value="">Any</option>
            {Object.entries(KEY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="log-type">Channel</Label>
          <NativeSelect id="log-type" value={filters.type} onChange={(e) => set('type')(e.target.value)}>
            <option value="">Any</option>
            <option value="sms">SMS</option>
            <option value="voice">Voice</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="log-from">From</Label>
          <Input id="log-from" type="date" value={filters.from} onChange={(e) => set('from')(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="log-to">To</Label>
          <Input id="log-to" type="date" value={filters.to} onChange={(e) => set('to')(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <p aria-live="polite">
          {data ? `${data.total} message${data.total === 1 ? '' : 's'}` : 'Loading…'}
          {data && data.total > 0 && ` · ${counts.sent ?? 0} sent · ${counts.failed ?? 0} failed${counts.queued ? ` · ${counts.queued} queued` : ''}`}
        </p>
        {filtered && <Button variant="ghost" size="sm" onClick={() => { setFilters(EMPTY); setOffset(0) }}>Clear filters</Button>}
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {data && data.items.length === 0 && !error && (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm">
          <p className="font-medium">{filtered ? 'No messages match these filters.' : 'Nothing has been sent yet.'}</p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className={`overflow-x-auto rounded-lg border border-border bg-card ${loading ? 'opacity-60' : ''}`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">When</th>
                <th scope="col" className="px-4 py-2.5 font-medium">To</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Kind</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium lg:table-cell">Message</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                {canDelete && <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {data.items.map((l) => (
                <tr key={l._id} className="border-b border-border/60 align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTime(l.createdAt)}</td>
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs">{l.recipient}</p>
                    {l.patientName && l.recipientPatientId && (
                      <Link to={`/patients/${l.recipientPatientId}`} className="text-xs text-muted-foreground hover:underline">{l.patientName}</Link>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    {KEY_LABELS[l.key]}
                    <span className="block text-xs text-muted-foreground">{l.type.toUpperCase()} · {l.provider}</span>
                  </td>
                  <td className="hidden max-w-sm px-4 py-3 text-muted-foreground lg:table-cell">
                    <span className="line-clamp-2" title={l.message}>{l.message}</span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={l.status} />
                    {l.error && <p className="mt-1 max-w-48 text-xs text-destructive">{l.error}</p>}
                  </td>
                  {canDelete && (
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => setDeleting(l)}>
                        Delete
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > LIMIT && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground tabular-nums">
            {offset + 1}–{Math.min(offset + LIMIT, data.total)} of {data.total}
          </span>
          <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>Previous</Button>
          <Button variant="outline" size="sm" disabled={offset + LIMIT >= data.total} onClick={() => setOffset(offset + LIMIT)}>Next</Button>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete log entry?"
        message={`The record of the message to ${deleting?.recipient} will be removed. The message itself was already sent.`}
        busy={busy}
        onConfirm={onDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
