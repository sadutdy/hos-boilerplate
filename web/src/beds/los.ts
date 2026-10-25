import { useEffect, useState } from 'react'

/** "2d 3h" style span; floors under an hour to minutes. */
export function formatElapsed(from: string | Date, to: string | Date | null = null): string {
  const start = new Date(from).getTime()
  const end = to ? new Date(to).getTime() : Date.now()
  if (Number.isNaN(start)) return '—'
  let minutes = Math.max(0, Math.floor((end - start) / 60000))
  const days = Math.floor(minutes / 1440)
  minutes -= days * 1440
  const hours = Math.floor(minutes / 60)
  const mins = minutes - hours * 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

/**
 * Interval ticking clock for live lengths-of-stay ("since {time}").
 * Motion is deliberate: one column updates at most every 30 s, and it
 * stops on unmount. Falls back to a static span when `to` is set.
 */
export function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
