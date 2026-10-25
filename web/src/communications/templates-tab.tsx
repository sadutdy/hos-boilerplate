import { useRef, useState, type FormEvent } from 'react'
import { api, ApiRequestError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input, Label } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import { Textarea } from '@/components/ui/text-area'
import { DialogShell } from '@/pages/beds-board'
import { PlaceholderChips, SmsCounter } from './shared'
import type { CommsChannel, MessageTemplate } from '@/types'

export function TemplatesTab({
  templates,
  canManage,
  onChanged,
}: {
  templates: MessageTemplate[]
  canManage: boolean
  onChanged: () => void
}) {
  const [editing, setEditing] = useState<MessageTemplate | 'new' | null>(null)
  const [deleting, setDeleting] = useState<MessageTemplate | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadFor = useRef<MessageTemplate | null>(null)

  async function onDelete() {
    if (!deleting) return
    setBusy(true)
    try {
      await api.delete(`/message-templates/${deleting._id}`)
      setMessage({ kind: 'ok', text: `Deleted “${deleting.name}”.` })
      onChanged()
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not delete. Try again.' })
    } finally {
      setBusy(false)
      setDeleting(null)
    }
  }

  async function onFile(file: File | undefined) {
    const t = uploadFor.current
    if (!file || !t) return
    setBusy(true)
    setMessage(null)
    try {
      await api.putFile(`/message-templates/${t._id}/media`, file, 'audio/wav')
      setMessage({ kind: 'ok', text: `Recording saved for “${t.name}”.` })
      onChanged()
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Upload failed. Try again.' })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          SMS templates hold text with placeholders. Voice templates hold an 8 kHz mono WAV recording.
        </p>
        {canManage && <Button onClick={() => { setEditing('new'); setMessage(null) }}>Add template</Button>}
      </div>

      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={`text-sm ${message.kind === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
          {message.text}
        </p>
      )}

      {templates.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm">
          <p className="font-medium">No templates yet.</p>
          {canManage && <p className="mt-1 text-muted-foreground">Add one to reuse a message or a recorded call.</p>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">Template</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Channel</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Content</th>
                {canManage && <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t._id} className="border-b border-border/60 align-top last:border-0">
                  <td className="px-4 py-3 font-medium">{t.name}</td>
                  <td className="px-4 py-3">{t.channel === 'voice' ? 'Voice' : 'SMS'}</td>
                  <td className="hidden max-w-md px-4 py-3 text-muted-foreground md:table-cell">
                    {t.channel === 'voice'
                      ? t.mediaPath ? 'Recording uploaded' : <span className="text-destructive">No recording yet</span>
                      : <span className="line-clamp-2">{t.text}</span>}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {t.channel === 'voice' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                              uploadFor.current = t
                              fileRef.current?.click()
                            }}
                          >
                            {t.mediaPath ? 'Replace recording' : 'Upload recording'}
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => { setEditing(t); setMessage(null) }}>Edit</Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => setDeleting(t)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".wav,audio/wav,audio/x-wav"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => void onFile(e.target.files?.[0])}
      />

      {editing && (
        <TemplateForm
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null)
            setMessage({ kind: 'ok', text: `Saved “${name}”.` })
            onChanged()
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete template?"
        message={deleting?.channel === 'voice' ? `“${deleting?.name}” and its recording will be removed.` : `“${deleting?.name}” will be removed.`}
        busy={busy}
        onConfirm={onDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}

function TemplateForm({
  template,
  onClose,
  onSaved,
}: {
  template: MessageTemplate | null
  onClose: () => void
  onSaved: (name: string) => void
}) {
  const [name, setName] = useState(template?.name ?? '')
  const [channel, setChannel] = useState<CommsChannel>(template?.channel ?? 'sms')
  const [text, setText] = useState(template?.text ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const textRef = useRef<HTMLTextAreaElement>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setFields({})
    try {
      const body = { name, channel, text }
      if (template) await api.put(`/message-templates/${template._id}`, body)
      else await api.post('/message-templates', body)
      onSaved(name.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again.')
      setFields(err instanceof ApiRequestError ? err.fields ?? {} : {})
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogShell title={template ? 'Edit template' : 'Add template'} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tpl-name">Name</Label>
          <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus aria-invalid={Boolean(fields.name)} />
          {fields.name && <p className="text-xs text-destructive">{fields.name}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tpl-channel">Channel</Label>
          <NativeSelect id="tpl-channel" value={channel} onChange={(e) => setChannel(e.target.value as CommsChannel)}>
            <option value="sms">SMS</option>
            <option value="voice">Voice (recording)</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tpl-text">{channel === 'voice' ? 'Description (optional)' : 'Text'}</Label>
          <Textarea id="tpl-text" ref={textRef} value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={1000} aria-invalid={Boolean(fields.text)} />
          {channel === 'sms' && (
            <>
              <PlaceholderChips target={textRef} value={text} onChange={setText} />
              <SmsCounter text={text} />
            </>
          )}
          {channel === 'voice' && !template?.mediaPath && (
            <p className="text-xs text-muted-foreground">Save, then use “Upload recording” in the list.</p>
          )}
          {fields.text && <p className="text-xs text-destructive">{fields.text}</p>}
        </div>
        {error && !Object.keys(fields).length && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </DialogShell>
  )
}
