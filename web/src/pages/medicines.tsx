import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, ApiRequestError } from '@/lib/api'
import { can, useAuth } from '@/auth/auth-context'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useList } from '@/hooks/use-list'
import type { Medicine, MedicineCategoriesResponse, MedicineCategory } from '@/types'

interface MedicineDraft {
  name: string
  categoryId: string
  generic: string
  company: string
  effects: string
  box: string
  price: string
  sellingPrice: string
  quantity: string
  expiryDate: string
}

const emptyDraft: MedicineDraft = {
  name: '',
  categoryId: '',
  generic: '',
  company: '',
  effects: '',
  box: '',
  price: '',
  sellingPrice: '',
  quantity: '',
  expiryDate: '',
}

function draftOf(m: Medicine): MedicineDraft {
  return {
    name: m.name,
    categoryId: m.categoryId ?? '',
    generic: m.generic ?? '',
    company: m.company ?? '',
    effects: m.effects ?? '',
    box: m.box ?? '',
    price: m.price ?? '',
    sellingPrice: m.sellingPrice ?? '',
    quantity: m.quantity != null ? String(m.quantity) : '',
    expiryDate: m.expiryDate ? m.expiryDate.slice(0, 10) : '',
  }
}

function bodyOf(d: MedicineDraft) {
  return {
    name: d.name.trim(),
    categoryId: d.categoryId || null,
    generic: d.generic || null,
    company: d.company || null,
    effects: d.effects || null,
    box: d.box || null,
    price: d.price === '' ? null : Number(d.price),
    sellingPrice: d.sellingPrice === '' ? null : Number(d.sellingPrice),
    quantity: d.quantity === '' ? undefined : Number(d.quantity),
    expiryDate: d.expiryDate || null,
  }
}

