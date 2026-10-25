import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { can, useAuth } from '@/auth/auth-context'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SendTab } from '@/communications/send-tab'
import { TemplatesTab } from '@/communications/templates-tab'
import { RemindersTab } from '@/communications/reminders-tab'
import { LogTab } from '@/communications/log-tab'
import type { MessageTemplate } from '@/types'

/** Module 14 — broadcasts, templates, reminder settings and the outbox log. */
export function CommunicationsPage() {
  const { session } = useAuth()
  const [params, setParams] = useSearchParams()
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [nonce, setNonce] = useState(0)
  const reloadTemplates = useCallback(() => setNonce((n) => n + 1), [])

  const canSend = can(session, 'send_sms/voice')
  const canManage = can(session, 'send_notification')
  const canViewLog = can(session, 'view_sms_voice_reports')

  const tabs = [
    canSend && { value: 'send', label: 'Send' },
    canManage && { value: 'reminders', label: 'Reminders' },
    (canSend || canManage) && { value: 'templates', label: 'Templates' },
    canViewLog && { value: 'log', label: 'Log' },
  ].filter(Boolean) as { value: string; label: string }[]
  const requested = params.get('tab')
  const active = tabs.some((t) => t.value === requested) ? requested! : tabs[0]?.value

  useEffect(() => {
    if (!canSend && !canManage) return
    let cancelled = false
    api.get<{ items: MessageTemplate[] }>('/message-templates').then(
      (d) => !cancelled && setTemplates(d.items),
      () => { /* the tabs show their own empty states */ },
    )
    return () => { cancelled = true }
  }, [canSend, canManage, nonce])

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Communications"
        description="SMS and voice messages to patients and staff, automatic reminders, and a log of everything sent."
      />
      <Tabs value={active ?? ''} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList className="w-fit">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
        {canSend && (
          <TabsContent value="send" className="mt-4">
            <SendTab templates={templates} />
          </TabsContent>
        )}
        {canManage && (
          <TabsContent value="reminders" className="mt-4">
            <RemindersTab templates={templates} />
          </TabsContent>
        )}
        {(canSend || canManage) && (
          <TabsContent value="templates" className="mt-4">
            <TemplatesTab templates={templates} canManage={canManage} onChanged={reloadTemplates} />
          </TabsContent>
        )}
        {canViewLog && (
          <TabsContent value="log" className="mt-4">
            <LogTab canDelete={session?.role === 'admin'} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

export default CommunicationsPage
