import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiRequestError } from '@/lib/api'
import { can, useAuth } from '@/auth/auth-context'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Textarea } from '@/components/ui/text-area'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { MedicineCategoriesResponse, MedicineCategory } from '@/types'

interface CatDraft {
  name: string
  description: string
}

export function MedicineCategoriesPage() {
  const { session } = useAuth()
  const [data, setData] = useState<MedicineCategoriesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ mode: 'create' | 'edit'; id?: string; draft: CatDraft } | null>(null)
  const [formError, setFormError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<{ id: string; name: string; message: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  function refresh() {
    api.get<MedicineCategoriesResponse>('/medicine-categories').then(
      (d) => {
        setData(d)
        setError(null)
      },
      (e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load.'),
    )
  }

  useEffect(refresh, [])

  const canAdd = can(session, 'medicine_add')
  const canUpdate = can(session, 'medicine_update')
  const canDelete = can(session, 'medicine_delete')

  const usageOf = (id: string) => data?.usage.find((u) => u.id === id)?.medicines ?? 0

  async function submit() {
    if (!editing) return
    setSaving(true)
    setFormError(null)
    const body = { name: editing.draft.name.trim(), description: editing.draft.description.trim() || undefined }
    try {
      if (editing.mode === 'create') await api.post<MedicineCategory>('/medicine-categories', body)
      else await api.put<MedicineCategory>(`/medicine-categories/${editing.id}`, body)
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
      await api.delete(`/medicine-categories/${confirm.id}`)
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
        title="Medicine categories"
        description="Optional buckets for the catalogue — never rewritten onto medicines."
        actions={
          <>
            <Link to="/medicines">
              <Button variant="outline">Catalogue</Button>
            </Link>
            {canAdd && (
              <Button
                onClick={() => {
                  setFormError(null)
                  setEditing({ mode: 'create', draft: { name: '', description: '' } })
                }}
              >
                Add category
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
          <p className="text-sm font-medium">No categories defined — medicines sit in “Unlisted”.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Description</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Medicines</th>
                {(canUpdate || canDelete) && <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c._id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.description || '—'}</td>
                  <td className="px-4 py-3">{usageOf(c._id)}</td>
                  {(canUpdate || canDelete) && (
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {canUpdate && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setFormError(null)
                            setEditing({ mode: 'edit', id: c._id, draft: { name: c.name, description: c.description ?? '' } })
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
                              message: `Remove the “${c.name}” category?`,
                            })
                          }
                        >
                          Delete
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16" role="dialog" aria-modal aria-label={editing.mode === 'create' ? 'Add category' : 'Edit category'}>
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg">
            <h2 className="text-lg font-semibold">{editing.mode === 'create' ? 'Add category' : 'Edit category'}</h2>
            <form className="mt-4 flex flex-col gap-4" noValidate onSubmit={(e) => e.preventDefault()}>
              <div className="space-y-1.5">
                <Label htmlFor="cat-name">Name</Label>
                <Input
                  id="cat-name"
                  maxLength={100}
                  value={editing.draft.name}
                  onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, name: e.target.value } })}
                  aria-describedby={
                    formError instanceof ApiRequestError && formError.fields?.name ? 'cat-name-err' : undefined
                  }
                />
                {formError instanceof ApiRequestError && formError.fields?.name && (
                  <p id="cat-name-err" className="text-xs text-destructive">{formError.fields.name}</p>
                )}
                {!(formError instanceof ApiRequestError) && formError instanceof Error && (
                  <p role="alert" className="text-xs text-destructive">{formError.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-desc">Description</Label>
                <Textarea
                  id="cat-desc"
                  rows={2}
                  maxLength={100}
                  value={editing.draft.description}
                  onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, description: e.target.value } })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={saving}>
                  {saving ? 'Saving…' : editing.mode === 'create' ? 'Add category' : 'Save changes'}
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

export default MedicineCategoriesPage
