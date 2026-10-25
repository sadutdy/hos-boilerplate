import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { DoctorForm, toDoctorRequest, type DoctorFormValues } from '@/clinic/doctor-form'
import type { Doctor } from '@/types'

export function DoctorCreatePage() {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function onSubmit(values: DoctorFormValues) {
    setSubmitting(true)
    setError(null)
    try {
      const doctor = await api.post<Doctor>('/doctors', toDoctorRequest(values))
      navigate(`/doctors/${doctor._id}`, { replace: true })
    } catch (e) {
      setError(e)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <PageHeader
        title="Add doctor"
        description="Only a name is required — a locum starting Monday can be on file in one field."
      />
      <div className="rounded-lg border border-border bg-card p-5">
        <DoctorForm
          submitLabel="Add doctor"
          onSubmit={onSubmit}
          submitting={submitting}
          error={error}
          onCancel={() => navigate('/doctors')}
        />
      </div>
    </div>
  )
}

export default DoctorCreatePage
