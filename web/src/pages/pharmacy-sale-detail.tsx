import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { can, useAuth } from '@/auth/auth-context'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { formatDateTime } from '@/lib/format'
import type { PharmacySale } from '@/types'

export function PharmacySaleDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()

  const [data, setData] = useState<PharmacySale | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    api.get<PharmacySale>(`/pharmacy-sales/${id}`).then(
      (d) => !cancelled && setData(d),
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load.'),
    )
    return () => {
      cancelled = true
    }
  }, [id])

  async function reverse() {
    if (!data) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await api.delete(`/pharmacy-sales/${data._id}`)
      navigate('/pharmacy', { state: { reversed: data._id } })
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Reversal failed.')
      setDeleting(false)
    }
  }

  if (error) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Sale" />
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
        <PageHeader title="Sale" />
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
          <div className="mt-4 h-40 animate-pulse rounded bg-muted" />
        </div>
      </div>
    )
  }

  const canSell = can(session, 'pharmacy_sale')

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageHeader
        title={`Sale ${data.patientCode ? `— ${data.patientName}` : '— counter'}`}
        description={formatDateTime(data.date)}
        actions={
          canSell && (
            <Button
              variant="outline"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => {
                setConfirmOpen(true)
                setDeleteError(null)
              }}
            >
              Reverse sale
            </Button>
          )
        }
      />

      <div className="rounded-lg border border-border bg-card p-5">
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-[9rem_1fr]">
          <dt className="text-sm text-muted-foreground">Sold</dt>
          <dd className="text-sm">{formatDateTime(data.date)}</dd>
          <dt className="text-sm text-muted-foreground">Patient</dt>
          <dd className="text-sm">
            {data.patientId ? (
              <Link to={`/patients/${data.patientId}`} className="underline underline-offset-2">
                {data.patientName}
              </Link>
            ) : (
              (data.patientName ?? 'Counter sale')
            )}{' '}
            <span className="font-mono text-xs text-muted-foreground">{data.patientCode}</span>
          </dd>
          <dt className="text-sm text-muted-foreground">Status</dt>
          <dd className="text-sm">{data.status === 'paid' ? 'Paid' : (data.status ?? '—')}</dd>
        </dl>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-4 py-2.5 font-medium">Item</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Qty</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Unit</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Line total</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((it, i) => (
              <tr key={i} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3">
                  {it.name}
                  {it.medicineId ? (
                    <Link to="/medicines" className="ml-2 align-middle text-xs text-muted-foreground underline underline-offset-2">
                      catalogue
                    </Link>
                  ) : (
                    <span className="ml-2 text-xs text-muted-foreground">free-typed</span>
                  )}
                </td>
                <td className="px-4 py-3">×{it.quantity}</td>
                <td className="px-4 py-3">{it.unitPrice ?? '—'}</td>
                <td className="px-4 py-3 text-right">{it.lineTotal ?? '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border text-sm">
              <td className="px-4 py-2 text-muted-foreground" colSpan={3}>Items subtotal</td>
              <td className="px-4 py-2 text-right">{data.amount}</td>
            </tr>
            {(Number(data.discount) || 0) > 0 && (
              <tr className="text-sm">
                <td className="px-4 py-2 text-muted-foreground" colSpan={3}>Discount</td>
                <td className="px-4 py-2 text-right">−{data.discount}</td>
              </tr>
            )}
            {(Number(data.vat) || 0) > 0 && (
              <tr className="text-sm">
                <td className="px-4 py-2 text-muted-foreground" colSpan={3}>VAT</td>
                <td className="px-4 py-2 text-right">+{data.vat}</td>
              </tr>
            )}
            <tr className="border-t border-border text-sm font-semibold">
              <td className="px-4 py-2" colSpan={3}>Gross total</td>
              <td className="px-4 py-2 text-right">{data.grossTotal}</td>
            </tr>
            <tr className="text-sm text-muted-foreground">
              <td className="px-4 py-2" colSpan={3}>Amount received</td>
              <td className="px-4 py-2 text-right">{data.amountReceived}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Reverse this sale"
        message={
          deleteError ??
          'Reverse the sale and return every line to stock? The receipt disappears after full restoration.'
        }
        onCancel={() => setConfirmOpen(false)}
        onConfirm={reverse}
        busy={deleting}
      />
    </div>
  )
}

export default PharmacySaleDetailPage
