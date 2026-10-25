import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/format'
import type { InvoiceCreateData, InvoiceItem } from '@/types'
import { round2 } from '@/lib/utils'

function formatNumber(n: number) {
  return n.toFixed(2)
}

export function InvoiceCreatePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preselectedPatientId = searchParams.get('patient')

  const [data, setData] = useState<InvoiceCreateData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    patientId: preselectedPatientId ?? '',
    doctorId: '',
    date: new Date().toISOString().slice(0, 10),
    discount: '',
    vat: '',
    remarks: '',
    depositType: '',
    items: [] as InvoiceItem[],
  })

  useEffect(() => {
    api.get<InvoiceCreateData>('/invoices/create-data').then(
      (d) => {
        setData(d)
        if (preselectedPatientId) {
          setForm((f) => ({ ...f, patientId: preselectedPatientId }))
        }
        setLoading(false)
      },
      (e) => {
        setError(e.message)
        setLoading(false)
      },
    )
  }, [preselectedPatientId])

  const subtotal = form.items.reduce((sum, it) => sum + Number(it.lineTotal), 0)
  const discount = Number(form.discount) || 0
  const vat = Number(form.vat) || 0
  const grossTotal = round2(subtotal - discount + vat)

  function handleServiceChange(index: number, serviceId: string) {
    const svc = data?.services.find((s) => s._id === serviceId)
    const price = svc?.price ? Number(svc.price) : 0
    const quantity = form.items[index].quantity || 1
    setForm((f) => {
      const items = [...f.items]
      items[index] = {
        serviceId,
        name: svc?.name ?? '',
        quantity,
        unitPrice: formatNumber(price),
        lineTotal: formatNumber(price * quantity),
      }
      return { ...f, items }
    })
  }

  function handleItemChange(index: number, field: keyof InvoiceItem, value: string | number) {
    setForm((f) => {
      const items = [...f.items]
      const current = items[index]
      const quantity = field === 'quantity' ? Number(value) : current.quantity
      const unitPrice = field === 'unitPrice' ? Number(value) : Number(current.unitPrice)
      items[index] = {
        ...current,
        [field]: String(value),
        quantity,
        unitPrice: String(unitPrice),
        lineTotal: formatNumber(quantity * unitPrice),
      }
      return { ...f, items }
    })
  }

  function addItem() {
    setForm((f) => ({
      ...f,
      items: [...f.items, { serviceId: '', name: '', quantity: 1, unitPrice: '0', lineTotal: '0' }],
    }))
  }

  function removeItem(index: number) {
    setForm((f) => ({
      ...f,
      items: f.items.filter((_, i) => i !== index),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.patientId) return
    if (!form.items.length || !form.items.some((it) => it.name && it.quantity >= 1)) {
      setError('Add at least one charge to the invoice.')
      return
    }
    if (discount > subtotal) {
      setError('The discount is larger than the invoice.')
      return
    }

    setSubmitting(true)
    setError(null)

    const validItems = form.items.filter((it) => it.name && it.quantity >= 1)

    try {
      await api.post('/invoices', {
        patientId: form.patientId,
        doctorId: form.doctorId || undefined,
        date: form.date,
        items: validItems.map((it) => ({
          serviceId: it.serviceId || undefined,
          name: it.name,
          quantity: it.quantity,
          unitPrice: Number(it.unitPrice),
        })),
        discount: discount || undefined,
        vat: vat || undefined,
        remarks: form.remarks,
        depositType: form.depositType,
      })
      navigate('/invoices')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create invoice')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Create Invoice" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Create Invoice" />
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Failed to load form data.
          {error && <p className="mt-2 text-destructive">{error}</p>}
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <PageHeader title="Create Invoice" description="Add charges and create a new invoice" />

      <Card>
        <CardHeader>
          <CardTitle>Invoice Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="patientId">Patient *</Label>
<Select value={form.patientId} onValueChange={(v: string) => setForm((f) => ({ ...f, patientId: v }))}>
            <SelectTrigger>
              <SelectValue placeholder="Select patient" />
            </SelectTrigger>
            <SelectContent>
              {data.patients.map((p) => (
                <SelectItem key={p._id} value={p._id}>
                  {p.name} ({p.patientId})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doctorId">Doctor</Label>
            <Select value={form.doctorId} onValueChange={(v: string) => setForm((f) => ({ ...f, doctorId: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select doctor (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">— None —</SelectItem>
                {data.doctors.map((d) => (
                  <SelectItem key={d._id} value={d._id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">Date *</Label>
            <Input
              id="date"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="depositType">Deposit Type</Label>
            <Input
              id="depositType"
              value={form.depositType}
              onChange={(e) => setForm((f) => ({ ...f, depositType: e.target.value }))}
              placeholder="e.g. Advance, Refundable"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Charges</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {form.items.map((item, index) => (
              <div key={index} className="flex flex-wrap gap-2 items-end p-3 border border-border rounded-lg bg-muted/30">
                <div className="flex-1 min-w-[200px] space-y-1.5">
                  <Label htmlFor={`service-${index}`}>Service</Label>
                  <Select value={item.serviceId ?? ''} onValueChange={(v: string) => handleServiceChange(index, v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select service or type name" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">— Free text —</SelectItem>
                      {data.services.map((s) => (
                        <SelectItem key={s._id} value={s._id}>
                          {s.name} — {s.price ? formatCurrency(s.price) : '—'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!item.serviceId && (
                    <Input
                      id={`name-${index}`}
                      value={item.name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleItemChange(index, 'name', e.target.value)}
                      placeholder="Charge name"
                    />
                  )}
                </div>
                <div className="w-24 space-y-1.5">
                  <Label htmlFor={`qty-${index}`}>Qty</Label>
                  <Input
                    id={`qty-${index}`}
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleItemChange(index, 'quantity', Number(e.target.value) || 1)}
                    className="w-full"
                  />
                </div>
                <div className="w-32 space-y-1.5">
                  <Label htmlFor={`price-${index}`}>Unit Price</Label>
                  <Input
                    id={`price-${index}`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.unitPrice}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleItemChange(index, 'unitPrice', Number(e.target.value) || 0)}
                    className="w-full"
                  />
                </div>
                <div className="w-32 space-y-1.5">
                  <Label htmlFor={`total-${index}`}>Line Total</Label>
                  <Input
                    id={`total-${index}`}
                    value={item.lineTotal}
                    readOnly
                    className="w-full bg-muted text-right font-mono"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeItem(index)}
                  disabled={form.items.length === 1}
                  className="h-8"
                  aria-label="Remove charge"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addItem} className="w-fit">
              Add charge
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Totals</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Subtotal</Label>
            <div className="text-2xl font-bold tabular-nums">{formatCurrency(String(subtotal))}</div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="discount">Discount</Label>
            <Input
              id="discount"
              type="number"
              step="0.01"
              min="0"
              value={form.discount}
              onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vat">VAT</Label>
            <Input
              id="vat"
              type="number"
              step="0.01"
              min="0"
              value={form.vat}
              onChange={(e) => setForm((f) => ({ ...f, vat: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Gross Total</Label>
            <div className="text-2xl font-bold tabular-nums text-primary">{formatCurrency(String(grossTotal))}</div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-1.5">
        <Label htmlFor="remarks">Remarks</Label>
        <Textarea
          id="remarks"
          value={form.remarks}
          onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
          placeholder="Optional notes (max 500 chars)"
          maxLength={500}
          rows={3}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3 pt-4 border-t border-border">
        <Button type="button" variant="outline" onClick={() => navigate('/invoices')}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create Invoice'}
        </Button>
      </div>
    </form>
  )
}

export default InvoiceCreatePage