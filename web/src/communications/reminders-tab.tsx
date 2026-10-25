import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, ApiRequestError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import { Textarea } from '@/components/ui/text-area'
import { PlaceholderChips, ResultSummary, SmsCounter } from './shared'
import type { CommsChannel, MessageTemplate, NotificationType, NotificationTypesResponse, SendResult } from '@/types'

const COPY = {
  appointment: {
    title: 'Appointment reminders',
    blurb: 'At the set time each day, texts or calls patients booked for the next day. Cancelled and completed bookings are left out.',
    placeholders: ['{{patient.name}}', '{{institute.name}}', '{{appointment.date}}', '{{appointment.time}}'],
  },
  payment: {
    title: 'Payment reminders',
    blurb: 'At the set time each day, contacts patients who still owe money on their invoices — once per patient per day.',
    placeholders: ['{{patient.name}}', '{{institute.name}}', '{{invoice.balance}}'],
  },
} as const

export function RemindersTab({ templates }: { templates: MessageTemplate[] }) {
  const [data, setData] = useState<NotificationTypesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.get<NotificationTypesResponse>('/notification-types').then(
      (d) => !cancelled && setData(d),
      (e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load reminder settings.'),
    )
    return () => { cancelled = true }
  }, [])

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>
  if (!data) return <div className="h-40 animate-pulse rounded-lg bg-muted" />

  const byKey = Object.fromEntries(data.items.map((t) => [t.key, t]))
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {(['appointment', 'payment'] as const).map((key) => (
        <ReminderCard
          key={key}
          type={byKey[key] ?? { key, channel: 'sms', enabled: false, time: '', fallbackText: '' }}
          timezone={data.timezone}
          templates={templates}
          onSaved={setData}
        />
      ))}
    </div>
  )
}

function ReminderCard({
  type,
  timezone,
  templates,
  onSaved,
}: {
  type: NotificationType
  timezone: string
  templates: MessageTemplate[]
  onSaved: (d: NotificationTypesResponse) => void
}) {
  const copy = COPY[type.key]
  const [enabled, setEnabled] = useState(type.enabled)
  const [channel, setChannel] = useState<CommsChannel>(type.channel || 'sms')
  const [time, setTime] = useState(type.time)
  const [templateId, setTemplateId] = useState(type.templateId ?? '')
  const [text, setText] = useState(type.defaultText ?? '')
  const [busy, setBusy] = useState<'save' | 'run' | null>(null)
  const [days, setDays] = useState(1)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [result, setResult] = useState<SendResult | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  const choices = templates.filter((t) => (channel === 'voice' ? t.channel === 'voice' && t.mediaPath : t.channel !== 'voice'))
  const dirty =
    enabled !== type.enabled || channel !== type.channel || time !== type.time ||
    templateId !== (type.templateId ?? '') || text !== (type.defaultText ?? '')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy('save')
    setError(null)
    setFields({})
    setSaved(false)
    try {
      onSaved(await api.put<NotificationTypesResponse>(`/notification-types/${type.key}`, { enabled, channel, time, templateId, defaultText: text }))
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again.')
      setFields(err instanceof ApiRequestError ? err.fields ?? {} : {})
    } finally {
      setBusy(null)
    }
  }

  async function runNow() {
    setBusy('run')
    setResult(null)
    setError(null)
    try {
      setResult(await api.post<SendResult>(`/notification-types/${type.key}/run`, { days }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not run the reminder. Try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5" noValidate aria-label={copy.title}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{copy.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.blurb}</p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="size-4" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          On
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${type.key}-time`}>Send at</Label>
          <Input id={`${type.key}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-invalid={Boolean(fields.time)} />
          <p className="text-xs text-muted-foreground">{time ? `Daily, ${timezone} time.` : 'No time set: runs only when started by hand.'}</p>
          {fields.time && <p className="text-xs text-destructive">{fields.time}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${type.key}-channel`}>Channel</Label>
          <NativeSelect id={`${type.key}-channel`} value={channel} onChange={(e) => { setChannel(e.target.value as CommsChannel); setTemplateId('') }}>
            <option value="sms">SMS</option>
            <option value="voice">Voice call</option>
          </NativeSelect>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${type.key}-template`}>{channel === 'voice' ? 'Recording' : 'Template (optional)'}</Label>
        <NativeSelect id={`${type.key}-template`} value={templateId} onChange={(e) => setTemplateId(e.target.value)} aria-invalid={Boolean(fields.templateId)}>
          <option value="">{channel === 'voice' ? (choices.length ? 'Choose a recording' : 'No recorded templates yet') : 'Use the text below'}</option>
          {choices.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
        </NativeSelect>
        {fields.templateId && <p className="text-xs text-destructive">{fields.templateId}</p>}
      </div>

      {channel === 'sms' && !templateId && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${type.key}-text`}>Message</Label>
          <Textarea
            id={`${type.key}-text`}
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={type.fallbackText}
          />
          <div className="flex flex-wrap items-start justify-between gap-2">
            <PlaceholderChips target={textRef} value={text} onChange={setText} only={copy.placeholders} />
            <SmsCounter text={text || type.fallbackText} />
          </div>
          {!text && <p className="text-xs text-muted-foreground">Empty: the default shown above is sent.</p>}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {saved && !dirty && <p role="status" className="text-sm text-muted-foreground">Saved.</p>}
      {result && <ResultSummary result={result} />}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button type="submit" disabled={busy !== null || !dirty}>{busy === 'save' ? 'Saving…' : 'Save'}</Button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        {type.key === 'appointment' && (
          <NativeSelect aria-label="Which day to remind" className="w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={0}>Today’s appointments</option>
            <option value={1}>Tomorrow’s appointments</option>
          </NativeSelect>
        )}
        <Button variant="outline" disabled={busy !== null || dirty || !type.enabled} onClick={() => void runNow()} title={dirty ? 'Save first' : !type.enabled ? 'Turn the reminder on and save first' : undefined}>
          {busy === 'run' ? 'Sending…' : 'Send now'}
        </Button>
      </div>
    </form>
  )
}
