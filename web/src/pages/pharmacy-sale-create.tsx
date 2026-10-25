import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiRequestError } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { PatientPicker } from '@/appointments/patient-picker'
import { formatDateTime } from '@/lib/format'
import type { Medicine, PharmacySale, SaleCreateData } from '@/types'

interface Row {
  medicineId: string | null
  name: string
  quantity: string
  unitPrice: string
  stock: number
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function PharmacySaleCreatePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const prescriptionParam = params.get('prescription')
  const patientParam = params.get('patient')

  const [patient, setPatient] = useState<{ id: string; name: string } | null>(null)
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [medError, setMedError] = useState<string | null>(null)
  const [picker, setPicker] = useState('') // client-side catalogue filter
  const [rows, setRows] = useState<Row[]>([])
  const [discount, setDiscount] = useState('')
  const [vat, setVat] = useState('')
  const [amountReceived, setAmountReceived] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [submitting, setSubmitting] = useState(false)
  const [source, setSource] = useState<string | null>(null) // where the pre-fill came from

  const loadData = useCallback(async () => {
    const p = new URLSearchParams()
    if (prescriptionParam) p.set('prescription', prescriptionParam)
    if (patientParam) p.set('patient', patientParam)
    try {
      const d = await api.get<SaleCreateData>(`/pharmacy-sales/create-data${p.toString() ? `?${p.toString()}` : ''}`)
      setMedicines(d.medicines)
      if (d.patient) setPatient({ id: d.patient._id, name: d.patient.name })
      if (d.prescription) {
        const preRows: Row[] = d.prescription.items.map((it) => {
          const med = d.medicines.find((m) => m._id === it.medicineId)
          return {
            medicineId: it.medicineId ?? null,
            name: it.name,
            quantity: '1',
            unitPrice: med?.sellingPrice ?? '',
            stock: med?.quantity ?? 0,
          }
        })
        setRows(preRows)
        setSource(`prescription of ${formatDateTime(d.prescription.date)}`)
      }
    } catch (e) {
      setMedError(e instanceof Error ? e.message : 'Failed to load catalog.')
    }
  }, [prescriptionParam, patientParam])

  useEffect(() => {
    loadData()
  }, [loadData])


  const shownMeds = useMemo(() => {
    const q = picker.trim().toLowerCase()
    if (!q) return medicines.slice(0, 12)
    return medicines.filter((m) => (m.generic ?? '').toLowerCase().includes(q) || m.name.toLowerCase().includes(q)).slice(0, 12)
  }, [medicines, picker])

  const totals = useMemo(() => {
    const amount = round2(
      rows.reduce((a, r) => {
        const price = Number(r.unitPrice) || 0
        return a + price * (Number(r.quantity) || 0)
      }, 0),
    )
    const disc = round2(Number(discount) || 0)
    const v = round2(Number(vat) || 0)
    const gross = round2(Math.max(0, amount - disc + v))
    const received = round2(Number(amountReceived) || 0)
    return { amount, gross, disc: disc, vat: v, received }
  }, [rows, discount, vat, amountReceived])

  function setRow(i: number, row: Row) {
    setRows((prev) => prev.map((r, j) => (j === i ? row : r)))
  }

  function addRow() {
    setRows((prev) => [...prev, { medicineId: null, name: '', quantity: '1', unitPrice: '', stock: 0 }])
  }

  function pickMedicine(m: Medicine) {
    setRows((prev) => [
      ...prev,
      { medicineId: m._id, name: m.name, quantity: '1', unitPrice: m.sellingPrice ?? '', stock: m.quantity },
    ])
    setPicker('')
  }



  const overStock: Record<number, string> = {}
  rows.forEach((r, i) => {
    if (r.medicineId && Number(r.quantity) > r.stock && r.stock > 0)
      overStock[i] = `Only ${r.stock} in stock.`
    if (r.medicineId && r.stock === 0) overStock[i] = 'Out of stock.'
  })

  async function submit() {
    if (!rows.some((r) => (r.medicineId ?? r.name.trim()))) {
      setError(new Error('Add at least one item.'))
      return
    }
    setSubmitting(true)
    setError(null)
    const body = {
      patientId: patient?.id ?? null,
      // date defaults to now server-side
      items: rows
        .filter((r) => r.medicineId || r.name.trim())
        .map((r) => ({
          medicineId: r.medicineId,
          name: r.medicineId ? undefined : r.name.trim(),
          quantity: Number(r.quantity),
          unitPrice: r.unitPrice === '' ? undefined : Number(r.unitPrice),
        })),
      discount: discount === '' ? undefined : Number(discount),
      vat: vat === '' ? undefined : Number(vat),
      amountReceived: amountReceived === '' ? undefined : Number(amountReceived),
    }
    try {
      const created = await api.post<{
        sale: PharmacySale
        /** real API returns the sale doc directly */
      }>('/pharmacy-sales', body)
      navigate(`/pharmacy/${(created as unknown as PharmacySale)._id}`)
    } catch (e) {
      setError(e)
      setSubmitting(false)
    }
  }

  const itemFieldErrors = error instanceof ApiRequestError ? (error.fields?.items ?? null) : null
  const discountError = error instanceof ApiRequestError ? (error.fields?.discount ?? null) : null
  const otherError =
    error instanceof ApiRequestError
      ? error.fields && Object.keys(error.fields).length
        ? null
        : error.message
      : error instanceof Error
        ? error.message
        : null

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader
        title="New pharmacy sale"
        description="Header + rows + stock decrement commit together; nothing books on failure."
      />

