import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { AppointmentForm, toAppointmentRequest, type AppointmentFormValues } from '@/appointments/appointment-form'
import { toDateInputValue } from '@/lib/format'
import type { Appointment, Patient } from '@/types'

export function AppointmentEditPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [initial, setInitial] = useState<AppointmentFormValues | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    let cancelled = false
    api
      .get<Appointment & { patientName?: string }>(`/appointments/${id}`)
      .then(
        async (appt) => {
          if (cancelled) return
          // Resolve the booking patient for the picker.
          let patient: Patient | null = null
          try {
            patient = await api.get<Patient>(`/patients/${appt.patientId}`)
          } catch {
            patient = null
          }
          if (cancelled) return
          setInitial({
            patient: patient ? patient : null,
            doctorId: appt.doctorId,
            date: toDateInputValue(appt.date),
            start: appt.startDateTime ? appt.startDateTime.slice(11, 16) : '',
            minutes: appt.minutes,
            status: appt.status,
            remarks: appt.remarks ?? '',
            vitals: appt.vitals ?? {},
          })
        },
        (e) => !cancelled && setLoadError(e instanceof Error ? e.message : 'Failed to load'),
      )
    return () => {
      cancelled = true
    }
  }, [id])

  async function submit(values: AppointmentFormValues) {
    setSubmitting(true)
    setError(null)
    try {
      await api.put(`/appointments/${id}`, toAppointmentRequest(values))
      navigate('/appointments', { replace: true })
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

  if (!initial) return <div aria-hidden className="h-64 animate-pulse rounded-lg bg-muted" />

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <PageHeader title="Edit appointment" description="Changing time or duration rechecks the double-booking guard." />
      <div className="rounded-lg border border-border bg-card p-5">
        <AppointmentForm
          initial={initial}
          submitLabel="Save changes"
          onSubmit={submit}
          submitting={submitting}
          error={error}
          onCancel={() => navigate('/appointments')}
        />
      </div>
    </div>
  )
}

export default AppointmentEditPage
