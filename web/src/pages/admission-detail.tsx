import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { can, useAuth } from '@/auth/auth-context'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/format'
import { formatElapsed, useNow } from '@/beds/los'
import { DialogShell } from '@/pages/beds-board'
import { Input, Label } from '@/components/ui/input'
import type { Admission } from '@/types'

export function AdmissionDetailPage() {
  const { id = '' } = useParams()
  const { session } = useAuth()
  const now = useNow()

  const [admission, setAdmission] = useState<Admission | null>(null)
  const [wardName, setWardName] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dischargeOpen, setDischargeOpen] = useState(false)
  const [dTime, setDTime] = useState('')
  const [busy, setBusy] = useState(false)
  const [dischargeError, setDischargeError] = useState<string | null>(null)

  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    api.get<Admission>(`/admissions/${id}`).then(
      async (d) => {
        if (cancelled) return
        setAdmission(d)
        setLoadError(null)
        // The detail endpoint doesn't resolve the ward; take it from the board.
        try {
          const board = await api.get<{ beds: { _id: string; wardName: string }[] }>('/beds')
          if (!cancelled) {
            setWardName(board.beds.find((b) => b._id === d.bedId)?.wardName ?? null)
          }
        } catch {
          // board fetch is best-effort
        }
      },
      (e) => !cancelled && setLoadError(e instanceof Error ? e.message : 'Failed to load'),
    )
    return () => {
      cancelled = true
    }
  }, [id, nonce])

  async function onDischarge() {
    setBusy(true)
    setDischargeError(null)
    try {
      await api.post(`/admissions/${id}/discharge`, dTime ? { dTime: new Date(dTime).toISOString() } : {})
      setDischargeOpen(false)
      setDTime('')
      setNonce((n) => n + 1)
    } catch (e) {
      setDischargeError(e instanceof Error ? e.message : 'Could not discharge. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        {loadError}
      </div>
    )
  }

  if (!admission) return <div aria-hidden className="h-64 animate-pulse rounded-lg bg-muted" />

  const isCurrent = admission.dTime === null
  const canDischarge = can(session, 'admission_discharge')

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <PageHeader
        title={admission.patientName ? `${admission.patientName} — admission` : 'Admission'}
        description={admission.patientCode ? `Patient ID ${admission.patientCode}` : undefined}
        actions={
          isCurrent && canDischarge ? (
            <Button
              variant="outline"
              onClick={() => {
                setDischargeOpen(true)
                setDischargeError(null)
              }}
            >
              Discharge
            </Button>
          ) : null
        }
      />

      <Link to="/admissions" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to admissions
      </Link>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
            <p className="mt-1 text-sm">
              {isCurrent ? (
                <span className="inline-flex rounded-full border border-accent bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                  Admitted {formatElapsed(admission.admittedAt, new Date(now))}
                </span>
              ) : (
                <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  Discharged
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bed</p>
            <p className="mt-1 text-sm">
              {admission.bedNumber ?? admission.number}
              <span className="text-muted-foreground"> · {wardName ?? admission.wardName ?? 'Ward removed'}</span>
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Admitted at</p>
            <p className="mt-1 text-sm">{formatDateTime(admission.admittedAt)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Discharged at</p>
            <p className="mt-1 text-sm">
              {admission.dTime
                ? `${formatDateTime(admission.dTime)} · ${formatElapsed(admission.admittedAt, admission.dTime)}`
                : <span className="text-muted-foreground">—</span>}
            </p>
          </div>
          {admission.patientName && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Patient</p>
              <p className="mt-1 text-sm">
                <Link to={`/patients/${admission.patientId}`} className="font-medium underline-offset-2 hover:underline">
                  {admission.patientName}
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>

      {dischargeOpen && (
        <DialogShell title="Discharge patient" onClose={() => setDischargeOpen(false)}>
          <p className="text-sm text-muted-foreground">
            Discharge {admission.bedNumber ?? admission.number} ({admission.patientName ?? 'Unknown patient'}).
            The bed frees instantly.
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
          {dischargeError && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {dischargeError}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDischargeOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={onDischarge} disabled={busy}>
              {busy ? 'Discharging…' : 'Discharge'}
            </Button>
          </div>
        </DialogShell>
      )}
    </div>
  )
}

export default AdmissionDetailPage
