import { useEffect, useMemo, useState } from 'react'
import { api, ApiRequestError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { NativeSelect as Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PatientPicker } from './patient-picker'
import { addMinutesToTime } from './constants'
import type { AppointmentStatus, AppointmentVitals, DoctorRef, Patient } from '@/types'

const DURATIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 480]

export interface AppointmentFormValues {
  patient: Patient | null
  doctorId: string
  date: string
  start: string
  minutes: number
  status: AppointmentStatus | ''
  remarks: string
  vitals: AppointmentVitals
}

function fieldError(err: unknown, key: string): string | null {
  return err instanceof ApiRequestError ? (err.fields?.[key] ?? null) : null
}

function formMessage(err: unknown): string | null {
  if (err instanceof ApiRequestError) return err.fields ? null : err.message
  return err instanceof Error ? err.message : null
}

export function AppointmentForm({
  initial,
  submitLabel,
  onSubmit,
  submitting,
  error,
  onCancel,
}: {
  /** patient resolved pre-arrival via ?patient=
   */
  initial: AppointmentFormValues
  submitLabel: string
  onSubmit: (values: AppointmentFormValues) => void
  submitting: boolean
  error: unknown
  onCancel: () => void
}) {
  const [values, setValues] = useState(initial)

  const endTime = values.start
    ? addMinutesToTime(values.start, values.minutes)
    : null

  const set = <K extends keyof AppointmentFormValues>(key: K) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    setValues((v) => ({ ...v, [key]: e.target.value }))
  }

  const setVitals = (key: keyof AppointmentVitals) => (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setValues((v) => ({ ...v, vitals: { ...v.vitals, [key]: e.target.value } }))
  }

  const commitPatient = useMemo(() => (patient: Patient) => {
    setValues((v) => ({ ...v, patient }))
  }, [])

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(values)
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2 space-y-1.5">
          <Label htmlFor="ap-patient">Patient</Label>
          <PatientPicker
            onPick={commitPatient}
            clearSignal={values.patient ? 0 : 1}
          />
          {values.patient === null && fieldError(error, 'patientId') ? (
            <p className="text-xs text-destructive">{fieldError(error, 'patientId')}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ap-doctor">Doctor</Label>
          <DoctorSelect
            id="ap-doctor"
            value={values.doctorId}
            onChange={set('doctorId')}
            prefill={initial.doctorId}
          />
          {fieldError(error, 'doctorId') && (
            <p className="text-xs text-destructive">{fieldError(error, 'doctorId')}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ap-date">Date</Label>
          <Input id="ap-date" name="date" type="date" value={values.date} onChange={set('date')} />
          {fieldError(error, 'date') && (
            <p className="text-xs text-destructive">{fieldError(error, 'date')}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ap-start">Start time</Label>
          <Input id="ap-start" name="start" type="time" value={values.start} onChange={set('start')} />
          {fieldError(error, 'start') && (
            <p className="text-xs text-destructive font-medium">
              {fieldError(error, 'start')}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ap-minutes">Duration</Label>
          <Select
            id="ap-minutes"
            value={String(values.minutes)}
            onChange={(e) => setValues((v) => ({ ...v, minutes: Number(e.target.value) }))}
          >
            {DURATIONS.map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </Select>
          {fieldError(error, 'minutes') && (
            <p className="text-xs text-destructive">{fieldError(error, 'minutes')}</p>
          )}
        </div>
        {initial.status !== '' && (
          <div className="space-y-1.5">
            <Label htmlFor="ap-status">Status</Label>
            <Select id="ap-status" value={values.status} onChange={set('status')}>
              <option value="">Keep current</option>
              {(['scheduled', 'arrived', 'completed', 'cancelled', 'no show'] as const).map((s) => (
                <option key={s} value={s}>
                  {s === 'no show' ? 'No show' : s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </Select>
          </div>
        )}
        {endTime && (
          <p
            id="ap-end-preview"
            className="sm:col-span-2 text-xs text-muted-foreground"
            aria-live="polite"
          >
            Ends at <span className="font-medium text-foreground">{endTime}</span>
          </p>
        )}
        <div className="sm:col-span-2 space-y-1.5">
          <Label htmlFor="ap-remarks">Remarks</Label>
          <Textarea
            id="ap-remarks"
            rows={2}
            maxLength={500}
            placeholder="Optional — reason for visit, notes for the doctor…"
            value={values.remarks}
            onChange={set('remarks')}
          />
        </div>
      </div>

      <div className="rounded-lg border border-border p-4">
        <h3 className="mb-3 text-sm font-semibold">Vitals <span className="font-normal text-muted-foreground">(optional)</span></h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="ap-bp">Blood pressure</Label>
            <Input id="ap-bp" placeholder="120/80" value={values.vitals.bloodPressure ?? ''} onChange={setVitals('bloodPressure')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap-pulse">Pulse</Label>
            <Input id="ap-pulse" inputMode="numeric" placeholder="72" value={values.vitals.pulse ?? ''} onChange={setVitals('pulse')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap-temp">Temperature</Label>
            <Input id="ap-temp" inputMode="decimal" placeholder="36.8" value={values.vitals.temperature ?? ''} onChange={setVitals('temperature')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap-weight">Weight</Label>
            <Input id="ap-weight" inputMode="decimal" placeholder="65" value={values.vitals.weight ?? ''} onChange={setVitals('weight')} />
          </div>
        </div>
      </div>

      {formMessage(error) && (
        <p role="alert" className="text-sm text-destructive">
          {formMessage(error)}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}

function DoctorSelect({
  id,
  value,
  onChange,
  prefill,
}: {
  id: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
  /** doctor id resolved during preload — included even if the list hasn't arrived yet */
  prefill?: string
}) {
  const [doctors, setDoctors] = useState<DoctorRef[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    api.get<{ items: DoctorRef[] }>('/doctors?limit=100').then(
      (d) => setDoctors(d.items),
      (e) => setLoadError(e instanceof Error ? e.message : 'Failed to load doctors'),
    )
  }, [])

  return (
    <div>
      <Select id={id} value={value} onChange={onChange} aria-describedby={loadError ? `${id}-err` : undefined}>
        <option value="">Select a doctor…</option>
        {prefill && doctors && !doctors.some((d) => d._id === prefill) ? (
          <option value={prefill}>Doctor #{prefill.slice(-6)}</option>
        ) : null}
        {(doctors ?? []).map((d) => (
          <option key={d._id} value={d._id}>
            {d.name}
            {d.department ? ` — ${d.department}` : ''}
          </option>
        ))}
      </Select>
      {loadError && (
        <p id={`${id}-err`} className="text-xs text-destructive">
          {loadError}
        </p>
      )}
    </div>
  )
}

export function toAppointmentRequest(values: AppointmentFormValues) {
  return {
    patientId: values.patient?._id ?? '',
    doctorId: values.doctorId,
    date: values.date,
    start: values.start,
    minutes: values.minutes,
    ...(values.status !== '' ? { status: values.status } : {}),
    remarks: values.remarks,
    vitals: values.vitals,
  }
}
