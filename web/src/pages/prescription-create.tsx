import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { PatientPicker } from '@/appointments/patient-picker'
import {
  PrescriptionForm,
  emptyItem,
  toPrescriptionRequest,
  dateToInput,
  type PrescriptionFormValues,
} from '@/clinic/prescription-form'
import type { Doctor, Patient, Prescription } from '@/types'

export function PrescriptionCreatePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const [patient, setPatient] = useState<{ id: string; name: string } | null>(null)
  const [doctors, setDoctors] = useState<Doctor[] | null>(null)
  const [doctorId, setDoctorId] = useState(params.get('doctor') ?? '')
  const [date, setDate] = useState(() => dateToInput(new Date().toISOString()))
  const [values, setValues] = useState<Omit<PrescriptionFormValues, 'patientId' | 'patientName' | 'doctorId'>>({
    date: dateToInput(new Date().toISOString()),
    symptom: '',
    advice: '',
    note: '',
    validity: '',
    items: [{ ...emptyItem }],
  })
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
  }, [])

  useEffect(() => {
    setValues((v) => ({ ...v, date }))
  }, [date])

  const formValues: PrescriptionFormValues = {
    patientId: patient?.id ?? '',
    patientName: patient?.name ?? '',
    doctorId,
    ...values,
  }

  async function submit(v: PrescriptionFormValues) {
    if (!patient) {
      setError(new Error('Choose a patient.'))
      return
    }
    if (!doctorId) {
      setError(new Error('Choose a doctor.'))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const created = await api.post<Prescription>('/prescriptions', toPrescriptionRequest(v))
      navigate(`/prescriptions/${created._id}`, { state: { created: true } })
    } catch (e) {
      setError(e)
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader
        title="Write prescription"
        description="One row per medicine — pick from the catalogue or type freely."
      />

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pick-patient">Patient</Label>
            {patient ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
                <span className="font-medium">{patient.name}</span>
                <Button variant="ghost" size="sm" onClick={() => setPatient(null)}>
                  Change
                </Button>
              </div>
            ) : (
              <PatientPicker
                onPick={(p) => setPatient({ id: p._id, name: p.name })}
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pick-doctor">Doctor</Label>
            <select
              id="pick-doctor"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
            >
              <option value="">Choose a doctor…</option>
              {(doctors ?? []).map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                  {d.specialist ? ` — ${d.specialist}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rx-date">Date</Label>
            <Input id="rx-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <PrescriptionForm
          initial={formValues}
          submitLabel="Write prescription"
          submitting={submitting}
          error={error}
          onCancel={() => navigate(-1)}
          onSubmit={submit}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        Patient history lives on their <Link to="/patients" className="underline underline-offset-2">profile</Link>.
      </p>
    </div>
  )
}

export default PrescriptionCreatePage
