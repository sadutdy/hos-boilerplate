import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { PatientForm, toRequest, type PatientFormValues } from '@/patients/patient-form'
import type { Patient } from '@/types'

export function PatientCreatePage() {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function onSubmit(values: PatientFormValues) {
    setSubmitting(true)
    setError(null)
    try {
      const patient = await api.post<Patient>('/patients', toRequest(values))
      navigate(`/patients/${patient._id}`, { replace: true })
    } catch (e) {
      setError(e)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Add patient"
        description="Only a name is required — you can fill in the rest later."
      />
      <div className="rounded-lg border border-border bg-card p-5">
        <PatientForm
          submitLabel="Register"
          onSubmit={onSubmit}
          submitting={submitting}
          error={error}
          onCancel={() => navigate('/patients')}
        />
      </div>
    </div>
  )
}

export default PatientCreatePage
