import { useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiRequestError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Textarea } from '@/components/ui/text-area'
import { toDateInputValue } from '@/lib/format'
import type { Medicine, PrescriptionItem } from '@/types'

export interface PrescriptionFormValues {
  patientId: string
  patientName: string
  doctorId: string
  date: string
  symptom: string
  advice: string
  note: string
  validity: string
  items: PrescriptionItem[]
}

export function fieldErrorOf(error: unknown, key: string): string | null {
  return error instanceof ApiRequestError ? (error.fields?.[key] ?? null) : null
}

export function formMessageOf(error: unknown): string | null {
  if (error instanceof ApiRequestError) return error.fields ? null : error.message
  return error instanceof Error ? error.message : null
}

const emptyItem: PrescriptionItem = {
  medicineId: null,
  name: '',
  dosage: '',
  duration: '',
  instructions: '',
}

export { emptyItem }

/**
 * Catalogue typeahead — picking a result carries the medicineId so the server
 * copies the canonical name; typing freely stays free-typed (explicitly legal).
 */
function MedicineNameInput({
  item,
  onChange,
  id,
}: {
  item: PrescriptionItem
  onChange: (item: PrescriptionItem) => void
  id: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<Medicine[] | null>(null)
  const [picked, setPicked] = useState<Medicine | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 1) {
      setResults(null)
      return
    }
    const timer = setTimeout(() => {
      api.get<{ items: Medicine[] }>(`/medicines?q=${encodeURIComponent(q)}&limit=8`).then(
        (d) => {
          setResults(d.items)
          setOpen(true)
        },
        () => setResults([]),
      )
    }, 220)
    return () => clearInterval(timer)
  }, [query])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div className="relative" ref={boxRef}>
      <Input
        id={id}
        maxLength={200}
        value={item.name}
        onChange={(e) => {
          setPicked(null)
          setQuery(e.target.value)
          onChange({ ...item, medicineId: null, name: e.target.value })
        }}
        placeholder="From catalogue or typed freely"
        aria-label="Medicine name"
        autoComplete="off"
        aria-expanded={open && Boolean(results?.length)}
        role="combobox"
        aria-controls={`${id}-results`}
      />
      {open && results && results.length > 0 && (
        <ul
          id={`${id}-results`}
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-popover p-1 text-sm shadow-md"
        >
          {results.map((m) => (
            <li key={m._id}>
              <button
                type="button"
                className="flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  setPicked(m)
                  setQuery('')
                  setOpen(false)
                  onChange({ ...item, medicineId: m._id, name: m.name })
                }}
              >
                <span className="font-medium">{m.name}</span>
                <span className="text-xs text-muted-foreground">
                  {[m.generic, m.company, m.box ? `pack ${m.box}` : null, m.quantity > 0 ? `stock ${m.quantity}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {picked && (
        <p className="mt-1 text-xs text-muted-foreground">Linked to catalogue — the name is copied from it.</p>
      )}
    </div>
  )
}

export function PrescriptionForm({
  initial,
  submitLabel,
  onSubmit,
  submitting,
  error,
  onCancel,
}: {
  initial: PrescriptionFormValues
  submitLabel: string
  onSubmit: (values: PrescriptionFormValues) => void
  submitting: boolean
  error: unknown
  onCancel: () => void
}) {
  const [values, setValues] = useState(initial)
  // The host page owns patient/doctor/date, so re-sync those keys if `initial`
  // changes after mount (e.g. the patient was picked after the form rendered).
  useEffect(() => {
    setValues((v) => {
      const next = { ...v }
      let changed = false
      for (const key of ['patientId', 'patientName', 'doctorId', 'date'] as const) {
        if (initial[key] !== v[key]) {
          next[key] = initial[key]
          changed = true
        }
      }
      return changed ? next : v
    })
  }, [initial.patientId, initial.patientName, initial.doctorId, initial.date])
  const set = <K extends keyof PrescriptionFormValues>(key: K) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setValues((v) => ({ ...v, [key]: e.target.value }))

  const setItem = (index: number, item: PrescriptionItem) => {
    setValues((v) => ({
      ...v,
      items: v.items.map((it, i) => (i === index ? item : it)),
    }))
  }
  const addItem = () => setValues((v) => ({ ...v, items: [...v.items, { ...emptyItem }] }))
  const removeItem = (index: number) =>
    setValues((v) => ({ ...v, items: v.items.filter((_, i) => i !== index) }))

  const validItems = useMemo(() => values.items.filter((it) => it.name.trim()), [values.items])

  return (
    <form className="space-y-4" noValidate onSubmit={(e) => e.preventDefault()}>
      <div className="space-y-1.5">
        <Label>Medicines</Label>
        {values.items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {fieldErrorOf(error, 'items') ?? 'No rows yet — free-typing is fine; the catalogue just keeps names tidy.'}
          </p>
        )}
        <ul className="flex flex-col gap-3" aria-label="Prescription items">
          {values.items.map((item, i) => (
            <li key={i} className="rounded-md border border-border p-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                <MedicineNameInput item={item} onChange={(it) => setItem(i, it)} id={`rx-item-${i}`} />
                <Input
                  value={item.dosage ?? ''}
                  onChange={(e) => setItem(i, { ...item, dosage: e.target.value })}
                  placeholder="1+0+1"
                  maxLength={100}
                  aria-label={`Dosage for row ${i + 1}`}
                  className="sm:w-24"
                />
                <Input
                  value={item.duration ?? ''}
                  onChange={(e) => setItem(i, { ...item, duration: e.target.value })}
                  placeholder="5 days"
                  maxLength={100}
                  aria-label={`Duration for row ${i + 1}`}
                  className="sm:w-24"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove row ${i + 1}`}
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => removeItem(i)}
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </Button>
              </div>
              <Input
                value={item.instructions ?? ''}
                onChange={(e) => setItem(i, { ...item, instructions: e.target.value })}
                placeholder="Instructions — after meals…"
                maxLength={500}
                aria-label={`Instructions for row ${i + 1}`}
                className="mt-2"
              />
            </li>
          ))}
        </ul>
        {validItems.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {validItems.length} medicine{validItems.length === 1 ? '' : 's'} will be saved; blank-resolved rows are dropped.
          </p>
        )}
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          Add medicine row
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="rx-symptom">Symptom</Label>
          <Input id="rx-symptom" maxLength={100} value={values.symptom} onChange={set('symptom')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rx-validity">Valid for</Label>
          <Input id="rx-validity" maxLength={100} placeholder="30 days" value={values.validity} onChange={set('validity')} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="rx-advice">Advice</Label>
          <Textarea id="rx-advice" rows={2} maxLength={1000} value={values.advice} onChange={set('advice')} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="rx-note">Note</Label>
          <Textarea id="rx-note" rows={2} maxLength={1000} value={values.note} onChange={set('note')} />
        </div>
      </div>

      {formMessageOf(error) && (
        <p role="alert" className="text-sm text-destructive">{formMessageOf(error)}</p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={() => onSubmit(values)}
          disabled={submitting}
        >
          {submitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}

export function toPrescriptionRequest(values: PrescriptionFormValues) {
  return {
    patientId: values.patientId,
    doctorId: values.doctorId,
    date: values.date ? new Date(values.date).toISOString() : undefined,
    symptom: values.symptom || null,
    advice: values.advice || null,
    note: values.note || null,
    validity: values.validity || null,
    items: values.items
      .filter((it) => it.name.trim())
      .map((it) => ({
        medicineId: it.medicineId || null,
        name: it.name.trim(),
        dosage: it.dosage || null,
        duration: it.duration || null,
        instructions: it.instructions || null,
      })),
  }
}

export function dateToInput(iso: string | undefined): string {
  return toDateInputValue(iso)
}
