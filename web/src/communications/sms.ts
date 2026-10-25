// Plain helpers kept apart from the components so fast refresh keeps working.

export const PLACEHOLDERS = [
  { token: '{{patient.name}}', hint: 'Patient name' },
  { token: '{{institute.name}}', hint: 'Hospital name' },
  { token: '{{appointment.date}}', hint: 'Appointment day (reminders)' },
  { token: '{{appointment.time}}', hint: 'Appointment time (reminders)' },
  { token: '{{invoice.balance}}', hint: 'Amount owed (payment reminder)' },
] as const

/** SMS segments: GSM-7 fits 160 (153 per part); anything else is UCS-2 at 70 (67 per part). */
export function smsLength(text: string) {
  const unicode = /[^\x20-\x7E\n\r£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¤¡ÄÖÑÜ§¿äöñüà€]/.test(text)
  const single = unicode ? 70 : 160
  const multi = unicode ? 67 : 153
  const parts = text.length === 0 ? 0 : text.length <= single ? 1 : Math.ceil(text.length / multi)
  return { chars: text.length, parts, unicode }
}
