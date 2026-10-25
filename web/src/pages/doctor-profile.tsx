import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { can, useAuth } from '@/auth/auth-context'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DoctorForm, toDoctorRequest, type DoctorFormValues } from '@/clinic/doctor-form'
import type { Appointment, Doctor } from '@/types'

interface DoctorDetail {
  doctor: Doctor
  recentAppointments: Appointment[]
}

export function DoctorProfilePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()

  const [detail, setDetail] = useState<DoctorDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<unknown>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.get<DoctorDetail>(`/doctors/${id}`).then(
      (d) => {
        if (cancelled) return
        setDetail(d)
        setLoadError(null)
      },
      (e) => !cancelled && setLoadError(e instanceof Error ? e.message : 'Failed to load'),
    )
    return () => {
      cancelled = true
    }
  }, [id])

  async function onSave(values: DoctorFormValues) {
    setSaving(true)
    setSaveError(null)
    try {
      const doctor = await api.put<Doctor>(`/doctors/${id}`, toDoctorRequest(values))
      setDetail((d) => (d ? { ...d, doctor: { ...d.doctor, ...doctor } } : d))
      setEditing(false)
    } catch (e) {
      setSaveError(e)
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await api.delete(`/doctors/${id}`)
      navigate('/doctors', { replace: true })
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Could not delete. Try again.')
      setDeleting(false)
      setDeleteOpen(false)
    }
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        {loadError}
        <div className="mt-3">
          <Link to="/doctors" className="text-sm font-medium text-primary hover:underline">
            Back to doctors
          </Link>
        </div>
      </div>
    )
  }

  if (!detail) return <div aria-hidden className="h-64 animate-pulse rounded-lg bg-muted" />

  const doctor = detail.doctor
  const canUpdate = can(session, 'doctor_update')

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={doctor.name}
        description={[doctor.department, doctor.specialist].filter(Boolean).join(' — ') || undefined}
        actions={
          <>
            {can(session, 'doctor_delete') && (
              <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                Delete
              </Button>
            )}
            {canUpdate && (
              <Button variant="outline" onClick={() => setEditing((v) => !v)}>
                {editing ? 'Close editor' : 'Edit'}
              </Button>
            )}
            {can(session, 'appointment_add') && (
              <Button onClick={() => navigate(`/appointments/create?doctor=${doctor._id}`)}>
                Book an appointment
              </Button>
            )}
          </>
        }
      />

      <Link to="/doctors" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to doctors
      </Link>

      {editing && canUpdate ? (
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Edit doctor</h2>
          <DoctorForm
            initialDoctor={doctor}
            submitLabel="Save changes"
            onSubmit={onSave}
            submitting={saving}
            error={saveError}
            onCancel={() => {
              setEditing(false)
              setSaveError(null)
            }}
          />
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-5">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ['Department', doctor.department],
                ['Qualification', doctor.specialist],
                ['Email', doctor.email],
                ['Phone', doctor.phone],
                ['Address', doctor.address],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </dt>
                <dd className="mt-0.5 text-sm">
                  {value ?? <span className="text-muted-foreground/60">—</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <section aria-labelledby="recent-appts">
        <h2 id="recent-appts" className="text-lg font-semibold">
          Recent appointments
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            last {detail.recentAppointments.length}
          </span>
        </h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-border bg-card">
          {detail.recentAppointments.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No appointments yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
                  <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">Time</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Patient</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {detail.recentAppointments.map((a) => (
                  <tr key={a._id} className="border-b border-border/60 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3">{a.date}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums sm:table-cell">{a.timeSlot}</td>
                    <td className="px-4 py-3">
                      <Link
                        to={a.patientName === 'Removed' ? '#' : `/patients/${a.patientId}`}
                        className={a.patientName === 'Removed' ? 'text-muted-foreground' : 'underline-offset-2 hover:underline'}
                        onClick={(e) => a.patientName === 'Removed' && e.preventDefault()}
                      >
                        {a.patientName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 capitalize">{a.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={deleteOpen}
        title={`Delete ${doctor.name}?`}
        message="The doctor record is deleted permanently. Clinical modules need at least one doctor on file."
        confirmLabel="Delete doctor"
        onConfirm={onDelete}
        onCancel={() => {
          setDeleteOpen(false)
          setDeleteError(null)
        }}
        busy={deleting}
      />
      {deleteError && (
        <p role="alert" className="text-sm text-destructive">
          {deleteError}
        </p>
      )}
    </div>
  )
}

export default DoctorProfilePage
