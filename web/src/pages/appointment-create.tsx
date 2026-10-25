import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Patient } from '@/types'
import { PageHeader } from '@/components/page-header'
import { AppointmentForm, toAppointmentRequest, type AppointmentFormValues } from '@/appointments/appointment-form'
import { todayStr } from '@/appointments/constants'

export function AppointmentCreatePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const [initial, setInitial] = useState<AppointmentFormValues | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<unknown>(null)

  // Deep links: /appointments/create?date=…&patient=…&doctor=… (spec 04 §2)
  useEffect(() => {
    let cancelled = false
    const patientId = params.get('patient')
    if (!patientId) {
      setInitial({
        patient: null,
        doctorId: params.get('doctor') ?? '',
        date: params.get('date') ?? todayStr(),
        start: '',
        minutes: 15,
        status: '',
        remarks: '',
        vitals: {},
      })
      return
    }
    api
      .get<Patient>(`/patients/${patientId}`)
      .then(
        (p) => {
          if (cancelled) return
          setInitial({
            patient: p,
            doctorId: params.get('doctor') ?? '',
            date: params.get('date') ?? todayStr(),
            start: '',
            minutes: 15,
            status: '',
            remarks: '',
            vitals: {},
          })
        },
        () => !cancelled && setInitial({
          patient: null,
          doctorId: params.get('doctor') ?? '',
          date: params.get('date') ?? todayStr(),
          start: '',
          minutes: 15,
          status: '',
          remarks: '',
          vitals: {},
        }),
      )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submitBooking(values: AppointmentFormValues) {
    setSubmitting(true)
    setError(null)
    try {
      const appt = await api.post('/appointments', toAppointmentRequest(values))
      navigate('/appointments', {
        replace: true,
        state: { flash: 'Appointment booked' },
      })
      return appt
    } catch (e) {
      setError(e)
    } finally {
      setSubmitting(false)
    }
  }

  if (!initial) return <div aria-hidden className="h-64 animate-pulse rounded-lg bg-muted" />

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <PageHeader
        title="Book appointment"
        description="Back-to-back slots are fine — the desk is warned only on true overlaps."
      />
      <div className="rounded-lg border border-border bg-card p-5">
        <AppointmentForm
          initial={initial}
          submitLabel="Book"
          onSubmit={(values) => submitBooking(values)}
          submitting={submitting}
          error={error}
          onCancel={() => navigate(-1)}
        />
      </div>
    </div>
  )
}

export default AppointmentCreatePage
