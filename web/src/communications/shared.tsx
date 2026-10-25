import { Badge } from '@/components/ui/badge'
import type { CommsLog, SendResult } from '@/types'
import { PLACEHOLDERS, smsLength } from './sms'

export function SmsCounter({ text }: { text: string }) {
  const { chars, parts, unicode } = smsLength(text)
  return (
    <p className="text-xs text-muted-foreground tabular-nums">
      {chars} characters · {parts} SMS{unicode ? ' (Unicode)' : ''}
      {text.includes('{{') && ' · before placeholders are filled in'}
    </p>
  )
}

/** Clickable placeholder chips that insert at the caret of the given textarea. */
export function PlaceholderChips({
  target,
  value,
  onChange,
  only,
}: {
  target: React.RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (v: string) => void
  only?: readonly string[]
}) {
  const list = only ? PLACEHOLDERS.filter((p) => only.includes(p.token)) : PLACEHOLDERS
  function insert(token: string) {
    const el = target.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    onChange(value.slice(0, start) + token + value.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + token.length, start + token.length)
    })
  }
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Insert a placeholder">
      {list.map((p) => (
        <button
          key={p.token}
          type="button"
          title={p.hint}
          onClick={() => insert(p.token)}
          className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          {p.token}
        </button>
      ))}
    </div>
  )
}

export function StatusBadge({ status }: { status: CommsLog['status'] }) {
  if (status === 'failed') return <Badge variant="destructive">failed</Badge>
  if (status === 'queued') return <Badge variant="secondary">queued</Badge>
  return <Badge variant="outline">sent</Badge>
}

/** Outcome of a broadcast or reminder run, including the rows that were left out and why. */
export function ResultSummary({ result }: { result: SendResult }) {
  if (result.status === 'skipped') {
    return (
      <div role="status" className="rounded-md border border-border bg-muted/40 p-3 text-sm">
        <p className="font-medium">Nothing was sent.</p>
        <p className="mt-0.5 text-muted-foreground">{result.reason}</p>
        {!!result.alreadyReminded && (
          <p className="mt-0.5 text-muted-foreground">{result.alreadyReminded} already reminded earlier.</p>
        )}
      </div>
    )
  }
  const ok = result.failed === 0
  return (
    <div role="status" className={`rounded-md border p-3 text-sm ${ok ? 'border-border bg-muted/40' : 'border-destructive/40 bg-destructive/5'}`}>
      <p className="font-medium">
        {result.sent} sent{result.failed ? `, ${result.failed} failed` : ''}
        <span className="font-normal text-muted-foreground">
          {' '}via {result.provider}
          {result.style === 'campaign' ? ' (campaign)' : ''}
          {result.date ? ` · for ${result.date}` : ''}
        </span>
      </p>
      {!!result.alreadyReminded && (
        <p className="mt-0.5 text-muted-foreground">{result.alreadyReminded} already reminded earlier, skipped.</p>
      )}
      {result.errors?.map((e) => (
        <p key={e} className="mt-0.5 text-destructive">{e}</p>
      ))}
      {result.invalid.length > 0 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-muted-foreground">
            {result.invalid.length} left out: no usable phone number
          </summary>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {result.invalid.slice(0, 20).map((x, i) => (
              <li key={i}>{x.name ? `${x.name} — ` : ''}{x.phone || 'no number'}</li>
            ))}
            {result.invalid.length > 20 && <li>…and {result.invalid.length - 20} more</li>}
          </ul>
        </details>
      )}
    </div>
  )
}
