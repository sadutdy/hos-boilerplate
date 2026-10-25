import type { AppointmentStatus } from '@/types'

/**
 * Status vocabulary (rebuild-spec 04 §3) with the colour map for the day view.
 * Colours use semantic tokens so they hold in light, dark, and high contrast.
 * Chip text is always the status word — colour is never the only carrier.
 */
export const APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'scheduled',
  'arrived',
  'completed',
  'cancelled',
  'no show',
]

export const statusChipClass: Record<AppointmentStatus, string> = {
  scheduled: 'bg-muted text-foreground/80 border-border',
  arrived: 'bg-accent text-accent-foreground border-accent',
  completed: 'bg-success/15 text-success border-success/30',
  cancelled: 'bg-muted text-muted-foreground border-border line-through decoration-1',
  'no show': 'bg-warning/15 text-warning border-warning/30',
}

export function statusLabel(s: AppointmentStatus): string {
  return s === 'no show' ? 'No show' : s.charAt(0).toUpperCase() + s.slice(1)
}

export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const end = new Date(2000, 0, 1, h ?? 0, m ?? 0)
  end.setMinutes(end.getMinutes() + minutes)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(end.getHours())}:${pad(end.getMinutes())}`
}

export function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function shiftDateStr(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const weekdayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
})

export function humanDate(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return date
  if (date === todayStr()) return 'Today'
  const yest = shiftDateStr(todayStr(), -1)
  if (date === yest) return 'Yesterday'
  const tomorrow = shiftDateStr(todayStr(), 1)
  if (date === tomorrow) return 'Tomorrow'
  return weekdayFmt.format(d)
}
