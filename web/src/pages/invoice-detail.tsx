import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { can, useAuth } from '@/auth/auth-context'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { formatDate, formatCurrency } from '@/lib/format'
import type { Invoice, InvoicePayment } from '@/types'

export function InvoiceDetailPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('')
  const [payReference, setPayReference] = useState('')
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    if (!id) return
    api.get<Invoice>(`/invoices/${id}`).then(
      (d) => {
        setInvoice(d)
        setLoading(false)
      },
      (e) => {
        setError(e.message)
        setLoading(false)
      },
    )
  }, [id])

  const canPay = can(session, 'payment_add')
  const canDelete = can(session, 'payment_delete')

  const balance = invoice ? Number(invoice.balance ?? '0') : 0
  const paid = invoice ? Number(invoice.paid ?? '0') : 0

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !payAmount) return
    const amount = Number(payAmount)
    if (amount <= 0 || amount > balance + 0.004) return

    setPaying(true)
    try {
      await api.post(`/invoices/${id}/pay`, {
        amount,
        method: payMethod || undefined,
        reference: payReference || undefined,
      })
      setPayAmount('')
      setPayMethod('')
      setPayReference('')
      const refreshed = await api.get<Invoice>(`/invoices/${id}`)
      setInvoice(refreshed)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Payment failed')
    } finally {
      setPaying(false)
    }
  }

  async function handleDelete() {
    if (!id) return
    if (!confirm('Delete this invoice? This cannot be undone.')) return
    try {
      await api.delete(`/invoices/${id}`)
      navigate('/invoices')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Invoice" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Invoice" />
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          {error || 'Invoice not found'}
        </div>
      </div>
    )
  }

  const settlement = invoice.settlement ?? 'unpaid'
  const statusClass =
    settlement === 'paid'
      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      : settlement === 'part paid'
      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
      : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Invoice"
        description={`#${invoice._id.slice(-8)} • ${formatDate(invoice.date)}`}
        actions={
          <div className="flex gap-2">
            {canDelete && invoice.paid === '0.00' && paid === 0 && (
              <Button variant="destructive" onClick={handleDelete}>
                Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate('/invoices')}>
              Back
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Charges</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="px-4 py-2.5 font-medium">Service</th>
                      <th scope="col" className="px-4 py-2.5 font-medium tabular-nums text-right">Qty</th>
                      <th scope="col" className="px-4 py-2.5 font-medium tabular-nums text-right">Unit Price</th>
                      <th scope="col" className="px-4 py-2.5 font-medium tabular-nums text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item, i) => (
                      <tr key={i} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-3">{item.name}</td>
                        <td className="px-4 py-3 tabular-nums text-right">{item.quantity}</td>
                        <td className="px-4 py-3 tabular-nums text-right">{formatCurrency(item.unitPrice)}</td>
                        <td className="px-4 py-3 tabular-nums text-right font-medium">{formatCurrency(item.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardContent>
              {invoice.payments && invoice.payments.length > 0 ? (
                <div className="space-y-3">
                  {invoice.payments.map((payment: InvoicePayment) => (
                    <div key={payment._id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                      <div>
                        <p className="font-medium">{formatCurrency(payment.amount)}</p>
                        <p className="text-xs text-muted-foreground">
                          {payment.method || 'Cash'} • {formatDate(payment.paidAt)}
                          {payment.reference && ` • ${payment.reference}`}
                        </p>
                      </div>
                      <Badge variant="secondary">{formatDate(payment.paidAt)}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No payments recorded.</p>
              )}

              {balance > 0.004 && canPay && (
                <form onSubmit={handlePay} className="mt-4 space-y-3 p-4 border border-border rounded-lg bg-muted/30">
                  <h4 className="font-medium">Record Payment</h4>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="payAmount">Amount *</Label>
                      <Input
                        id="payAmount"
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={balance.toFixed(2)}
                        value={payAmount}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPayAmount(e.target.value)}
                        required
                        placeholder={balance.toFixed(2)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="payMethod">Method</Label>
                      <Input
                        id="payMethod"
                        value={payMethod}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPayMethod(e.target.value)}
                        placeholder="Cash, Card, etc."
                        maxLength={60}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="payReference">Reference</Label>
                      <Input
                        id="payReference"
                        value={payReference}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPayReference(e.target.value)}
                        placeholder="Transaction ID, cheque #"
                        maxLength={120}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" disabled={paying}>
                      {paying ? 'Recording…' : `Pay ${formatCurrency(balance.toFixed(2))}`}
                    </Button>
                  </div>
                </form>
              )}

              {balance <= 0.004 && (
                <div className="mt-4 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <p className="text-green-800 dark:text-green-400 font-medium">Invoice fully settled.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {invoice.remarks && (
            <Card>
              <CardHeader>
                <CardTitle>Remarks</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{invoice.remarks}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Patient</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="font-medium">{invoice.patientName}</p>
              </div>
              {invoice.patientPhone && (
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p>{invoice.patientPhone}</p>
                </div>
              )}
              {invoice.patientAddress && (
                <div>
                  <p className="text-xs text-muted-foreground">Address</p>
                  <p>{invoice.patientAddress}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {invoice.doctorName && (
            <Card>
              <CardHeader>
                <CardTitle>Doctor</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-medium">{invoice.doctorName}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{formatCurrency(invoice.amount)}</span>
              </div>
              {Number(invoice.discount) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="tabular-nums text-red-600">−{formatCurrency(invoice.discount)}</span>
                </div>
              )}
              {Number(invoice.vat) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">VAT</span>
                  <span className="tabular-nums">+{formatCurrency(invoice.vat)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>Gross Total</span>
                <span className="tabular-nums">{formatCurrency(invoice.grossTotal)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Paid</span>
                <span className="tabular-nums">{formatCurrency(invoice.paid ?? '0')}</span>
              </div>
              <div className="flex justify-between text-sm font-medium text-red-600">
                <span>Balance</span>
                <span className="tabular-nums">{formatCurrency(invoice.balance ?? '0')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <Badge className={statusClass}>{settlement}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default InvoiceDetailPage