import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface DashboardData {
  counts?: Record<string, number>
}

function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.get<DashboardData>('/dashboard').then(
      (d) => !cancelled && setData(d),
      (e) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load'),
    )
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        {error}
      </div>
    )
  }

  if (!data) {
    return (
      <div aria-hidden className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    )
  }

  const entries = Object.entries(data.counts ?? {})
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {entries.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-border bg-card p-4">
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          <p className="mt-1 text-sm capitalize text-muted-foreground">
            {label.replace(/([A-Z])/g, ' $1').toLowerCase()}
          </p>
        </div>
      ))}
    </div>
  )
}

export const Page = DashboardPage
export default DashboardPage
