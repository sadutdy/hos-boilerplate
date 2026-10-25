import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input, Label as FieldLabel } from '@/components/ui/input'
import { code128BSvg } from '@/barcode/code128'

function pad10(value: string): string {
  return value.replace(/\D/g, '').slice(0, 10).padStart(10, '0')
}

function Label({ code }: { code: string }) {
  return (
    <figure className="flex flex-col items-center gap-1 border border-dashed border-border/50 p-1.5">
      <span className="font-mono text-[10px] text-muted-foreground" aria-hidden dangerouslySetInnerHTML={{ __html: code128BSvg(code, { height: 30, scale: 2 }) }} />
      <figcaption className="font-mono text-[10px] tracking-widest">{code}</figcaption>
    </figure>
  )
}

export function BarcodePage() {
  const [raw, setRaw] = useState('')

  const base = useMemo(() => pad10(raw), [raw])
  const valid = raw.replace(/\D/g, '').length === 10 && /^\d{10}$/.test(base)

  const codes = useMemo(() => {
    if (!valid) return []
    const start = Number(base)
    return Array.from({ length: 14 * 3 }, (_, i) => String(start + i).padStart(10, '0'))
  }, [valid, base])

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Barcode label sheet"
        description="Type a 10-digit starting code — you get a 3 × 14 sheet of sequential Code-128 labels to print and cut."
        actions={
          codes.length > 0 ? (
            <Button onClick={() => window.print()}>Print sheet</Button>
          ) : null
        }
      />

      <div className="max-w-md rounded-lg border border-border bg-card p-5">
        <FieldLabel htmlFor="barcode-code">Starting code (10 digits)</FieldLabel>
        <Input
          id="barcode-code"
          inputMode="numeric"
          value={raw}
          onChange={(e) => setRaw(e.target.value.slice(0, 10))}
          placeholder="1000000000"
          maxLength={10}
          aria-describedby="barcode-help"
        />
        <p id="barcode-help" className="mt-1 text-xs text-muted-foreground">
          {valid
            ? `Labels run ${base} → ${String(Number(base) + 41).padStart(10, '0')}.`
            : 'Digits only; shorter entries get zero-padded.'}
        </p>
      </div>

      {codes.length > 0 && (
        <div id="barcode-sheet" className="grid grid-cols-7 gap-1.5 rounded-lg border border-border bg-card p-4 sm:grid-cols-7 print:border-0 print:bg-white print:p-0">
          {codes.map((c) => (
            <Label key={c} code={c} />
          ))}
        </div>
      )}

      <style>{`@media print {
        body *:not(#barcode-sheet):not(#barcode-sheet *) { visibility: hidden; }
        #barcode-sheet { position: absolute; inset: 0; grid-template-columns: repeat(7, 1fr); }
        #barcode-sheet figure { break-inside: avoid; }
      }`}</style>
    </div>
  )
}

export default BarcodePage
