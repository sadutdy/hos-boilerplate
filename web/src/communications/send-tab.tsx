import { useRef, useState, type FormEvent } from 'react'
import { api, ApiRequestError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import { Textarea } from '@/components/ui/text-area'
import { PatientPicker } from '@/appointments/patient-picker'
import { PlaceholderChips, ResultSummary, SmsCounter } from './shared'
import type { CommsChannel, MessageTemplate, Patient, SendResult } from '@/types'

type RecipientType = 'patients' | 'all-patients' | 'doctors' | 'manual'

const RECIPIENTS: { value: RecipientType; label: string }[] = [
  { value: 'patients', label: 'Chosen patients' },
  { value: 'all-patients', label: 'All patients' },
  { value: 'doctors', label: 'All doctors' },
  { value: 'manual', label: 'Phone numbers (testing)' },
]

export function SendTab({ templates }: { templates: MessageTemplate[] }) {
  const [channel, setChannel] = useState<CommsChannel>('sms')
  const [recipientType, setRecipientType] = useState<RecipientType>('patients')
  const [picked, setPicked] = useState<Patient[]>([])
  const [clearPicker, setClearPicker] = useState(0)
  const [phoneList, setPhoneList] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [text, setText] = useState('')
  const [style, setStyle] = useState<'quick' | 'campaign'>('quick')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<{ recipients: number; withoutPhone: number } | null>(null)
  const [result, setResult] = useState<SendResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const textRef = useRef<HTMLTextAreaElement>(null)

  const usable = templates.filter((t) => (channel === 'voice' ? t.channel === 'voice' && t.mediaPath : t.channel !== 'voice'))
  const voiceTemplatesMissing = channel === 'voice' && usable.length === 0

  function payload(dryRun = false) {
    return {
      channel,
      recipientType,
      patientIds: recipientType === 'patients' ? picked.map((p) => p._id) : undefined,
      phoneList: recipientType === 'manual' ? phoneList : undefined,
      templateId: templateId || undefined,
      text: channel === 'sms' ? text : undefined,
      style,
      dryRun,
    }
  }

  function resetFeedback() {
    setError(null)
    setFieldErrors({})
    setResult(null)
  }

  async function run(dryRun: boolean): Promise<boolean> {
    resetFeedback()
    setPreview(null)
    setBusy(true)
    try {
      if (dryRun) {
        setPreview(await api.post<{ recipients: number; withoutPhone: number }>('/messages/broadcast', payload(true)))
      } else {
        setResult(await api.post<SendResult>('/messages/broadcast', payload()))
      }
      return true
    } catch (e) {
      if (e instanceof ApiRequestError) {
        setError(e.message)
        setFieldErrors(e.fields ?? {})
      } else {
        setError('Could not reach the server. Try again.')
      }
      return false
    } finally {
      setBusy(false)
    }
  }

  // Whole-register sends can't be recalled: count first, then ask.
  const bulk = recipientType === 'all-patients' || recipientType === 'doctors'
  const [confirming, setConfirming] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (bulk && !confirming) {
      if (await run(true)) setConfirming(true)
      return
    }
    setConfirming(false)
    void run(false)
  }

  function pickTemplate(id: string) {
    setTemplateId(id)
    const t = templates.find((x) => x._id === id)
    if (t?.text && channel === 'sms') setText(t.text)
  }

  const fieldError = (k: string) =>
    fieldErrors[k] ? <p className="text-xs text-destructive">{fieldErrors[k]}</p> : null

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-5 rounded-lg border border-border bg-card p-5" noValidate>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Channel</legend>
        <div className="flex gap-2">
          {(['sms', 'voice'] as const).map((c) => (
            <Button
              key={c}
              variant={channel === c ? 'default' : 'outline'}
              size="sm"
              aria-pressed={channel === c}
              onClick={() => {
                setChannel(c)
                setTemplateId('')
                resetFeedback()
              }}
            >
              {c === 'sms' ? 'SMS' : 'Voice call'}
            </Button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bc-recipients">Recipients</Label>
        <NativeSelect
          id="bc-recipients"
          value={recipientType}
          onChange={(e) => {
            setRecipientType(e.target.value as RecipientType)
            setPreview(null)
            setConfirming(false)
          }}
        >
          {RECIPIENTS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </NativeSelect>
        {fieldError('recipientType')}

        {recipientType === 'patients' && (
          <div className="flex flex-col gap-2">
            <PatientPicker
              clearSignal={clearPicker}
              onPick={(p) => {
                setPicked((list) => (list.some((x) => x._id === p._id) ? list : [...list, p]))
                setClearPicker((n) => n + 1)
                setPreview(null)
              }}
            />
            {picked.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Chosen patients">
                {picked.map((p) => (
                  <li key={p._id} className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pl-2.5 pr-1 text-xs">
                    {p.name}
                    {!p.phone && <span className="text-destructive">(no phone)</span>}
                    <button
                      type="button"
                      aria-label={`Remove ${p.name}`}
                      className="rounded-full px-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      onClick={() => setPicked((list) => list.filter((x) => x._id !== p._id))}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {fieldError('patientIds')}
          </div>
        )}

        {recipientType === 'manual' && (
          <>
            <Textarea
              id="bc-phones"
              aria-label="Phone numbers"
              value={phoneList}
              onChange={(e) => setPhoneList(e.target.value)}
              placeholder="03001234567, 03017654321"
              rows={2}
            />
            <p className="text-xs text-muted-foreground">Comma or line separated. Local numbers get the country code added.</p>
            {fieldError('phoneList')}
          </>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bc-template">{channel === 'voice' ? 'Recording' : 'Template (optional)'}</Label>
        <NativeSelect id="bc-template" value={templateId} onChange={(e) => pickTemplate(e.target.value)} disabled={voiceTemplatesMissing}>
          <option value="">{voiceTemplatesMissing ? 'No recorded templates yet' : channel === 'voice' ? 'Choose a recording' : 'Write a new message'}</option>
          {usable.map((t) => (
            <option key={t._id} value={t._id}>{t.name}</option>
          ))}
        </NativeSelect>
        {voiceTemplatesMissing && (
          <p className="text-xs text-muted-foreground">Add a voice template and upload its recording on the Templates tab first.</p>
        )}
        {fieldError('templateId')}
      </div>

      {channel === 'sms' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bc-text">Message</Label>
          <Textarea
            id="bc-text"
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={1000}
            aria-invalid={Boolean(fieldErrors.text)}
          />
          <div className="flex flex-wrap items-start justify-between gap-2">
            <PlaceholderChips target={textRef} value={text} onChange={setText} only={['{{patient.name}}', '{{institute.name}}']} />
            <SmsCounter text={text} />
          </div>
          {fieldError('text')}
        </div>
      )}

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Delivery</legend>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="bc-style" className="mt-1" checked={style === 'quick'} onChange={() => setStyle('quick')} />
          <span>
            Direct <span className="text-muted-foreground">— one transmission per number; personalised text works.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="bc-style" className="mt-1" checked={style === 'campaign'} onChange={() => setStyle('campaign')} />
          <span>
            Campaign <span className="text-muted-foreground">— one provider campaign for the whole list; best for large sends. Personalised text falls back to direct.</span>
          </span>
        </label>
      </fieldset>

      {preview && (
        <p role="status" className={`text-sm ${confirming ? 'font-medium' : ''}`}>
          {confirming && 'Send to '}
          {preview.recipients} recipient{preview.recipients === 1 ? '' : 's'}{confirming && '?'}
          {preview.withoutPhone > 0 && <span className="text-muted-foreground"> · {preview.withoutPhone} without a phone number will be left out</span>}
        </p>
      )}
      {error && !result && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {result && <ResultSummary result={result} />}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || voiceTemplatesMissing || (confirming && !preview?.recipients)}>
          {busy ? 'Sending…' : confirming ? `Yes, send to ${preview?.recipients ?? 0}` : 'Send'}
        </Button>
        {confirming && (
          <Button variant="ghost" disabled={busy} onClick={() => { setConfirming(false); setPreview(null) }}>
            Cancel
          </Button>
        )}
        <Button variant="outline" disabled={busy} onClick={() => void run(true)}>
          Count recipients
        </Button>
      </div>
    </form>
  )
}
