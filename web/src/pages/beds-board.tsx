import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { can, useAuth } from '@/auth/auth-context'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input, Label } from '@/components/ui/input'
import { NativeSelect as Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime } from '@/lib/format'
import { formatElapsed, useNow } from '@/beds/los'
import type { Bed, BedCategory, BedsBoard } from '@/types'

export function BedsPage() {
  const [params, setParams] = useSearchParams()
  const { session } = useAuth()
  const now = useNow()

  const wardFilter = params.get('ward') ?? ''

  const [data, setData] = useState<BedsBoard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resolved, setResolved] = useState<string | null>(null)

  const [addWardOpen, setAddWardOpen] = useState(false)
  const [addBedOpen, setAddBedOpen] = useState(false)
  const [nonce, setNonce] = useState(0)
  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  const [deleteBed, setDeleteBed] = useState<Bed | null>(null)
  const [deleteWard, setDeleteWard] = useState<BedCategory | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const query = `/beds${wardFilter ? `?ward=${wardFilter}` : ''}`
  const requestKey = `${query}|${nonce}`

  useEffect(() => {
    let cancelled = false
    api.get<BedsBoard>(query).then(
      (d) => {
        if (cancelled) return
        setData(d)
        setError(null)
        setResolved(requestKey)
      },
      (e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load')
        setResolved(requestKey)
      },
    )
    return () => {
      cancelled = true
    }
  }, [query, requestKey])

  const loading = resolved !== requestKey

  // Group by ward in display order; ward rows keep the API's "Removed ward" fallback.
  const groups = useMemo(() => {
    const beds = data?.beds ?? []
    const byWard = new Map<string, Bed[]>()
    for (const b of beds) {
      const list = byWard.get(b.wardName) ?? []
      list.push(b)
      byWard.set(b.wardName, list)
    }
    for (const list of byWard.values()) {
      list.sort((a, z) => a.number.localeCompare(z.number, undefined, { numeric: true }))
    }
    return [...byWard.entries()]
  }, [data])

  function setWardFilter(value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set('ward', value)
    else next.delete('ward')
    setParams(next, { replace: true })
  }

  async function onDeleteBed() {
    if (!deleteBed) return
    setBusy(true)
    setActionError(null)
    try {
      await api.delete(`/beds/${deleteBed._id}`)
      setDeleteBed(null)
      refresh()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not delete the bed. Try again.')
      setDeleteBed(null)
    } finally {
      setBusy(false)
    }
  }

  async function onDeleteWard() {
    if (!deleteWard) return
    setBusy(true)
    setActionError(null)
    try {
      await api.delete(`/beds/categories/${deleteWard._id}`)
      setDeleteWard(null)
      refresh()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not delete the ward. Try again.')
      setDeleteWard(null)
    } finally {
      setBusy(false)
    }
  }

  const canViewWards = can(session, 'ward_view')
  const canAddWard = can(session, 'ward_add')
  const canDeleteWard = can(session, 'ward_delete')
  const canAddBed = can(session, 'ward_add')
  const canDeleteBed = can(session, 'ward_delete')
  const canAdmit = can(session, 'admission_add')

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Ward board"
        description={data ? `${data.freeCount} free of ${data.totalCount} beds` : 'Live occupancy, derived from open admissions.'}
        actions={
          <>
            {canViewWards && (
              <Link to="/admissions" className="text-sm font-medium text-primary hover:underline">
                Admissions
              </Link>
            )}
            {canAddWard && (
              <Button variant="outline" onClick={() => setAddWardOpen(true)}>
                Add ward
              </Button>
            )}
            {canAddBed && (
              <Button onClick={() => setAddBedOpen(true)}>Add bed</Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Filter by ward"
          className="w-auto"
          value={wardFilter}
          onChange={(e) => setWardFilter(e.target.value)}
        >
          <option value="">All wards</option>
          {(data?.categories ?? []).map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      {error && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          <p>{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={refresh}>
            Try again
          </Button>
        </div>
      )}

      {!error && loading && (
        <div aria-hidden className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {!error && !loading && data && data.beds.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm font-medium">No beds yet.</p>
          {canAddBed && <p className="mt-1 text-sm text-muted-foreground">Add a ward and its beds to start taking admissions.</p>}
        </div>
      )}

      {groups.map(([wardName, beds]) => {
        const free = beds.filter((b) => !b.occupied).length
        return (
          <section key={wardName} aria-labelledby={`ward-${wardName.replace(/\W+/g, '-')}`}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={`ward-${wardName.replace(/\W+/g, '-')}`} className="text-lg font-semibold">
                {wardName}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {free} free of {beds.length}
                </span>
              </h2>
              {canDeleteWard &&
                data?.categories.some((c) => c.name === wardName) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDeleteWard(data.categories.find((c) => c.name === wardName) ?? null)
                      setActionError(null)
                    }}
                  >
                    Delete ward
                  </Button>
                )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {beds.map((bed) => (
                <BedCard
                  key={bed._id}
                  bed={bed}
                  now={now}
                  canAdmit={canAdmit}
                  canDelete={canDeleteBed && !bed.occupied}
                  onDelete={() => {
                    setDeleteBed(bed)
                    setActionError(null)
                  }}
                />
              ))}
            </div>
          </section>
        )
      })}

      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      )}

      <WardDialog
        open={addWardOpen}
        onClose={() => setAddWardOpen(false)}
        onSaved={refresh}
      />
      {data && (
        <BedDialog
          open={addBedOpen}
          categories={data.categories}
          onClose={() => setAddBedOpen(false)}
          onSaved={refresh}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteBed)}
        title={deleteBed ? `Delete bed ${deleteBed.number}?` : 'Delete bed?'}
        message="Beds are deleted permanently. Historical admissions keep their snapshot of the bed."
        confirmLabel="Delete bed"
        onConfirm={onDeleteBed}
        onCancel={() => {
          setDeleteBed(null)
          setActionError(null)
        }}
        busy={busy}
      />
      <ConfirmDialog
        open={Boolean(deleteWard)}
        title={deleteWard ? `Delete ward ${deleteWard.name}?` : 'Delete ward?'}
        message="A ward can only be deleted once it has no beds."
        confirmLabel="Delete ward"
        onConfirm={onDeleteWard}
        onCancel={() => {
          setDeleteWard(null)
          setActionError(null)
        }}
        busy={busy}
      />
    </div>
  )
}

