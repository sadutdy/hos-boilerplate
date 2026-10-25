import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { can, useAuth } from '@/auth/auth-context'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PrescriptionForm, toPrescriptionRequest, type PrescriptionFormValues } from '@/clinic/prescription-form'
import { formatDateTime } from '@/lib/format'
import type { Prescription } from '@/types'

function toFormValues(p: Prescription): PrescriptionFormValues {
  return {
    patientId: p.patientId,
    patientName: p.patientName ?? '',
    doctorId: p.doctorId,
    date: p.date.slice(0, 10),
    symptom: p.symptom ?? '',
    advice: p.advice ?? '',
    note: p.note ?? '',
    validity: p.validity ?? '',
    items: p.items.map((it) => ({ ...it })),
  }
}

export function PrescriptionDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useAuth()

  const [data, setData] = useState<Prescription | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState((location.state as { editing?: boolean } | null)?.editing === true)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<unknown>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    setData(null)
    api.get<Prescription>(`/prescriptions/${id}`).then(
      (d) => !cancelled && setData(d),
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load.'),
    )
    return () => {
      cancelled = true
    }
  }, [id])

  const canEdit = can(session, 'prescription_update')
  const canDelete = can(session, 'prescription_delete')

  const info = useMemo(() => {
    if (!data) return null
    return [
      { label: 'Patient', node: <Link to={`/patients/${data.patientId}`} className="underline underline-offset-2">{data.patientName ?? data.patientId}</Link> },
      { label: 'Doctor', node: data.doctorName ?? '—' },
      { label: 'Written', node: formatDateTime(data.date) },
      { label: 'Symptom', node: data.symptom || '—' },
      { label: 'Valid for', node: data.validity || '—' },
      { label: 'Advice', node: data.advice || '—' },
      { label: 'Note', node: data.note || '—' },
    ]
  }, [data])

  async function save(v: PrescriptionFormValues) {
    if (!data) return
    setSaving(true)
    setFormError(null)
    try {
      const updated = await api.put<Prescription>(`/prescriptions/${data._id}`, toPrescriptionRequest(v))
      setData((prev) => (prev ? { ...prev, ...updated } : updated))
      setEditing(false)
    } catch (e) {
      setFormError(e)
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!data) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await api.delete(`/prescriptions/${data._id}`)
      navigate('/prescriptions', { state: { deleted: data.patientName ?? 'Prescription' } })
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Deletion failed.')
      setDeleting(false)
    }
  }

  if (error) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Prescription" />
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          <p>{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate(-1)}>
            Go back
          </Button>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-5" aria-busy>
        <PageHeader title="Prescription" />
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
          <div className="mt-4 h-24 animate-pulse rounded bg-muted" />
        </div>
      </div>
    )
  }

  if (editing) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <PageHeader title="Edit prescription" />
        <div className="rounded-lg border border-border bg-card p-5">
          <PrescriptionForm
            initial={toFormValues(data)}
            submitLabel="Save changes"
            submitting={saving}
            error={formError}
            onCancel={() => setEditing(false)}
            onSubmit={save}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader
        title="Prescription"
        description={`Written ${formatDateTime(data.date)}`}
        actions={
          <div className="flex gap-2">
            {canEdit && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {canDelete && (
              <Button
                variant="outline"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => {
                  setConfirmOpen(true)
                  setDeleteError(null)
                }}
              >
                Delete
              </Button>
            )}
          </div>
        }
      />

      <div className="rounded-lg border border-border bg-card p-5">
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-[10rem_1fr]">
          {info?.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-sm text-muted-foreground">{row.label}</dt>
              <dd className="text-sm">{row.node}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-4 py-2.5 font-medium">Medicine</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Dosage</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Duration</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Instructions</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  No medicines recorded on this prescription.
                </td>
              </tr>
            ) : (
              data.items.map((it, i) => (
                <tr key={i} className="border-b border-border/60 first:border-0 last:border-0">
                  <td className="px-4 py-3 font-medium">
                    {it.medicineId ? (
                      <Link to="/medicines" className="underline-offset-2 hover:underline">{it.name}</Link>
                    ) : (
                      it.name
                    )}
                  </td>
                  <td className="px-4 py-3">{it.dosage || '—'}</td>
                  <td className="px-4 py-3">{it.duration || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{it.instructions || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete prescription"
        message={
          deleteError ??
          `Delete this prescription for ${data.patientName ?? 'this patient'}? The medicines stay in the catalogue.`
        }
        onCancel={() => setConfirmOpen(false)}
        onConfirm={remove}
        busy={deleting}
      />
    </div>
  )
}

export default PrescriptionDetailPage
