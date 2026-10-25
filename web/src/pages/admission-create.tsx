import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiRequestError } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { NativeSelect as Select } from '@/components/ui/select'
import { PatientPicker } from '@/appointments/patient-picker'
import type { Admission, AdmissionCreateData, Patient } from '@/types'

export function AdmissionCreatePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const [data, setData] = useState<AdmissionCreateData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [bedId, setBedId] = useState('')
  const [admittedAt, setAdmittedAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<unknown>(null)

  function fieldText(key: 'patientId' | 'bedId'): string | null {
    return error instanceof ApiRequestError ? (error.fields?.[key] ?? null) : null
  }

  // Deep links: /admissions/create?patient=… (profile/board) or ?bed=… (free-bed "Admit").
  useEffect(() => {
    let cancelled = false
    const bedParam = params.get('bed') ?? ''
    const patientParam = params.get('patient') ?? ''

    api.get<AdmissionCreateData>('/admissions/create-data').then(
      async (d) => {
        if (cancelled) return
        let preselect: Patient | null = null
        if (patientParam) {
          try {
            preselect = await api.get<Patient>(`/patients/${patientParam}`)
          } catch {
            preselect = null
          }
        }
        if (cancelled) return
        setPatient(preselect)
        // A pre-selected bed only counts while it is actually still free.
        setBedId(d.beds.some((b) => b.id === bedParam) ? bedParam : '')
        setData(d)
        setLoadError(null)
      },
      (e) => {
        if (cancelled) return
        setLoadError(e instanceof Error ? e.message : 'Failed to load')
      },
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedBed = data?.beds.find((b) => b.id === bedId)

  async function onAdmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const admission = await api.post<Admission>('/admissions', {
        patientId: patient?._id ?? '',
        bedId,
        ...(admittedAt ? { admittedAt: new Date(admittedAt).toISOString() } : {}),
      })
      navigate(`/admissions/${admission._id}`)
    } catch (e) {
      setError(e)
    } finally {
      setSubmitting(false)
    }
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        {loadError}
      </div>
    )
  }

  if (!data) return <div aria-hidden className="h-64 animate-pulse rounded-lg bg-muted" />

  const bedsByWard = new Map<string, AdmissionCreateData['beds']>()
  for (const b of data.beds) {
    const list = bedsByWard.get(b.wardName) ?? []
    list.push(b)
    bedsByWard.set(b.wardName, list)
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <PageHeader
        title="Admit patient"
        description={
          data.beds.length > 0
            ? `${data.beds.length} free bed${data.beds.length === 1 ? '' : 's'} right now.`
            : 'No free beds — discharge someone first.'
        }
      />

      <div className="rounded-lg border border-border bg-card p-5">
        <form className="space-y-4" noValidate onSubmit={(e) => e.preventDefault()}>
          <div className="space-y-1.5">
            <Label htmlFor="adm-patient">Patient</Label>
            <PatientPicker onPick={(p) => setPatient(p)} />
            {patient === null && fieldText('patientId') ? (
              <p className="text-xs text-destructive">{fieldText('patientId')}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adm-bed">Bed</Label>
            <Select id="adm-bed" value={bedId} onChange={(e) => setBedId(e.target.value)}>
              <option value="">Select a free bed…</option>
              {[...bedsByWard.entries()].map(([wardName, beds]) => (
                <optgroup key={wardName} label={`${wardName} — ${beds.length} free`}>
                  {beds.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.number}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
            {fieldText('bedId') ? (
              <p className="text-xs text-destructive">{fieldText('bedId')}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adm-time">Admitted at</Label>
            <Input
              id="adm-time"
              type="datetime-local"
              value={admittedAt}
              onChange={(e) => setAdmittedAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Leave blank to admit now.</p>
          </div>

          {selectedBed && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Bed {selectedBed.number} · {selectedBed.wardName}
            </p>
          )}

          {error instanceof Error && !(error instanceof ApiRequestError) && (
            <p role="alert" className="text-sm text-destructive">
              {error.message}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => navigate(-1)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !patient || !bedId} onClick={onAdmit}>
              {submitting ? 'Admitting…' : 'Admit'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AdmissionCreatePage
