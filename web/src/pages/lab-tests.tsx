import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiRequestError } from '@/lib/api'
import { can, useAuth } from '@/auth/auth-context'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Textarea } from '@/components/ui/text-area'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { LabCategoriesResponse, LabCategory } from '@/types'

interface Draft {
  name: string
  description: string
  referenceValue: string
}

export function LabTestsPage() {
  const { session } = useAuth()
  const [data, setData] = useState<LabCategoriesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ mode: 'create' | 'edit'; id?: string; draft: Draft } | null>(null)
  const [formError, setFormError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<{ id: string; name: string; message: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  function refresh() {
    api.get<LabCategoriesResponse>('/lab-categories').then(
      (d) => {
        setData(d)
        setError(null)
      },
      (e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load.'),
    )
  }

  useEffect(refresh, [])

  const canAdd = can(session, 'lab_test_add')
  const canUpdate = can(session, 'lab_test_update')
  const canDelete = can(session, 'lab_test_delete')

  async function submit() {
    if (!editing) return
    setSaving(true)
    setFormError(null)
    const body = {
      name: editing.draft.name.trim(),
      description: editing.draft.description.trim() || undefined,
      referenceValue: editing.draft.referenceValue.trim() || undefined,
    }
    try {
      if (editing.mode === 'create') await api.post<LabCategory>('/lab-categories', body)
      else await api.put<LabCategory>(`/lab-categories/${editing.id}`, body)
      setEditing(null)
      refresh()
    } catch (e) {
      setFormError(e)
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!confirm) return
    setDeleting(true)
    try {
      await api.delete(`/lab-categories/${confirm.id}`)
      setConfirm(null)
      refresh()
    } catch (e) {
      setConfirm((c) => (c ? { ...c, message: e instanceof Error ? e.message : 'Deletion failed.' } : c))
      setDeleting(false)
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader
        title="Lab test catalogue"
        description="Names and reference values technicians report against."
        actions={
          <>
            <Link to="/laboratory">
              <Button variant="outline">Lab requests</Button>
            </Link>
            {canAdd && (
              <Button
                onClick={() => {
                  setFormError(null)
                  setEditing({ mode: 'create', draft: { name: '', description: '', referenceValue: '' } })
                }}
              >
                Add test
              </Button>
            )}
          </>
        }
      />

      {error ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          <p>{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={refresh}>
            Try again
          </Button>
        </div>
      ) : !data ? (
        <div aria-hidden className="rounded-lg border border-border bg-card p-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm font-medium">No tests in the catalogue yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">Test</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Reference value</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Requested</th>
                {(canUpdate || canDelete) && <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => {
                const requests = data.usage.find((u) => u.id === c._id)?.requests ?? 0
                return (
                  <tr key={c._id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                    <td className="px-4 py-3">
                      <p className="font-medium">{c.name}</p>
                      {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{c.referenceValue || '—'}</td>
                    <td className="px-4 py-3">{requests}</td>
                    {(canUpdate || canDelete) && (
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {canUpdate && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setFormError(null)
                              setEditing({
                                mode: 'edit',
                                id: c._id,
                                draft: { name: c.name, description: c.description ?? '', referenceValue: c.referenceValue ?? '' },
                              })
                            }}
                          >
                            Edit
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() =>
                              setConfirm({
                                id: c._id,
                                name: c.name,
                                message: requests > 0
                                  ? `Remove “${c.name}” from the catalogue?`
                                  : `Remove “${c.name}” from the catalogue?`,
                              })
                            }
                          >
                            Delete
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16" role="dialog" aria-modal aria-label={editing.mode === 'create' ? 'Add test' : 'Edit test'}>
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg">
            <h2 className="text-lg font-semibold">{editing.mode === 'create' ? 'Add test' : 'Edit test'}</h2>
            <form className="mt-4 flex flex-col gap-4" noValidate onSubmit={(e) => e.preventDefault()}>
              <div className="space-y-1.5">
                <Label htmlFor="lab-name">Name</Label>
                <Input
                  id="lab-name"
                  maxLength={100}
                  value={editing.draft.name}
                  onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, name: e.target.value } })}
                  aria-describedby={
                    formError instanceof ApiRequestError && formError.fields?.name ? 'lab-name-err' : undefined
                  }
                />
                {formError instanceof ApiRequestError && formError.fields?.name && (
                  <p id="lab-name-err" className="text-xs text-destructive">{formError.fields.name}</p>
                )}
                {!(formError instanceof ApiRequestError) && formError instanceof Error && (
                  <p role="alert" className="text-xs text-destructive">{formError.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lab-desc">Description</Label>
                <Textarea
                  id="lab-desc"
                  rows={2}
                  maxLength={100}
                  value={editing.draft.description}
                  onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, description: e.target.value } })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lab-ref">Reference value</Label>
                <Input
                  id="lab-ref"
                  maxLength={1000}
                  placeholder="13.5 to 17.5 g/dL"
                  value={editing.draft.referenceValue}
                  onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, referenceValue: e.target.value } })}
                />
                <p className="text-xs text-muted-foreground">Shipped on each row at request time; edits never back-rewrite results.</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={saving}>
                  {saving ? 'Saving…' : editing.mode === 'create' ? 'Add test' : 'Save changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm ? `Delete ${confirm.name}` : ''}
        message={confirm?.message ?? ''}
        onCancel={() => setConfirm(null)}
        onConfirm={remove}
        busy={deleting}
      />
    </div>
  )
}

export default LabTestsPage
