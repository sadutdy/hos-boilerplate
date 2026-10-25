import { useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { can, useAuth } from '@/auth/auth-context'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect as Select } from '@/components/ui/select'
import { useList } from '@/hooks/use-list'
import { formatDate, formatCurrency } from '@/lib/format'
import type { Invoice, InvoicesResponse } from '@/types'

function buildInvoicesQuery(q: string, offset: number, show: string) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  params.set('limit', '25')
  params.set('offset', String(offset))
  params.set('show', show)
  return `?${params.toString()}`
}

export function InvoicesPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const show = searchParams.get('show') ?? 'outstanding'

  const buildQuery = useCallback((q: string, offset: number) => buildInvoicesQuery(q, offset, show), [show])

  const list = useList<Invoice, InvoicesResponse>('/invoices', buildQuery)

  const { data, query } = list
  const total = data?.total ?? 0
  const owed = data?.owed ?? '0.00'
  const from = data?.items.length === 0 ? 0 : list.offset + 1
  const to = data ? list.offset + data.items.length : 0

  const onRow = (id: string) => navigate(`/invoices/${id}`)

  const setShow = (value: string) => {
    setSearchParams({ ...Object.fromEntries(searchParams), show: value })
    list.setOffset(0)
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Invoices"
        description={total === 0 ? 'No invoices' : `${total.toLocaleString()} invoices • Outstanding: ${formatCurrency(owed)}`}
        actions={
          can(session, 'payment_add') ? (
            <Button onClick={() => navigate('/invoices/create')}>Create invoice</Button>
          ) : null
        }
      />

      <div className="flex flex-wrap gap-3">
        <Input
          type="search"
          value={list.query}
          onChange={(e) => list.setQuery(e.target.value)}
          placeholder="Search invoices..."
          aria-label="Search invoices"
          className="max-w-md"
        />
        <Select value={show} onChange={(e) => setShow(e.target.value)} className="w-[180px]">
          <option value="outstanding">Outstanding</option>
          <option value="settled">Settled</option>
          <option value="all">All</option>
        </Select>
      </div>

      {list.error && (
        <ErrorCard error={list.error} onRetry={list.refresh} />
      )}

      {!list.error && data && data.items.length === 0 && (
        <EmptyState
          query={query}
          canAdd={can(session, 'payment_add')}
          onAdd={() => navigate('/invoices/create')}
        />
      )}

      {data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Patient</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Total</th>
                <th scope="col" className="px-4 py-2.5 font-medium tabular-nums">Paid</th>
                <th scope="col" className="px-4 py-2.5 font-medium tabular-nums">Balance</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Doctor</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((inv) => (
                <InvoiceRow key={inv._id} invoice={inv} onOpen={() => onRow(inv._id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!list.error && list.loading && <LoadingRows />}

      {total > list.limit && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p aria-live="polite">
            {from}–{to} of {total.toLocaleString()}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={list.offset === 0}
              onClick={() => list.setOffset(list.offset - list.limit)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={to >= total}
              onClick={() => list.setOffset(list.offset + list.limit)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function InvoiceRow({ invoice, onOpen }: { invoice: Invoice; onOpen: () => void }) {
  const settlement = invoice.settlement ?? 'unpaid'
  const statusClass =
    settlement === 'paid'
      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      : settlement === 'part paid'
      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
      : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'

  return (
    <tr
      className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-accent/60"
      onClick={onOpen}
    >
      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
        {formatDate(invoice.date)}
      </td>
      <td className="px-4 py-3 font-medium">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpen()
          }}
          className="text-left underline-offset-2 hover:underline"
        >
          {invoice.patientName}
        </button>
      </td>
      <td className="px-4 py-3 tabular-nums font-medium">
        {formatCurrency(invoice.grossTotal)}
      </td>
      <td className="px-4 py-3 tabular-nums text-muted-foreground">
        {formatCurrency(invoice.paid ?? '0')}
      </td>
      <td className="px-4 py-3 tabular-nums font-medium text-red-600 dark:text-red-400">
        {formatCurrency(invoice.balance ?? '0')}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass}`}>
          {settlement}
        </span>
      </td>
      <td className="hidden px-4 py-3 md:table-cell text-sm text-muted-foreground">
        {invoice.doctorName || '—'}
      </td>
    </tr>
  )
}

function LoadingRows() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border/60 p-4 last:border-0">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="hidden h-4 w-24 animate-pulse rounded bg-muted md:block" />
        </div>
      ))}
    </div>
  )
}

function ErrorCard({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
      <p>{error}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

function EmptyState({
  query,
  canAdd,
  onAdd,
}: {
  query: string
  canAdd: boolean
  onAdd: () => void
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center">
      <p className="text-sm font-medium">
        {query ? `No invoices match “${query}”.` : 'No invoices yet.'}
      </p>
      {canAdd ? (
        <Button size="sm" className="mt-3" onClick={onAdd}>
          Create invoice
        </Button>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Search for a different term or filter.</p>
      )}
    </div>
  )
}

export default InvoicesPage