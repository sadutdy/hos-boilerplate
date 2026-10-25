import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiRequestError } from '@/lib/api'
import { can, useAuth } from '@/auth/auth-context'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input, Label } from '@/components/ui/input'
import { Textarea } from '@/components/ui/text-area'
import { PatientForm, toRequest, type PatientFormValues } from '@/patients/patient-form'
import { formatDate, toDateInputValue, truncate } from '@/lib/format'
import type { MedicalHistoryEntry, Patient, PatientDetail } from '@/types'

const emptyEntry = { title: '', description: '', date: '' }

export function PatientProfilePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()

  const [detail, setDetail] = useState<PatientDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<unknown>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // History state lives here so entries can update without refetching the patient.
  const [history, setHistory] = useState<MedicalHistoryEntry[]>([])

  useEffect(() => {
    let cancelled = false
    api.get<PatientDetail>(`/patients/${id}`).then(
      (d) => {
        if (cancelled) return
        setDetail(d)
        setHistory(d.history)
        setLoadError(null)
      },
      (e) => !cancelled && setLoadError(e instanceof Error ? e.message : 'Failed to load'),
    )
    return () => {
      cancelled = true
    }
  }, [id])

  async function onSave(values: PatientFormValues) {
    setSaving(true)
    setSaveError(null)
    try {
      const patient = await api.put<Patient>(`/patients/${id}`, toRequest(values))
      setDetail((d) => (d ? { ...d, patient } : d))
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
      await api.delete(`/patients/${id}`)
      navigate('/patients', { replace: true })
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Could not delete. Try again.')
      setDeleting(false)
    }
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        {loadError}
        <div className="mt-3">
          <Link to="/patients" className="text-sm font-medium text-primary hover:underline">
            Back to patients
          </Link>
        </div>
      </div>
    )
  }

  if (!detail) return <ProfileSkeleton />

  const patient = detail.patient
  const isEditing = editing && can(session, 'patient_update')

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={patient.name}
        description={
          <>
            <span className="font-mono">{patient.patientId}</span>
            {patient.doctorName ? <> — doctor: {patient.doctorName}</> : null}
          </>
        }
        actions={
          <>
            {can(session, 'patient_update') && (
              <Button variant="outline" onClick={() => setEditing((v) => !v)}>
                {editing ? 'Close editor' : 'Edit'}
              </Button>
            )}
            {can(session, 'patient_delete') && (
              <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                Delete
              </Button>
            )}
          </>
        }
      />

      <Link to="/patients" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to patients
      </Link>

      {isEditing ? (
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Edit details</h2>
          <PatientForm
            initialPatient={patient}
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
        <PatientSummary patient={patient} />
      )}

      <HistorySection
        patientId={detail.patient._id}
        history={history}
        setHistory={setHistory}
      />

      <ConfirmDialog
        open={deleteOpen}
        title={`Delete ${patient.name}?`}
        message="The patient record is deleted permanently. Records that reference them (appointments, invoices) will show as “Unknown patient”. This cannot be undone."
        confirmLabel="Delete patient"
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

function PatientSummary({ patient }: { patient: Patient }) {
  const rows: [string, string | null | undefined][] = [
    ['Age', patient.age != null ? String(patient.age) : null],
    ['Sex', patient.sex ? patient.sex.charAt(0).toUpperCase() + patient.sex.slice(1) : null],
    ['Blood group', patient.bloodGroup || null],
    ['Date of birth', formatDate(patient.dateOfBirth)],
    ['Father / guardian', patient.fatherName || null],
    ['Phone', patient.phone || null],
    ['Email', patient.email || null],
    ['Address', patient.address || null],
    ['Registered', formatDate(patient.addDate)],
  ]

  return (
    <div className="flex flex-wrap items-start gap-6 rounded-lg border border-border bg-card p-5">
      <div
        aria-hidden
        className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground"
      >
        {patient.name.slice(0, 2).toUpperCase()}
      </div>
      <dl className="grid flex-1 grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([label, value]) => (
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
  )
}

