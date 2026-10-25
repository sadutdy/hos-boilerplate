import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { can, useAuth } from '@/auth/auth-context'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { formatDateTime } from '@/lib/format'
import { buttonVariants } from '@/components/ui/button'
import { formatElapsed, useNow } from '@/beds/los'
import { DialogShell } from '@/pages/beds-board'
import type { Admission } from '@/types'
import { cn } from '@/lib/utils'

const TABS = [
  { show: 'current', label: 'Current' },
  { show: 'discharged', label: 'Discharged' },
  { show: 'all', label: 'All' },
] as const

export function AdmissionsPage() {
  const [params, setParams] = useSearchParams()
  const { session } = useAuth()
  const now = useNow()

  const show = (params.get('show') ?? 'current') as 'current' | 'discharged' | 'all'

  const [items, setItems] = useState<Admission[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resolved, setResolved] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const refresh = useCallback(() => setNonce((n) => n + 1), [])
  const requestKey = `${show}|${nonce}`

  const [dischargeId, setDischargeId] = useState<string | null>(null)
  const [busyDischarge, setBusyDischarge] = useState(false)
  const [dischargeError, setDischargeError] = useState<string | null>(null)

  const query = `/admissions?show=${show}`

  useEffect(() => {
    let cancelled = false
    api.get<{ items: Admission[] }>(query).then(
      (d) => {
        if (cancelled) return
        setItems(d.items)
        setError(null)
        setResolved(requestKey)
      },
      (e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load')
        setResolved(requestKey)
      },
    )
    return () => {
      cancelled = true
    }
  }, [query, requestKey])

  const loading = resolved !== requestKey

  function setShow(value: typeof show) {
    const next = new URLSearchParams(params)
    next.set('show', value)
    setParams(next, { replace: true })
  }

  const toDischarge = items?.find((a) => a._id === dischargeId)

  async function onDischarge(dTime: string | null) {
    if (!dischargeId) return
    setBusyDischarge(true)
    setDischargeError(null)
    try {
      await api.post(`/admissions/${dischargeId}/discharge`, dTime ? { dTime } : {})
      setDischargeId(null)
      refresh()
    } catch (e) {
      setDischargeError(e instanceof Error ? e.message : 'Could not discharge. Try again.')
    } finally {
      setBusyDischarge(false)
    }
  }

  const canAdmit = can(session, 'admission_add')
  const canDischarge = can(session, 'admission_discharge')

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Admissions"
        description="One open stay per bed, one per patient — enforced at admit time."
        actions={
          canAdmit ? (
            <Link to="/admissions/create" className={buttonVariants()}>
              Admit patient
            </Link>
          ) : null
        }
      />

      <div role="tablist" aria-label="Admission scope" className="flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.show}
            role="tab"
            aria-selected={show === t.show}
            onClick={() => setShow(t.show)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm',
              show === t.show
                ? 'bg-accent font-medium text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          <p>{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={refresh}>
            Try again
          </Button>
        </div>
      )}

      {!error && loading && (
        <div aria-hidden className="rounded-lg border border-border bg-card">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-border/60 px-4 py-3.5 last:border-0">
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
              <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
              <div className="hidden h-4 w-32 animate-pulse rounded bg-muted sm:block" />
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {!error && !loading && items && items.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm font-medium">
            {show === 'current' ? 'No patients on the ward.' : 'No admissions recorded yet.'}
          </p>
          {canAdmit && show === 'current' && (
            <p className="mt-1 text-sm text-muted-foreground">
              <Link to="/admissions/create" className="text-primary hover:underline">
                Admit a patient
              </Link>{' '}
              from the ward board.
            </p>
          )}
        </div>
      )}

      {!error && !loading && items && items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">Patient</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Bed</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Admitted</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Stay</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">Status</th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a._id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                  <td className="px-4 py-3 font-medium">
                    {a.patientName ? (
                      <Link
                        to={`/patients/${a.patientId}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {a.patientName}
                      </Link>
                    ) : (
                      'Unknown patient'
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {a.bedNumber}
                    <span className="text-muted-foreground"> · {a.wardName}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{formatDateTime(a.admittedAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                    {a.dTime
                      ? formatElapsed(a.admittedAt, a.dTime)
                      : formatElapsed(a.admittedAt, new Date(now))}
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    {a.dTime ? (
                      <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        Discharged {formatDateTime(a.dTime)}
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full border border-accent bg-accent text-accent-foreground px-2.5 py-0.5 text-xs font-medium">
                        Admitted
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!a.dTime && canDischarge && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDischargeId(a._id)
                          setDischargeError(null)
                        }}
                      >
                        Discharge
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dischargeError && (
        <p role="alert" className="text-sm text-destructive">
          {dischargeError}
        </p>
      )}

      {dischargeId && toDischarge && (
        <DischargeDialog
          admission={toDischarge}
          error={dischargeError}
          busy={busyDischarge}
          onClose={() => {
            setDischargeId(null)
            setDischargeError(null)
          }}
          onConfirm={onDischarge}
        />
      )}
    </div>
  )
}

function DischargeDialog({
  admission,
  error,
  busy,
  onClose,
  onConfirm,
}: {
  admission: Admission
  error: string | null
  busy: boolean
  onClose: () => void
  onConfirm: (dTime: string | null) => void
}) {
  const [dTime, setDTime] = useState('')

  return (
    <DialogShell title="Discharge patient" onClose={onClose}>
      <p className="text-sm text-muted-foreground">
        Discharge {admission.patientName} from bed {admission.bedNumber} ({admission.wardName}). The
        bed frees instantly and can be taken by the next admission.
      </p>
      <div className="mt-3 space-y-1.5">
        <Label htmlFor="discharge-time">Discharge time</Label>
        <Input
          id="discharge-time"
          type="datetime-local"
          value={dTime}
          onChange={(e) => setDTime(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Leave blank to discharge now.</p>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={() => onConfirm(dTime ? new Date(dTime).toISOString() : null)} disabled={busy}>
          {busy ? 'Discharging…' : 'Discharge'}
        </Button>
      </div>
    </DialogShell>
  )
}

export default AdmissionsPage