export function MedicinesPage() {
  const { session } = useAuth()
  const [params, setParams] = useSearchParams()

  const { data, error, loading, query, setQuery, offset, setOffset, limit, refresh } = useList<Medicine>(
    '/medicines',
    useCallback(
      (q: string, off: number) => {
        const p = new URLSearchParams()
        if (q) p.set('q', q)
        if (params.get('category')) p.set('category', params.get('category') as string)
        p.set('limit', '30')
        p.set('offset', String(off))
        return `?${p.toString()}`
      },
      [params],
    ),
  )

  const [cats, setCats] = useState<MedicineCategoriesResponse | null>(null)
  const [editing, setEditing] = useState<{ mode: 'create' | 'edit'; id?: string; draft: MedicineDraft } | null>(null)
  const [formError, setFormError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<{ id: string; name: string; message: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    api.get<MedicineCategoriesResponse>('/medicine-categories').then(setCats, () => setCats(null))
  }, [])

  const catName = useMemo(() => {
    const map = new Map((cats?.items ?? []).map((c) => [c._id, c.name]))
    return (id: string | null | undefined) => (id ? (map.get(id) ?? 'Unlisted') : '—')
  }, [cats])

  const canAdd = can(session, 'medicine_add')
  const canUpdate = can(session, 'medicine_update')
  const canDelete = can(session, 'medicine_delete')
  const total = data?.total ?? 0

  async function submit() {
    if (!editing) return
    setSaving(true)
    setFormError(null)
    const body = bodyOf(editing.draft)
    try {
      if (editing.mode === 'create') await api.post<Medicine>('/medicines', body)
      else await api.put<Medicine>(`/medicines/${editing.id}`, body)
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
      await api.delete(`/medicines/${confirm.id}`)
      setConfirm(null)
      refresh()
    } catch (e) {
      setConfirm((c) => (c ? { ...c, message: e instanceof Error ? e.message : 'Deletion failed.' } : c))
      setDeleting(false)
    }
  }

  function setCategoryParam(value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set('category', value)
    else next.delete('category')
    setParams(next, { replace: true })
    setOffset(0)
  }

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <PageHeader
        title="Medicine catalogue"
        description={`${total.toLocaleString()} medicines — the source of truth for prescription rows.`}
        actions={
          canAdd ? (
            <Button
              onClick={() => {
                setFormError(null)
                setEditing({ mode: 'create', draft: { ...emptyDraft } })
              }}
            >
              Add medicine
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOffset(0)
          }}
          placeholder="Search name, generic, company…"
          aria-label="Search medicines"
          className="max-w-xs"
        />
        <select
          aria-label="Filter by category"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={params.get('category') ?? ''}
          onChange={(e) => setCategoryParam(e.target.value)}
        >
          <option value="">All categories</option>
          {(cats?.items ?? []).map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>
        <Link to="/medicine-categories" className="ml-auto">
          <Button variant="outline">Categories</Button>
        </Link>
      </div>

      {error ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          <p>{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={refresh}>
            Try again
          </Button>
        </div>
      ) : data && data.items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm font-medium">
            {query ? `No medicines match “${query}”.` : 'The catalogue is empty.'}
          </p>
        </div>
      ) : data && data.items.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Generic</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Pack</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Buying</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Selling</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Stock</th>
                {(canUpdate || canDelete) && <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {data.items.map((m) => (
                <tr key={m._id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                  <td className="px-4 py-3">
                    <p className="font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{catName(m.categoryId)}</p>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{m.generic || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{m.box || '—'}</td>
                  <td className="hidden px-4 py-3 md:table-cell">{m.price ?? '—'}</td>
                  <td className="hidden px-4 py-3 md:table-cell">{m.sellingPrice ?? '—'}</td>
                  <td className="px-4 py-3">{m.quantity}</td>
                  {(canUpdate || canDelete) && (
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {canUpdate && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setFormError(null)
                            setEditing({ mode: 'edit', id: m._id, draft: draftOf(m) })
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
                            setConfirm({ id: m._id, name: m.name, message: `Remove ${m.name} from the catalogue?` })
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
      ) : null}

      {!error && loading && (
        <div aria-hidden className="rounded-lg border border-border bg-card">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-border/60 px-4 py-3.5 last:border-0">
              <div className="h-4 w-48 animate-pulse rounded bg-muted" />
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {total > limit && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p aria-live="polite">
            {offset + 1}–{offset + (data?.items.length ?? 0)} of {total.toLocaleString()}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(offset - limit)}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {editing && (
        <MedicineFormDialog
          draft={editing.draft}
          mode={editing.mode}
          cats={cats?.items ?? []}
          saving={saving}
          error={formError}
          onChange={(draft) => setEditing({ ...editing, draft })}
          onCancel={() => setEditing(null)}
          onSubmit={submit}
        />
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

function MedicineFormDialog({
  draft,
  mode,
  cats,
  saving,
  error,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: MedicineDraft
  mode: 'create' | 'edit'
  cats: MedicineCategory[]
  saving: boolean
  error: unknown
  onChange: (d: MedicineDraft) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  const set = (key: keyof MedicineDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...draft, [key]: e.target.value })
  const fields = error instanceof ApiRequestError ? (error.fields ?? {}) : (error instanceof Error ? { name: error.message } : {})

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16" role="dialog" aria-modal aria-label={mode === 'create' ? 'Add medicine' : 'Edit medicine'}>
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-lg">
        <h2 className="text-lg font-semibold">{mode === 'create' ? 'Add medicine' : 'Edit medicine'}</h2>
        <form className="mt-4 grid gap-4 sm:grid-cols-2" noValidate onSubmit={(e) => e.preventDefault()}>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="med-name">Name</Label>
            <Input id="med-name" value={draft.name} onChange={set('name')} aria-describedby={fields.name ? 'med-name-err' : undefined} />
            {fields.name && <p id="med-name-err" className="text-xs text-destructive">{fields.name}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="med-cat">Category</Label>
            <select
              id="med-cat"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={draft.categoryId}
              onChange={set('categoryId')}
            >
              <option value="">None</option>
              {cats.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
            {fields.categoryId && <p className="text-xs text-destructive">{fields.categoryId}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="med-box">Pack size</Label>
            <Input id="med-box" maxLength={100} placeholder="30 tablets" value={draft.box} onChange={set('box')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="med-generic">Generic name</Label>
            <Input id="med-generic" maxLength={100} value={draft.generic} onChange={set('generic')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="med-company">Company</Label>
            <Input id="med-company" maxLength={100} value={draft.company} onChange={set('company')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="med-price">Buying price</Label>
            <Input id="med-price" type="number" min="0" step="0.01" value={draft.price} onChange={set('price')} />
            {fields.price && <p className="text-xs text-destructive">{fields.price}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="med-selling">Selling price</Label>
            <Input id="med-selling" type="number" min="0" step="0.01" value={draft.sellingPrice} onChange={set('sellingPrice')} />
            {fields.sellingPrice && <p className="text-xs text-destructive">{fields.sellingPrice}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="med-qty">Stock</Label>
            <Input id="med-qty" type="number" min="0" value={draft.quantity} onChange={set('quantity')} />
            {fields.quantity && <p className="text-xs text-destructive">{fields.quantity}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="med-exp">Expiry date</Label>
            <Input id="med-exp" type="date" value={draft.expiryDate} onChange={set('expiryDate')} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="med-effects">Effects</Label>
            <Input id="med-effects" maxLength={100} value={draft.effects} onChange={set('effects')} />
          </div>
          {error instanceof Error && !('fields' in error) && (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">{error.message}</p>
          )}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="ghost" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={onSubmit} disabled={saving}>
              {saving ? 'Saving…' : mode === 'create' ? 'Add medicine' : 'Save changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default MedicinesPage
