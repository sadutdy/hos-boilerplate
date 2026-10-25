import { useCallback, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { can, useAuth } from '@/auth/auth-context'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { useList } from '@/hooks/use-list'
import { formatDate } from '@/lib/format'
import type { Lab, LabsResponse } from '@/types'

const STATUS_FILTERS = [
  { key: 'pending', label: 'Pending' },
  { key: 'partial', label: 'Partial' },
  { key: 'reported', label: 'Reported' },
  { key: 'all', label: 'All' },
] as const

function Detecting() {
  return <div aria-hidden className="h-20 animate-pulse rounded bg-muted" />
}

export function LabsPage() {
  const [params, setParams] = useSearchParams()
  const { session } = useAuth()
  const navigate = useNavigate()

  const status = params.get('status') ?? 'pending'
  const patientFilter = params.get('patient') ?? ''

  const listQuery = useCallback(
    (_q: string, offset: number) => {
      const p = new URLSearchParams()
      p.set('status', status)
      if (patientFilter) p.set('patient', patientFilter)
      p.set('limit', '25')
      p.set('offset', String(offset))
      return `?${p.toString()}`
    },
    [status, patientFilter],
  )

  const list = useList<Lab, LabsResponse>('/labs', listQuery)
  const data = list.data
  const total = data?.total ?? 0

  const canAdd = can(session, 'lab_test_add')

  useEffect(() => {
    setParams((prev) => {
      if (prev.get('status') || (prev.get('patient') ?? '')) return prev
      const next = new URLSearchParams(prev)
      next.set('status', 'pending')
      return next
    }, { replace: true })
  }, [setParams])

  function setFilter(key: 'status' | 'patient', value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Laboratory"
        description="Requests with embedded rows — status derived, never typed."
        actions={
          <div className="flex gap-2">
            <Link to="/lab-tests">
              <Button variant="outline">Test catalogue</Button>
            </Link>
            {canAdd && (
              <Button
                onClick={() =>
                  navigate(`/laboratory/create${patientFilter ? `?patient=${patientFilter}` : ''}`)
                }
              >
                New request
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f.key}
            variant={status === f.key ? 'default' : 'outline'}
            size="sm"
            aria-pressed={status === f.key}
            onClick={() => setFilter('status', f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {list.error ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          <p>{list.error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={list.refresh}>
            Try again
          </Button>
        </div>
      ) : data && data.items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm font-medium">
            {status === 'pending' ? 'No pending lab work.' : 'No lab requests here.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Patient</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Doctor</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Tests</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((l) => {
                const pending = l.tests.filter((t) => !t.result).length
                return (
                  <tr key={l._id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(l.date)}</td>
                    <td className="px-4 py-3 font-medium">
                      <Link to={`/laboratory/${l._id}`} className="underline-offset-2 hover:underline">
                        {data.patientNames[l.patientId] ?? l.patientName ?? 'Unknown'}
                      </Link>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">{l.doctorName || 'No doctor'}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{l.tests.length}</span>{' '}
                      <span className={pending ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>
                        {pending ? `${pending} pending` : 'all reported'}
                      </span>
                      <p className="mt-0.5 max-w-md text-xs text-muted-foreground">
                        {l.tests.map((t) => t.name).join(', ')}
                      </p>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {list.loading && <Detecting />}

      {total > list.limit && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p aria-live="polite">
            {list.offset + 1}–{list.offset + (data?.items.length ?? 0)} of {total.toLocaleString()}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={list.offset === 0} onClick={() => list.setOffset(list.offset - list.limit)}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={list.offset + list.limit >= total}
              onClick={() => list.setOffset(list.offset + list.limit)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default LabsPage