      {source && (
        <p className="text-sm text-muted-foreground">
          Pre-filled from a {source}.{' '}
          <Link to="/pharmacy" className="underline underline-offset-2">
            Cancel
          </Link>
        </p>
      )}

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="space-y-1.5">
          <Label>Patient (optional — counter sale)</Label>
          {patient ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium">{patient.name}</span>
              <Button variant="ghost" size="sm" onClick={() => setPatient(null)}>
                Clear
              </Button>
            </div>
          ) : (
            <PatientPicker onPick={(p) => setPatient({ id: p._id, name: p.name })} />
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <Label htmlFor="sale-catalogue">Add catalogue items</Label>
        <Input
          id="sale-catalogue"
          type="search"
          className="mt-1.5"
          placeholder="Search the in-stock catalogue (also matches generic names)"
          value={picker}
          onChange={(e) => setPicker(e.target.value)}
        />
        {medError ? (
          <p className="mt-2 text-sm text-destructive">{medError}</p>
        ) : shownMeds.length > 0 && (
          <ul className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border/60" aria-label="In-stock medicines">
            {shownMeds.map((m) => (
              <li key={m._id}>
                <button
                  type="button"
                  className="flex w-full items-baseline justify-between gap-3 rounded-sm px-3 py-2 text-left text-sm hover:bg-accent/50"
                  onClick={() => pickMedicine(m)}
                >
                  <span>
                    <span className="font-medium">{m.name}</span>{' '}
                    <span className="text-xs text-muted-foreground">{m.generic || ''}</span>
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {m.sellingPrice != null ? `${m.sellingPrice} · ` : ''}
                    {m.quantity} in stock
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {shownMeds.length === 0 && picker.trim() && !medError && (
          <p className="mt-2 text-sm text-muted-foreground">No in-stock names match “{picker}”.</p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-baseline justify-between">
          <Label>Sale rows</Label>
          <Button variant="ghost" size="sm" onClick={addRow}>
            Add free-typed line
          </Button>
        </div>
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {itemFieldErrors ?? 'Nothing yet — pick items above or add a free-typed line.'}
          </p>
        )}
        <ul className="flex flex-col gap-3" aria-label="Sale items">
          {rows.map((r, i) => (
            <li key={i} className="rounded-md border border-border p-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                {r.medicineId ? (
                  <div className="text-sm">
                    <span className="font-medium">{r.name}</span>{' '}
                    <span className="text-xs text-muted-foreground">{overStock[i] ?? `${r.stock} in stock`}</span>
                  </div>
                ) : (
                  <Input
                    value={r.name}
                    onChange={(e) => {
                      setRows((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value, stock: 0, medicineId: null } : x)))
                    }}
                    placeholder="Free-typed item (e.g. imported dressing)"
                    maxLength={200}
                    aria-label="Item name"
                  />
                )}
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={r.quantity}
                  onChange={(e) => setRow(i, { ...r, quantity: e.target.value })}
                  aria-label={`Quantity for row ${i + 1}`}
                  placeholder="Qty"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={r.unitPrice || ''}
                  onChange={(e) => setRow(i, { ...r, unitPrice: e.target.value })}
                  placeholder="Unit price…"
                  aria-label={`Unit price for row ${i + 1}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove row ${i + 1}`}
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Line total {round2((Number(r.unitPrice) || 0) * (Number(r.quantity) || 0)).toFixed(2)}
                {r.unitPrice === '' && r.medicineId ? ' — snapshots catalogue selling price on the server' : ''}
              </p>
            </li>
          ))}
        </ul>
        {itemFieldErrors && rows.length > 0 && <p className="text-sm text-destructive">{itemFieldErrors}</p>}
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="sale-discount">Discount</Label>
            <Input id="sale-discount" type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00" />
            {discountError && <p className="text-xs text-destructive">{discountError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sale-vat">VAT</Label>
            <Input id="sale-vat" type="number" min="0" step="0.01" value={vat} onChange={(e) => setVat(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sale-recv">Amount received</Label>
            <Input id="sale-recv" type="number" min="0" step="0.01" value={amountReceived} onChange={(e) => setAmountReceived(e.target.value)} placeholder={totals.gross.toFixed(2)} />
            <p className="text-xs text-muted-foreground">
              {amountReceived === ''
                ? 'Defaults to the gross total.'
                : totals.received > totals.gross
                  ? `Change due: ${(totals.received - totals.gross).toFixed(2)}`
                  : totals.received < totals.gross
                    ? `Short by ${(totals.gross - totals.received).toFixed(2)}`
                    : 'Exact.'}
            </p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
          <dt className="text-muted-foreground">Items subtotal</dt>
          <dd>{totals.amount.toFixed(2)}</dd>
          <dt className="text-muted-foreground">Gross total</dt>
          <dd className="font-semibold">{totals.gross.toFixed(2)}</dd>
        </dl>
      </div>

      {otherError && (
        <p role="alert" className="text-sm text-destructive">{otherError}</p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate(-1)} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={submitting}>
          {submitting ? 'Booking…' : 'Book sale'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Nothing books unless the whole transaction passes — stock never goes negative.</p>
    </div>
  )
}

export default PharmacySaleCreatePage