function HistorySection({
  patientId,
  history,
  setHistory,
}: {
  patientId: string
  history: MedicalHistoryEntry[]
  setHistory: (h: MedicalHistoryEntry[]) => void
}) {
  const { session } = useAuth()
  const allowed = can(session, 'patient_medical_history')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(emptyEntry)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<unknown>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(emptyEntry)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [busyDeleteId, setBusyDeleteId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const entryToDelete = history.find((h) => h._id === deleteId)

  async function addEntry(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)
    try {
      const doc = await api.post<MedicalHistoryEntry>('/medical-history', {
        patientId,
        title: form.title.trim(),
        description: form.description.trim(),
        date: form.date || null,
      })
      const entry = doc // POST returns the entry with snapshot fields
      setHistory([entry, ...history])
      setAdding(false)
      setForm(emptyEntry)
    } catch (e) {
      setFormError(e)
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(entry: MedicalHistoryEntry) {
    setEditId(entry._id)
    setEditForm({
      title: entry.title,
      description: entry.description,
      date: toDateInputValue(entry.date),
    })
  }

  async function saveEntry() {
    if (!editId) return
    setEditSubmitting(true)
    setFormError(null)
    try {
      const doc = await api.put<MedicalHistoryEntry>(`/medical-history/${editId}`, {
        title: editForm.title,
        description: editForm.description,
        date: editForm.date || null,
      })
      setHistory(history.map((h) => (h._id === editId ? mergeEntry(h, doc) : h)))
      setEditId(null)
    } catch (e) {
      setFormError(e)
    } finally {
      setEditSubmitting(false)
    }
  }

  async function deleteEntry() {
    if (!deleteId) return
    setBusyDeleteId(deleteId)
    setDeleteError(null)
    try {
      await api.delete(`/medical-history/${deleteId}`)
      setHistory(history.filter((h) => h._id !== deleteId))
      setDeleteId(null)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Could not delete. Try again.')
    } finally {
      setBusyDeleteId(null)
    }
  }

  return (
    <section aria-labelledby="history-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 id="history-heading" className="text-lg font-semibold">
          Medical history
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {history.length}
          </span>
        </h2>
        {allowed && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAdding((v) => !v)
              setEditId(null)
              setForm(emptyEntry)
              setFormError(null)
            }}
          >
            {adding ? 'Close' : 'Add entry'}
          </Button>
        )}
      </div>

      {adding && (
        <form
          className="rounded-md border border-accent bg-accent/30 p-4"
          onSubmit={(e) => e.preventDefault()}
        >
          <EntryFields
            values={form}
            onValues={(v) => setForm(v)}
            prefix="hh-new"
            error={formError}
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAdding(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={addEntry} disabled={submitting}>
              {submitting ? 'Saving…' : 'Add entry'}
            </Button>
          </div>
        </form>
      )}

      {deleteError && (
        <p role="alert" className="text-sm text-destructive">
          {deleteError}
        </p>
      )}

      {history.length === 0 && !adding && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm font-medium">No medical history yet.</p>
          {allowed && (
            <p className="mt-1 text-sm text-muted-foreground" hidden={!allowed}>
              Use “Add entry” to record the first allergy, condition, or note.
            </p>
          )}
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {history.map((entry) =>
          editId === entry._id && allowed ? (
            <li key={`edit-${entry._id}`}>
              <form
                className="rounded-md border border-accent bg-accent/30 p-4"
                onSubmit={(e) => e.preventDefault()}
              >
                <EntryFields
                  key={entry._id}
                  values={editForm}
                  onValues={(v) => setEditForm(v)}
                  prefix={`hh-${entry._id}`}
                  error={formError}
                />
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setEditId(null)} disabled={editSubmitting}>
                    Cancel
                  </Button>
                  <Button onClick={saveEntry} disabled={editSubmitting}>
                    {editSubmitting ? 'Saving…' : 'Save changes'}
                  </Button>
                </div>
              </form>
            </li>
          ) : (
            <li key={entry._id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">{entry.title}</h3>
                {entry.date && (
                  <p className="text-xs text-muted-foreground">{formatDate(entry.date)}</p>
                )}
              </div>
              <p className="mt-1.5 whitespace-pre-line text-sm text-foreground/90">
                {entry.description}
              </p>
              {allowed && (
                <div className="mt-2 flex justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(entry)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      setDeleteId(entry._id)
                      setDeleteError(null)
                    }}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </li>
          ),
        )}
      </ul>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title={entryToDelete ? `Delete “${truncate(entryToDelete.title, 40)}”?` : 'Delete entry?'}
        message="Journal entries are deleted permanently; the medical record for this patient cannot be recovered."
        confirmLabel="Delete"
        onConfirm={deleteEntry}
        onCancel={() => {
          setDeleteId(null)
          setDeleteError(null)
        }}
        busy={Boolean(busyDeleteId)}
      />
    </section>
  )
}

function mergeEntry(existing: MedicalHistoryEntry, updated: MedicalHistoryEntry): MedicalHistoryEntry {
  return { ...existing, ...updated }
}

function EntryFields({
  values,
  onValues,
  prefix,
  error,
}: {
  values: { title: string; description: string; date: string }
  onValues: (v: { title: string; description: string; date: string }) => void
  prefix: string
  error: unknown
}) {
  const fieldErrorAt = (key: 'title' | 'description') =>
    error instanceof ApiRequestError ? (error.fields?.[key] ?? null) : null

  const noTitle = fieldErrorAt('title')
  const noDesc = fieldErrorAt('description')

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1.5">
          <Label htmlFor={`${prefix}-title`}>Title</Label>
          <Input
            id={`${prefix}-title`}
            required
            maxLength={100}
            placeholder="e.g. Penicillin allergy"
            value={values.title}
            onChange={(e) => onValues({ ...values, title: e.target.value })}
            aria-invalid={Boolean(noTitle)}
            aria-describedby={noTitle ? `${prefix}-title-error` : undefined}
          />
          {noTitle && (
            <p id={`${prefix}-title-error`} className="text-xs text-destructive">
              {noTitle}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${prefix}-date`}>Date</Label>
          <Input
            id={`${prefix}-date`}
            type="date"
            className="sm:w-40"
            value={values.date}
            onChange={(e) => onValues({ ...values, date: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefix}-description`}>Details</Label>
        <Textarea
          id={`${prefix}-description`}
          rows={3}
          required
          maxLength={10000}
          placeholder="What happened, severity, treatment…"
          value={values.description}
          onChange={(e) => onValues({ ...values, description: e.target.value })}
          aria-invalid={Boolean(noDesc)}
          aria-describedby={noDesc ? `${prefix}-description-error` : undefined}
        />
        {noDesc && (
          <p id={`${prefix}-description-error`} className="text-xs text-destructive">
            {noDesc}
          </p>
        )}
      </div>
      {error instanceof Error && !(error instanceof ApiRequestError) && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-5">
      <div className="h-8 w-64 animate-pulse rounded bg-muted" />
      <div className="h-40 animate-pulse rounded-lg bg-muted" />
      <div className="h-10 w-48 animate-pulse rounded bg-muted" />
      <div className="h-32 animate-pulse rounded-lg bg-muted" />
    </div>
  )
}

export default PatientProfilePage
