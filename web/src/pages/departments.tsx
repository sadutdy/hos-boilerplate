import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { can, useAuth } from '@/auth/auth-context'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input, Label } from '@/components/ui/input'
import { Textarea } from '@/components/ui/text-area'
import { DialogShell } from '@/pages/beds-board'
import type { Department, DepartmentsResponse } from '@/types'

export function DepartmentsPage() {
  const { session } = useAuth()
  const [data, setData] = useState<DepartmentsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)
  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  const [addOpen, setAddOpen] = useState(false)
  const [renaming, setRenaming] = useState<Department | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameResult, setRenameResult] = useState<string | null>(null)
  const [deleteDept, setDeleteDept] = useState<Department | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [adoptMessage, setAdoptMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.get<DepartmentsResponse>('/departments').then(
      (d) => {
        if (cancelled) return
        setData(d)
        setError(null)
        setLoading(false)
      },
      (e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load')
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [nonce])

  async function adopt() {
    setBusy(true)
    setActionError(null)
    try {
      const out = await api.post<{ created: number; message?: string }>('/departments/adopt')
      setAdoptMessage(
        out.created === 0
          ? (out.message ?? 'Nothing to adopt.')
          : `Added ${out.created} department(s) already in use by doctors.`,
      )
      refresh()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not adopt. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function rename() {
    if (!renaming) return
    setBusy(true)
    setActionError(null)
    try {
      const out = await api.put<Department & { movedDoctors?: number }>(`/departments/${renaming._id}`, {
        name: renameValue,
        description: renaming.description ?? '',
      })
      setRenameResult(
        out.movedDoctors
          ? `Renamed — moved ${out.movedDoctors} doctor record(s).`
          : 'Renamed (no doctors carried this name).',
      )
      setRenaming(null)
      refresh()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not rename. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!deleteDept) return
    setBusy(true)
    setActionError(null)
    try {
      await api.delete(`/departments/${deleteDept._id}`)
      setDeleteDept(null)
      refresh()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not delete. Try again.')
      setDeleteDept(null)
    } finally {
      setBusy(false)
    }
  }

  const canAdd = can(session, 'department_add')
  const canUpdate = can(session, 'department_update')
  const canDelete = can(session, 'department_delete')

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Departments"
        description="Doctor departments are free text — adopt, rename (doctors carry along), or delete empty ones."
        actions={canAdd ? <Button onClick={() => setAddOpen(true)}>Add department</Button> : null}
      />

      {error && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          <p>{error}</p>
        </div>
      )}

      {!error && loading && <div aria-hidden className="h-48 animate-pulse rounded-lg bg-muted" />}

      {adoptMessage && (
        <p role="status" className="text-sm text-muted-foreground">
          {adoptMessage}
        </p>
      )}
      {renameResult && (
        <p role="status" className="text-sm text-muted-foreground">
          {renameResult}
        </p>
      )}

      {data && data.unlisted.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
          <p className="text-sm font-medium">
            {data.unlisted.length} department name{data.unlisted.length === 1 ? '' : 's'} used by doctors but not on the list:{' '}
            <span className="text-muted-foreground">{data.unlisted.join(', ')}</span>
          </p>
          {canAdd && (
            <Button variant="outline" size="sm" className="mt-2" onClick={adopt} disabled={busy}>
              {busy ? 'Adopting…' : 'Adopt all as departments'}
            </Button>
          )}
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">Department</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">Description</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Doctors</th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((dept) => {
                const doctors = data.usage.find((u) => u.id === dept._id)?.doctors ?? 0
                return (
                  <tr key={dept._id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                    <td className="px-4 py-3 font-medium">{dept.name}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{dept.description || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{doctors}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {canUpdate && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRenaming(dept)
                              setRenameValue(dept.name)
                              setActionError(null)
                            }}
                          >
                            Rename
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              setDeleteDept(dept)
                              setActionError(null)
                            }}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && data.items.length === 0 && !loading && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm font-medium">No departments yet.</p>
          {data.unlisted.length === 0 && canAdd && (
            <p className="mt-1 text-sm text-muted-foreground">Add one, or let “Adopt” create them from doctor records.</p>
          )}
        </div>
      )}

      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      )}

      {addOpen && (
        <AddDepartmentDialog
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false)
            refresh()
          }}
        />
      )}

      {renaming && (
        <DialogShell title={`Rename ${renaming.name}`} onClose={() => setRenaming(null)}>
          <div className="space-y-1.5">
            <Label htmlFor="dept-rename">New name</Label>
            <Input
              id="dept-rename"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              maxLength={100}
              required
            />
            <p className="text-xs text-muted-foreground">
              Doctors currently carrying this text move to the new name in one transaction.
            </p>
          </div>
          {actionError && (
            <p role="alert" className="mt-3 text-sm text-destructive">{actionError}</p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRenaming(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={rename} disabled={busy || !renameValue.trim()}>
              {busy ? 'Renaming…' : 'Rename'}
            </Button>
          </div>
        </DialogShell>
      )}

      <ConfirmDialog
        open={Boolean(deleteDept)}
        title={deleteDept ? `Delete ${deleteDept.name}?` : 'Delete department?'}
        message="Deletion is blocked while doctors carry this department name. Rename the doctors out first, or keep it."
        confirmLabel="Delete department"
        onConfirm={onDelete}
        onCancel={() => {
          setDeleteDept(null)
          setActionError(null)
        }}
        busy={busy}
      />
    </div>
  )
}

function AddDepartmentDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await api.post<Department>('/departments', { name, description })
      onSaved()
      setName('')
      setDescription('')
    } catch (e) {
      setError(e)
    } finally {
      setSubmitting(false)
    }
  }

  const fieldErr =
    error && typeof error === 'object' && 'fields' in error
      ? (error as { fields?: Record<string, string> }).fields?.name ?? null
      : null

  return (
    <DialogShell title="Add department" onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => e.preventDefault()} noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="dept-name">Name</Label>
          <Input
            id="dept-name"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={Boolean(fieldErr)}
          />
          {fieldErr && <p className="text-xs text-destructive">{fieldErr}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dept-desc">Description</Label>
          <Textarea id="dept-desc" rows={2} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !name.trim()}>
            {submitting ? 'Adding…' : 'Add department'}
          </Button>
        </div>
      </form>
    </DialogShell>
  )
}

export default DepartmentsPage
