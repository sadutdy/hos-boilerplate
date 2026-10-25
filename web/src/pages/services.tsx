import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { can, useAuth } from '@/auth/auth-context'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input, Label } from '@/components/ui/input'
import { Textarea } from '@/components/ui/text-area'
import { DialogShell } from '@/pages/beds-board'
import type { Service, ServicesResponse } from '@/types'

export function ServicesPage() {
  const { session } = useAuth()
  const [data, setData] = useState<ServicesResponse | null>(null)
  const [typeFilter, setTypeFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)
  const [deletesvc, setDeleteSvc] = useState<Service | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const query = `/services${typeFilter ? `?type=${encodeURIComponent(typeFilter)}` : ''}`

  useEffect(() => {
    let cancelled = false
    api.get<ServicesResponse>(query).then(
      (d) => {
        if (cancelled) return
        setData(d)
        setError(null)
      },
      (e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load')
      },
    )
    return () => {
      cancelled = true
    }
  }, [query, nonce])

  async function onDelete() {
    if (!deletesvc) return
    setBusy(true)
    setActionError(null)
    try {
      await api.delete(`/services/${deletesvc._id}`)
      setDeleteSvc(null)
      refresh()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not delete. Try again.')
      setDeleteSvc(null)
    } finally {
      setBusy(false)
    }
  }

  const canAdd = can(session, 'service_add')
  const canUpdate = can(session, 'service_update')
  const canDelete = can(session, 'service_delete')
  const usageOf = (id: string) => data?.usage.find((u) => u.id === id)?.invoices ?? 0

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Services"
        description="Billable price list — the price at charge time is copied onto the invoice; edits only affect future bills."
        actions={canAdd ? <Button onClick={() => setFormOpen(true)}>Add service</Button> : null}
      />

      {(data?.types.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setTypeFilter('')}
            aria-pressed={typeFilter === ''}
            className={
              typeFilter === ''
                ? 'rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground'
                : 'rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground'
            }
          >
            All types
          </button>
          {data?.types.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(typeFilter === t ? '' : t)}
              aria-pressed={typeFilter === t}
              className={
                typeFilter === t
                  ? 'rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground'
                  : 'rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground'
              }
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          <p>{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={refresh}>
            Try again
          </Button>
        </div>
      )}

      {data && data.items.length === 0 && !error && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm font-medium">
            {typeFilter ? `No services typed “${typeFilter}”.` : 'The price list is empty.'}
          </p>
          {canAdd && (
            <p className="mt-1 text-sm text-muted-foreground">Add a service to make it selectable on invoices.</p>
          )}
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">Service</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Type</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Price</th>
                <th scope="col" className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Billed</th>
                <th scope="col" className="hidden px-4 py-2.5 text-right font-medium lg:table-cell">Split (dr/hosp)</th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((s) => (
                <tr key={s._id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                  <td className="px-4 py-3">
                    <p className="font-medium">{s.name}</p>
                    {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">{s.type || <span className="text-muted-foreground/60">—</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {s.price != null ? <span className="font-medium">{s.price}</span> : <span className="text-muted-foreground/60">—</span>}
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums sm:table-cell">
                    <span className="inline-flex min-w-7 justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                      {usageOf(s._id)}
                    </span>
                    <span className="sr-only"> invoice lines reference this</span>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted-foreground lg:table-cell">
                    {s.dCommission != null || s.hCommission != null
                      ? `${s.dCommission ?? '—'}% / ${s.hCommission ?? '—'}%`
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {canUpdate && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(s)
                            setFormOpen(true)
                            setActionError(null)
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
                          onClick={() => {
                            setDeleteSvc(s)
                            setActionError(null)
                          }}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      )}

      {formOpen && (
        <ServiceDialog
          service={editing}
          onClose={() => {
            setFormOpen(false)
            setEditing(null)
          }}
          onSaved={() => {
            setFormOpen(false)
            setEditing(null)
            refresh()
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deletesvc)}
        title={deletesvc ? `Delete ${deletesvc.name}?` : 'Delete service?'}
        message="Deletion is blocked once the service has been billed — the price list records stay true to past invoices."
        confirmLabel="Delete service"
        onConfirm={onDelete}
        onCancel={() => {
          setDeleteSvc(null)
          setActionError(null)
        }}
        busy={busy}
      />
    </div>
  )
}

function ServiceDialog({
  service,
  onClose,
  onSaved,
}: {
  service: Service | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(service?.name ?? '')
  const [description, setDescription] = useState(service?.description ?? '')
  const [price, setPrice] = useState(service?.price ?? '')
  const [type, setType] = useState(service?.type ?? '')
  const [dCommission, setDCommission] = useState(service?.dCommission != null ? String(service.dCommission) : '')
  const [hCommission, setHCommission] = useState(service?.hCommission != null ? String(service.hCommission) : '')
  const [error, setError] = useState<unknown>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const body: Record<string, unknown> = {
      name: name.trim(),
      description,
      type,
      ...(price !== '' ? { price: Number(price) } : { price: null }),
      ...(dCommission !== '' ? { dCommission: Number(dCommission) } : {}),
      ...(hCommission !== '' ? { hCommission: Number(hCommission) } : {}),
    }
    try {
      if (service) await api.put(`/services/${service._id}`, body)
      else await api.post('/services', body)
      onSaved()
    } catch (e) {
      setError(e)
    } finally {
      setSubmitting(false)
    }
  }

  const fieldErr = (key: string): string | null =>
    error && typeof error === 'object' && 'fields' in error
      ? (error as { fields?: Record<string, string> }).fields?.[key] ?? null
      : null

  return (
    <DialogShell title={service ? `Edit ${service.name}` : 'Add service'} onClose={onClose}>
      <form className="space-y-3" noValidate onSubmit={(e) => e.preventDefault()}>
        <div className="space-y-1.5">
          <Label htmlFor="svc-name">Name</Label>
          <Input
            id="svc-name"
            required
            maxLength={100}
            placeholder="Consultation — follow-up"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={Boolean(fieldErr('name'))}
          />
          {fieldErr('name') && <p className="text-xs text-destructive">{fieldErr('name')}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="svc-type">Type</Label>
            <Input id="svc-type" maxLength={100} placeholder="Consultation" value={type} onChange={(e) => setType(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="svc-price">Price</Label>
            <Input
              id="svc-price"
              inputMode="decimal"
              placeholder="0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              aria-describedby={fieldErr('price') ? 'svc-price-err' : undefined}
            />
            {fieldErr('price') && <p id="svc-price-err" className="text-xs text-destructive">{fieldErr('price')}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="svc-dc">Doctor commission %</Label>
            <Input id="svc-dc" inputMode="numeric" placeholder="0–100" value={dCommission} onChange={(e) => setDCommission(e.target.value)} />
            {fieldErr('dCommission') && <p className="text-xs text-destructive">{fieldErr('dCommission')}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="svc-hc">Hospital commission %</Label>
            <Input id="svc-hc" inputMode="numeric" placeholder="0–100" value={hCommission} onChange={(e) => setHCommission(e.target.value)} />
            {fieldErr('hCommission') && <p className="text-xs text-destructive">{fieldErr('hCommission')}</p>}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="svc-desc">Description</Label>
          <Textarea id="svc-desc" rows={2} maxLength={100} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <p className="text-xs text-muted-foreground">Commissions are recorded but not yet applied to invoices.</p>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !name.trim()}>
            {submitting ? 'Saving…' : service ? 'Save changes' : 'Add service'}
          </Button>
        </div>
      </form>
    </DialogShell>
  )
}

export default ServicesPage
