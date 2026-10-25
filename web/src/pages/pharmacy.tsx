import { useCallback, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { can, useAuth } from '@/auth/auth-context'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useList } from '@/hooks/use-list'
import { formatDate } from '@/lib/format'
import type { PharmacySale, SalesResponse } from '@/types'

function firstOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function PharmacyPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { session } = useAuth()

  const [from, setFrom] = useState(params.get('from') ?? firstOfMonth())
  const [to, setTo] = useState(params.get('to') ?? today())

  const listQuery = useCallback(
    (_q: string, offset: number) => {
      const p = new URLSearchParams()
      p.set('from', from)
      p.set('to', to)
      p.set('limit', '25')
      p.set('offset', String(offset))
      return `?${p.toString()}`
    },
    [from, to],
  )

  const list = useList<PharmacySale, SalesResponse>('/pharmacy-sales', listQuery)
  const data = list.data
  const total = data?.total ?? 0

  function applyRange() {
    const next = new URLSearchParams(params)
    next.set('from', from)
    next.set('to', to)
    setParams(next, { replace: true })
    list.setOffset(0)
  }

  const canSell = can(session, 'pharmacy_sale')

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Pharmacy sales"
        description={
          data
            ? `${total.toLocaleString()} in range — takings ${data.takings}`
            : 'Counter dispensing with transactional stock.'
        }
        actions={
          <div className="flex gap-2">
            <Link to="/barcode">
              <Button variant="outline">Barcode sheet</Button>
            </Link>
            {canSell && <Button onClick={() => navigate('/pharmacy/new')}>New sale</Button>}
          </div>
        }
      />

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          applyRange()
        }}
      >
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground" htmlFor="sales-from">From</label>
          <Input id="sales-from" type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground" htmlFor="sales-to">To</label>
          <Input id="sales-to" type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button type="submit" variant="outline" size="sm">
          Apply range
        </Button>
      </form>

      {list.error ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          <p>{list.error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={list.refresh}>
            Try again
          </Button>
        </div>
      ) : total === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm font-medium">No sales in this date range.</p>
        </div>
      ) : data && data.items.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Patient</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Items</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Gross</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((s) => (
                <tr key={s._id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                  <td className="whitespace-nowrap px-4 py-3 font-medium">
                    <Link to={`/pharmacy/${s._id}`} className="underline-offset-2 hover:underline">{formatDate(s.date)}</Link>
                  </td>
                  <td className="px-4 py-3">
                    {s.patientName && s.patientName !== 'Counter sale' ? (
                      <>
                        <span className="font-medium">{s.patientName}</span>
                        <span className="font-mono text-xs text-muted-foreground ml-2">{s.patientCode}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Counter sale</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {s.items.map((i) => `${i.name} ×${i.quantity}`).join(', ')}
                  </td>
                  <td className="px-4 py-3 font-medium">{s.grossTotal}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border text-xs text-muted-foreground">
                <td className="px-4 py-2" colSpan={2}>
                  {list.offset + 1}–{list.offset + data.items.length} of {total.toLocaleString()} · takings in range {data.takings}
                </td>
                <td className="px-4 py-2 text-right">
                  {list.offset + list.limit < total && (
                    <Button variant="ghost" size="sm" onClick={() => list.setOffset(list.offset + list.limit)}>
                      Next page
                    </Button>
                  )}
                  {list.offset >= list.limit && (
                    <Button variant="ghost" size="sm" onClick={() => list.setOffset(list.offset - list.limit)}>
                      Previous page
                    </Button>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}

      {!list.error && list.loading && total === 0 && (
        <div aria-hidden className="rounded-lg border border-border bg-card p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-muted" />
          ))}
        </div>
      )}
    </div>
  )
}

export default PharmacyPage