function BedCard({
  bed,
  now,
  canAdmit,
  canDelete,
  onDelete,
}: {
  bed: Bed
  now: number
  canAdmit: boolean
  canDelete: boolean
  onDelete: () => void
}) {
  void now
  return (
    <div
      className={
        bed.occupied
          ? 'rounded-lg border border-accent bg-accent/20 p-4'
          : 'rounded-lg border border-border bg-card p-4'
      }
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold tabular-nums">{bed.number}</p>
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
            bed.occupied ? 'border-accent text-accent-foreground' : 'border-border bg-success/15 text-success'
          }`}
        >
          {bed.occupied ? 'Occupied' : 'Free'}
        </span>
      </div>
      {bed.occupied && bed.occupancy ? (
        <p className="mt-2 text-sm">
          <Link
            to={`/admissions/${bed.occupancy.admissionId}`}
            className="font-medium underline-offset-2 hover:underline"
          >
            {bed.occupancy.patientName}
          </Link>
          <span className="text-muted-foreground">
            {' '}
            since {formatDateTime(bed.occupancy.since)} ·{' '}
            {formatElapsed(bed.occupancy.since)}
          </span>
        </p>
      ) : (
        <p className="mt-2 text-sm">
          {canAdmit ? (
            <Link
              to={`/admissions/create?bed=${bed._id}`}
              className="font-medium text-primary hover:underline"
            >
              Admit
            </Link>
          ) : (
            <span className="text-muted-foreground">Available</span>
          )}
          {bed.description ? (
            <span className="text-muted-foreground"> · {bed.description}</span>
          ) : null}
        </p>
      )}
      {canDelete && (
        <div className="mt-2 flex justify-end">
          <Button variant="ghost" size="sm" className="h-7 text-destructive hover:bg-destructive/10" onClick={onDelete}>
            Delete
          </Button>
        </div>
      )}
    </div>
  )
}

function WardDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await api.post('/beds/categories', { name, description })
      onSaved()
      onClose()
      setName('')
      setDescription('')
    } catch (e) {
      setError(e)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DialogShell title="Add ward" onClose={onClose}>
      <form className="space-y-3" noValidate onSubmit={(e) => e.preventDefault()}>
        <div className="space-y-1.5">
          <Label htmlFor="ward-name">Ward name</Label>
          <Input
            id="ward-name"
            required
            maxLength={100}
            placeholder="General, ICU…"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {errText(error, 'name') && <p className="text-xs text-destructive">{errText(error, 'name')}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ward-desc">Description</Label>
          <Textarea
            id="ward-desc"
            rows={2}
            maxLength={100}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {msg(error) && (
          <p role="alert" className="text-sm text-destructive">{msg(error)}</p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? 'Saving…' : 'Add ward'}
          </Button>
        </div>
      </form>
    </DialogShell>
  )
}

function BedDialog({
  open,
  categories,
  onClose,
  onSaved,
}: {
  open: boolean
  categories: BedCategory[]
  onClose: () => void
  onSaved: () => void
}) {
  const [wardId, setWardId] = useState('')
  const [number, setNumber] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await api.post('/beds', { wardId, number, description })
      onSaved()
      onClose()
      setNumber('')
      setDescription('')
    } catch (e) {
      setError(e)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DialogShell title="Add bed" onClose={onClose}>
      <form className="space-y-3" noValidate onSubmit={(e) => e.preventDefault()}>
        <div className="space-y-1.5">
          <Label htmlFor="bed-ward">Ward</Label>
          <Select id="bed-ward" value={wardId} onChange={(e) => setWardId(e.target.value)}>
            <option value="">Select a ward…</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Select>
          {errText(error, 'wardId') && <p className="text-xs text-destructive">{errText(error, 'wardId')}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bed-number">Bed number</Label>
          <Input
            id="bed-number"
            required
            maxLength={100}
            placeholder="1, 2, ICU-3…"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
          {errText(error, 'number') && <p className="text-xs text-destructive">{errText(error, 'number')}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bed-desc">Description</Label>
          <Textarea
            id="bed-desc"
            rows={2}
            maxLength={100}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {msg(error) && (
          <p role="alert" className="text-sm text-destructive">{msg(error)}</p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !wardId || !number}>
            {submitting ? 'Saving…' : 'Add bed'}
          </Button>
        </div>
      </form>
    </DialogShell>
  )
}

export function DialogShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-foreground/40" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-sm rounded-lg border border-border bg-popover p-5 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function errText(error: unknown, key: string): string | null {
  if (error && typeof error === 'object' && 'fields' in error) {
    const fields = (error as { fields?: Record<string, string> }).fields
    return fields?.[key] ?? null
  }
  return null
}

function msg(error: unknown): string | null {
  if (error instanceof Error) {
    return 'fields' in error ? null : error.message
  }
  return null
}

export default BedsPage
