import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { PatientPicker } from '@/appointments/patient-picker'
import { dateToInput } from '@/clinic/prescription-form'
import type { Doctor, Lab, LabCategory, LabCategoriesResponse, Patient } from '@/types'

export function LabCreatePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const [patient, setPatient] = useState<{ id: string; name: string } | null>(null)
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [doctorId, setDoctorId] = useState('')
  const [date, setDate] = useState(() => dateToInput(new Date().toISOString()))
  const [cats, setCats] = useState<LabCategory[]>([])
  const [catLoadError, setCatLoadError] = useState<string | null>(null)
  const [testQuery, setTestQuery] = useState('')
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<unknown>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const id = params.get('patient')
    if (!id) return
    api.get<Patient>(`/patients/${id}`).then(
      (p) => setPatient({ id: p._id, name: p.name }),
      () => setPatient(null),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    api.get<{ items: Doctor[] }>('/doctors?limit=100').then(
      (d) => setDoctors(d.items),
      () => setDoctors([]),
    )
    api.get<LabCategoriesResponse>('/lab-categories').then(
      (d) => setCats(d.items),
      () => setCatLoadError('Could not load the test catalogue.'),
    )
  }, [])

  const q = testQuery.trim().toLowerCase()
  const shown = q ? cats.filter((c) => c.name.toLowerCase().includes(q)) : cats

  function toggle(id: string) {
    setPickedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit() {
    if (!patient) return setError(new Error('Choose a patient.'))
    if (!pickedIds.size) return setError(new Error('Add at least one test.'))
    setSubmitting(true)
    setError(null)
    const body = {
      patientId: patient.id,
      doctorId: doctorId || null,
      date: new Date(date).toISOString(),
      testIds: [...pickedIds],
    }
    try {
      const created = await api.post<Lab>('/labs', body)
      navigate(`/laboratory/${created._id}`, { state: { created: true } })
    } catch (e) {
      setError(e)
      setSubmitting(false)
    }
  }

  const fieldError = error && typeof error === 'object' && 'fields' in error
    ? ((error as { fields: Record<string, string> }).fields ?? {})
    : {}
  const errorMessage = error instanceof Error ? error.message : null

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader
        title="New lab request"
        description="Pick tests from the catalogue — names and reference values snapshot onto the rows."
      />

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="lab-patient">Patient</Label>
            {patient ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
                <span className="font-medium">{patient.name}</span>
                <Button variant="ghost" size="sm" onClick={() => setPatient(null)}>
                  Change
                </Button>
              </div>
            ) : (
              <PatientPicker onPick={(p) => setPatient({ id: p._id, name: p.name })} />
            )}
            {fieldError.patientId && <p className="text-xs text-destructive">{fieldError.patientId}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lab-doctor">Requesting doctor</Label>
            <select
              id="lab-doctor"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
            >
              <option value="">None</option>
              {doctors.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </select>
            {fieldError.doctorId && <p className="text-xs text-destructive">{fieldError.doctorId}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lab-date">Date</Label>
            <Input id="lab-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            {fieldError.date && <p className="text-xs text-destructive">{fieldError.date}</p>}
          </div>
          <div className="flex items-end text-xs text-muted-foreground">
            {patient ? `Snapshot of ${patient.name} at request time.` : 'Patient snapshots are stored on the request.'}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Label htmlFor="lab-test-search">Tests</Label>
          <span className="text-xs text-muted-foreground">{pickedIds.size} selected</span>
        </div>
        <Input
          id="lab-test-search"
          type="search"
          className="mt-1.5"
          placeholder="Filter tests…"
          aria-label="Filter tests"
          value={testQuery}
          onChange={(e) => setTestQuery(e.target.value)}
        />
        {catLoadError ? (
          <p className="mt-3 text-sm text-destructive">{catLoadError}</p>
        ) : cats.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            The catalogue is empty — add tests first.{' '}
            <button className="underline underline-offset-2" type="button" onClick={() => navigate('/lab-tests')}>
              Open the catalogue
            </button>
          </p>
        ) : shown.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No tests match “{testQuery}”.</p>
        ) : (
          <ul className="mt-3 grid max-h-72 gap-1 overflow-y-auto rounded-md border border-border/60" aria-label="Test catalogue">
            {shown.map((c) => (
              <li key={c._id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-sm px-3 py-2 text-sm hover:bg-accent/50">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={pickedIds.has(c._id)}
                    onChange={() => toggle(c._id)}
                    aria-label={`Add test ${c.name}`}
                  />
                  <span className="min-w-0">
                    <span className="font-medium">{c.name}</span>{' '}
                    <span className="block text-xs text-muted-foreground">
                      {c.referenceValue ? `Reference: ${c.referenceValue}` : 'No reference value stored'}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {fieldError.tests ? (
          <p className="mt-3 text-xs text-destructive">{fieldError.tests}</p>
        ) : errorMessage && !(fieldError && Object.keys(fieldError).length) ? (
          <p role="alert" className="mt-3 text-sm text-destructive">{errorMessage}</p>
        ) : null}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate(-1)} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={submitting}>
          {submitting ? 'Creating…' : 'Create request'}
        </Button>
      </div>

    </div>
  )
}

export default LabCreatePage
