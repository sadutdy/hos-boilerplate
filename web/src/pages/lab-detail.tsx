import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiRequestError } from '@/lib/api'
import { can, useAuth } from '@/auth/auth-context'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Textarea } from '@/components/ui/text-area'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { dateToInput } from '@/clinic/prescription-form'
import { formatDateTime } from '@/lib/format'
import type { Doctor, Lab, LabCategory, LabTest } from '@/types'

function StatusChip({ status }: { status: Lab['status'] }) {
  return (
    <span
      className={
        status === 'reported'
          ? 'inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
          : status === 'partial'
            ? 'inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
            : 'inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
      }
    >
      {status}
    </span>
  )
}

interface EditDraft {
  date: string
  doctorId: string
  addTestIds: Set<string>
  removed: Set<string>
}

export function LabDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()

  const [data, setData] = useState<Lab | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [resultsError, setResultsError] = useState<string | null>(null)
  const [resultsFlash, setResultsFlash] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // result inputs: key = test key (subdoc _id), value = typed draft
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [cats, setCats] = useState<{ id: string; name: string; referenceValue?: string | null }[]>([])
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    setData(null)
    api.get<Lab>(`/labs/${id}`).then(
      (d) => {
        if (cancelled) return
        setData(d)
      },
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load.'),
    )
    return () => {
      cancelled = true
    }
  }, [id])

  const canEdit = can(session, 'lab_test_update')
  const canDelete = can(session, 'lab_test_delete')

  function draftFor(test: LabTest): string {
    if (!test.result) return drafts[test._id] ?? ''
    return test.result
  }

  function setDraft(test: LabTest, value: string) {
    setDrafts((d) => ({ ...d, [test._id]: value }))
  }

  async function saveResults() {
    if (!data) return
    const results: Record<string, string> = {}
    for (const t of data.tests) {
      if (drafts[t._id] !== undefined) results[t._id] = drafts[t._id]
    }
    setSaving(true)
    setResultsError(null)
    try {
      const updated = await api.post<Lab>(`/labs/${data._id}/results`, { results })
      setData((prev) => (prev ? { ...prev, ...updated } : updated))
      setDrafts({})
      setResultsFlash(`Results saved — request is ${updated.status}.`)
    } catch (e) {
      setResultsError(e instanceof ApiRequestError ? e.message : e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!data) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await api.delete(`/labs/${data._id}`)
      navigate('/laboratory', { state: { deleted: true } })
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Deletion failed.')
      setDeleting(false)
    }
  }

  function openEdit() {
    if (!data) return
    api.get<{ items: Doctor[] }>('/doctors?limit=100').then((d) => setDoctors(d.items), () => setDoctors([]))
    api.get<{ items: LabCategory[] }>('/lab-categories').then(
      (d) => setCats(d.items.map((c) => ({ id: c._id, name: c.name, referenceValue: c.referenceValue }))),
      () => void 0,
    )
    setEditDraft({
      date: dateToInput(data.date),
      doctorId: data.doctorId ?? '',
      addTestIds: new Set(),
      removed: new Set(),
    })
    setEditError(null)
    setEditing(true)
  }

  async function saveEdit() {
    if (!data || !editDraft) return
    setSaving(true)
    setEditError(null)
    const body: Record<string, unknown> = {
      date: new Date(editDraft.date).toISOString(),
      doctorId: editDraft.doctorId || null,
    }
    if (editDraft.addTestIds.size) body.addTestIds = [...editDraft.addTestIds]
    if (editDraft.removed.size) body.removeTestIds = [...editDraft.removed]
    try {
      const updated = await api.put<Lab>(`/labs/${data._id}`, body)
      setData((prev) => (prev ? { ...prev, ...updated } : updated))
      // clear result drafts for removed tests
      setDrafts((d) => {
        const next: Record<string, string> = {}
        for (const t of updated.tests) if (d[t._id] !== undefined) next[t._id] = d[t._id]
        return next
      })
      setEditing(false)
    } catch (e) {
      setEditError(e instanceof ApiRequestError ? e.message : e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Lab request" />
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
        <PageHeader title="Lab request" />
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
          <div className="mt-4 h-40 animate-pulse rounded bg-muted" />
        </div>
      </div>
    )
  }

  const pending = data.tests.filter((t) => !t.result).length
  const anyDraft = data.tests.some((t) => !t.result && (drafts[t._id] ?? '') !== '')

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader
        title={editing ? 'Edit lab request' : 'Lab request'}
        description={editing ? undefined : `${formatDateTime(data.date)} · ${pending} of ${data.tests.length} tests pending`}
        actions={
          !editing ? (
            <div className="flex gap-2">
              {canEdit && (
                <Button variant="outline" onClick={openEdit}>
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
          ) : null
        }
      />

      {editing && editDraft ? (
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lab-date">Date</Label>
              <Input
                id="lab-date"
                type="date"
                value={editDraft.date}
                onChange={(e) => setEditDraft({ ...editDraft, date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lab-doctor">Requesting doctor</Label>
              <select
                id="lab-doctor"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={editDraft.doctorId}
                onChange={(e) => setEditDraft({ ...editDraft, doctorId: e.target.value })}
              >
                <option value="">None</option>
                {doctors.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4">
            <Label>Tests — {Math.max(0, data.tests.length - editDraft.removed.size + editDraft.addTestIds.size)} after changes</Label>
            <ul className="mt-2 flex flex-col divide-y divide-border/60 rounded-md border border-border/60" aria-label="Tests on this request">
              {data.tests.map((t) => (
                <li key={t._id} className="flex items-baseline justify-between gap-3 px-3 py-2">
                  <span className={editDraft.removed.has(t._id) ? 'text-muted-foreground line-through' : ''}>
                    {t.name} {t.referenceValue ? <span className="text-xs text-muted-foreground">({t.referenceValue})</span> : null}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setEditDraft((d) => {
                        const removed = new Set(d!.removed)
                        if (removed.has(t._id)) removed.delete(t._id)
                        else removed.add(t._id)
                        return { ...d!, removed }
                      })
                    }
                  >
                    {editDraft.removed.has(t._id) ? 'Keep' : 'Remove'}
                  </Button>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 space-y-1.5">
            <Label>Attach tests</Label>
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border/60 p-2" aria-label="Catalogue attach">
              {cats
                .filter((c) => !data.tests.some((t) => t.labCategoryId === c.id && !editDraft.removed.has(String(t._id))))
                .map((c) => {
                  const attached = editDraft.addTestIds.has(c.id)
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        className={`w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent/50 ${attached ? 'bg-accent/60' : ''}`}
                        aria-pressed={attached}
                        onClick={() =>
                          setEditDraft((d) => {
                            const next = new Set(d!.addTestIds)
                            if (next.has(c.id)) next.delete(c.id)
                            else next.add(c.id)
                            return { ...d!, addTestIds: next }
                          })
                        }
                      >
                        <span className="font-medium">{c.name}</span>
                        {c.referenceValue ? <span className="ml-2 text-xs text-muted-foreground">{c.referenceValue}</span> : null}
                      </button>
                    </li>
                  )
                })}
            </ul>
          </div>

          {editError && <p role="alert" className="mt-3 text-sm text-destructive">{editError}</p>}

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-3 flex items-center gap-3">
              <StatusChip status={data.status} />
              {data.reportedAt && data.status === 'reported' && (
                <span className="text-xs text-muted-foreground">fully reported {formatDateTime(data.reportedAt)}</span>
              )}
            </div>
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-[9rem_1fr]">
              <dt className="text-sm text-muted-foreground">Patient</dt>
              <dd className="text-sm">
                <Link to={`/patients/${data.patientId}`} className="underline underline-offset-2">
                  {data.patientName || data.patientId}
                </Link>{' '}
                <span className="font-mono text-xs text-muted-foreground">{data.patientCode}</span>
              </dd>
              <dt className="text-sm text-muted-foreground">Doctor</dt>
              <dd className="text-sm">{data.doctorName || 'No doctor'}</dd>
              {data.patientPhone && (
                <>
                  <dt className="text-sm text-muted-foreground">Snapshot phone</dt>
                  <dd className="text-sm">{data.patientPhone}</dd>
                </>
              )}
              {data.patientAddress && (
                <>
                  <dt className="text-sm text-muted-foreground">Snapshot address</dt>
                  <dd className="text-sm">{data.patientAddress}</dd>
                </>
              )}
            </dl>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5 font-medium">Test</th>
                  <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Reference</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Result</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.tests.map((t) => (
                  <tr key={t._id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-medium">{t.name}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{t.referenceValue || '—'}</td>
                    <td className="px-4 py-3">
                      <Textarea
                        rows={2}
                        maxLength={1000}
                        aria-label={`Result for ${t.name}`}
                        placeholder={t.result ? undefined : 'Report a value…'}
                        value={draftFor(t)}
                        onChange={(e) => setDraft(t, e.target.value)}
                      />
                      {t.reportedAt && (
                        <span className="mt-1 block text-xs text-muted-foreground">reported {formatDateTime(t.reportedAt)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={t.result ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canEdit && (
            <div className="flex items-center justify-end gap-3">
              {resultsError && <p role="alert" className="text-sm text-destructive">{resultsError}</p>}
              {resultsFlash && <p className="text-sm text-muted-foreground">{resultsFlash}</p>}
              <Button onClick={saveResults} disabled={saving || !anyDraft}>
                {saving ? 'Saving…' : 'Save results'}
              </Button>
            </div>
          )}
          {canEdit && (
            <p className="text-xs text-muted-foreground">
              Saving blanks never wipes an already reported test — stale-page submits are skipped.
            </p>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Delete lab request"
        message={
          deleteError ??
          `Delete this ${data.tests.length}-test request for ${data.patientName ?? 'this patient'}? Results are gone with it.`
        }
        onCancel={() => setConfirmOpen(false)}
        onConfirm={remove}
        busy={deleting}
      />
    </div>
  )
}

export default LabDetailPage
