import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { can, useAuth } from '@/auth/auth-context'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { formatDate, formatCurrency } from '@/lib/format'
import type { 
  ReportCard, 
  LabReport, 
  DrugUsageReport, 
  DebtorsReport, 
  OccupancyReport 
} from '@/types'

export function ReportsPage() {
  const { session } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  
  const [cards, setCards] = useState<ReportCard[]>([])
  const [loadingCards, setLoadingCards] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const defaultTo = new Date().toISOString().slice(0, 10)
  const defaultFrom = new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10)
  const from = searchParams.get('from') ?? defaultFrom
  const to = searchParams.get('to') ?? defaultTo

  const setDateRange = (newFrom: string, newTo: string) => {
    setSearchParams({ from: newFrom, to: newTo })
  }

  useEffect(() => {
    api.get<{ cards: ReportCard[] }>('/reports').then(
      (d) => { setCards(d.cards); setLoadingCards(false); },
      (e) => { setError(e.message); setLoadingCards(false); }
    )
  }, [])

  const visibleCards = cards.filter(c => c.permission === null || can(session, c.permission))

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Reports"
        description="Operational summaries derived at read time"
        actions={
          <DateRangePicker from={from} to={to} onChange={setDateRange} />
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loadingCards ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="h-24 animate-pulse bg-muted" /></Card>
          ))}
        </div>
      ) : visibleCards.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No reports available for your permissions.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleCards.map((card) => (
            <ReportCardComponent
              key={card.key}
              card={card}
              from={from}
              to={to}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DateRangePicker({ from, to, onChange }: { from: string; to: string; onChange: (f: string, t: string) => void }) {
  return (
    <div className="flex items-end gap-2">
      <div className="space-y-1.5">
        <Label htmlFor="reportFrom">From</Label>
        <Input id="reportFrom" type="date" value={from} onChange={(e) => onChange(e.target.value, to)} max={to} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reportTo">To</Label>
        <Input id="reportTo" type="date" value={to} onChange={(e) => onChange(from, e.target.value)} min={from} max={new Date().toISOString().slice(0, 10)} />
      </div>
    </div>
  )
}

function ReportCardComponent({ card, from, to }: { card: ReportCard; from: string; to: string }) {
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api.get<any>(`${card.path}?from=${from}&to=${to}`).then(
      (d) => { if (!cancelled) { setReport(d); setLoading(false); } },
      (e) => { if (!cancelled) { setError(e.message); setLoading(false); } }
    )
    return () => { cancelled = true }
  }, [card.path, from, to])

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-1">
        <CardTitle className="text-base">{card.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {loading && (
          <div className="space-y-3">
            <div className="h-4 animate-pulse bg-muted rounded" />
            <div className="h-4 animate-pulse bg-muted rounded w-3/4" />
            <div className="h-4 animate-pulse bg-muted rounded w-1/2" />
          </div>
        )}
        {error && (
          <div className="text-sm text-destructive text-center py-4">{error}</div>
        )}
        {!loading && !error && report && (
          <ReportContent card={card} data={report} />
        )}
      </CardContent>
    </Card>
  )
}

function ReportContent({ card, data }: { card: ReportCard; data: any }) {
  switch (card.key) {
    case 'lab':
      return <LabReportContent data={data} />
    case 'drug-usage':
      return <DrugUsageReportContent data={data} />
    case 'debtors':
      return <DebtorsReportContent data={data} />
    case 'occupancy':
      return <OccupancyReportContent data={data} />
    case 'accounting':
      return <AccountingReportCard data={data} />
    default:
      return <div className="text-sm text-muted-foreground">Unknown report type</div>
  }
}

function LabReportContent({ data }: { data: LabReport }) {
  if (!data.items.length) {
    return <div className="text-sm text-muted-foreground text-center py-4">No outstanding lab work</div>
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{data.items.length} pending tests</span>
        <span><Badge variant="destructive">{data.overdue} overdue (≥3 days)</Badge></span>
      </div>
      <div className="max-h-48 overflow-y-auto space-y-2">
        {data.items.slice(0, 10).map((item, i) => (
          <div key={i} className="flex items-center justify-between p-2 border border-border rounded text-sm">
            <div>
              <p className="font-medium truncate max-w-[200px]">{item.test}</p>
              <p className="text-xs text-muted-foreground">{item.patientName} ({item.patientCode})</p>
            </div>
            <Badge variant={item.days >= 3 ? 'destructive' : 'secondary'}>{item.days}d</Badge>
          </div>
        ))}
        {data.items.length > 10 && (
          <p className="text-xs text-muted-foreground text-center">+{data.items.length - 10} more...</p>
        )}
      </div>
      {data.byTest.length && (
        <details className="group">
          <summary className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
            By test ({data.byTest.length} types)
            <svg className="w-3 h-3 transition-transform group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
          </summary>
          <div className="mt-2 space-y-1 text-xs">
            {data.byTest.slice(0, 5).map((b, i) => (
              <div key={i} className="flex justify-between text-muted-foreground">
                <span className="truncate max-w-[150px]">{b.test}</span>
                <span>{b.count}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function DrugUsageReportContent({ data }: { data: DrugUsageReport }) {
  if (!data.items.length) {
    return <div className="text-sm text-muted-foreground text-center py-4">No drug usage in range</div>
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Range: {formatDate(data.from)} – {formatDate(data.to)}</span>
        <span>Total value: <strong>{formatCurrency(data.totalValue)}</strong></span>
      </div>
      <div className="max-h-48 overflow-y-auto space-y-1">
        {data.items.slice(0, 10).map((item, i) => (
          <div key={i} className="text-sm border-b border-border/60 pb-1 last:border-0">
            <p className="font-medium truncate">{item.name}</p>
            <p className="text-xs text-muted-foreground flex gap-4">
              <span>Rx: {item.prescribed}</span>
              <span>Disp: {item.dispensed}</span>
              <span className="font-medium">{formatCurrency(item.value)}</span>
            </p>
          </div>
        ))}
        {data.items.length > 10 && <p className="text-xs text-muted-foreground text-center">+{data.items.length - 10} more...</p>}
      </div>
    </div>
  )
}

function DebtorsReportContent({ data }: { data: DebtorsReport }) {
  if (!data.items.length) {
    return <div className="text-sm text-muted-foreground text-center py-4">Nothing outstanding</div>
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{data.items.length} patients</span>
        <span>Total owed: <strong>{formatCurrency(data.total)}</strong></span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="text-muted-foreground">0–30d</div>
        <div className="text-muted-foreground">31–60d</div>
        <div className="text-muted-foreground">61–90d</div>
        <div className="text-muted-foreground">90+d</div>
        <div className="font-medium">{formatCurrency(data.buckets['0 to 30 days'] || '0')}</div>
        <div className="font-medium">{formatCurrency(data.buckets['31 to 60 days'] || '0')}</div>
        <div className="font-medium">{formatCurrency(data.buckets['61 to 90 days'] || '0')}</div>
        <div className="font-medium">{formatCurrency(data.buckets['over 90 days'] || '0')}</div>
      </div>
      <div className="max-h-48 overflow-y-auto space-y-1 border-t border-border pt-2">
        {data.items.slice(0, 8).map((item, i) => (
          <div key={i} className="flex justify-between text-sm border-b border-border/60 pb-1 last:border-0">
            <span className="truncate max-w-[160px]">{item.patientName} ({item.patientCode})</span>
            <span className="font-medium text-red-600">{formatCurrency(item.owed)}</span>
          </div>
        ))}
        {data.items.length > 8 && <p className="text-xs text-muted-foreground text-center">+{data.items.length - 8} more...</p>}
      </div>
    </div>
  )
}

function OccupancyReportContent({ data }: { data: OccupancyReport }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="text-muted-foreground">Beds</div>
        <div className="text-muted-foreground">Occupied</div>
        <div className="text-muted-foreground">Peak</div>
        <div className="font-medium">{data.totalBeds}</div>
        <div className="font-medium">{data.currentlyOccupied}</div>
        <div className="font-medium">{data.peak}</div>
        <div className="text-muted-foreground">Discharges</div>
        <div className="text-muted-foreground">Avg Stay</div>
        <div className="text-muted-foreground">%</div>
        <div className="font-medium">{data.discharges}</div>
        <div className="font-medium">{data.averageStay}d</div>
        <div className="font-medium">{Math.round(data.currentlyOccupied / data.totalBeds * 100)}%</div>
      </div>
      <div className="h-32 relative">
        <svg viewBox={`0 0 ${data.series.length * 4} 100`} className="w-full h-full">
          {data.series.map((day, i) => {
            const h = Math.max(1, (day.percent / 100) * 90)
            const x = i * 4 + 2
            const y = 95 - h
            return (
              <rect key={i} x={x} y={y} width={3} height={h} fill={day.percent > 80 ? '#ef4444' : day.percent > 50 ? '#f59e0b' : '#22c55e'} rx={1} />
            )
          })}
        </svg>
      </div>
      <details className="group">
        <summary className="text-xs text-muted-foreground cursor-pointer">By ward ({data.byWard.length})</summary>
        <div className="mt-2 space-y-1 text-xs">
          {data.byWard.slice(0, 5).map((w, i) => (
            <div key={i} className="flex justify-between text-muted-foreground">
              <span className="truncate">{w.ward}</span>
              <span>{w.count}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}

function AccountingReportCard({ data }: { data: any }) {
  if (!data) return <div className="text-sm text-muted-foreground text-center py-4">No data</div>
  
  if (data.type) {
    // Type report
    return (
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total ({data.type})</span>
          <span className="font-medium">{formatCurrency(data.total)}</span>
        </div>
        {data.billing && (
          <div className="space-y-1 text-xs text-muted-foreground">
            <div>Regular: {formatCurrency(data.billing.charged)}</div>
            <div>Deposit: {formatCurrency(data.billing.depositCharged)}</div>
            <div>Collected: {formatCurrency(data.billing.paid)}</div>
            <div className="text-red-600">Due: {formatCurrency(data.billing.due)}</div>
          </div>
        )}
      </div>
    )
  } else if (data.balance !== undefined) {
    // Summary report
    return (
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="text-muted-foreground">Income</div>
        <div className="font-medium">{formatCurrency(data.income)}</div>
        <div className="text-muted-foreground">Expense</div>
        <div className="font-medium text-red-600">{formatCurrency(data.expense)}</div>
        <div className="text-muted-foreground">Billing Paid</div>
        <div className="font-medium">{formatCurrency(data.billing?.paid || '0')}</div>
        <div className="text-muted-foreground">Total Income</div>
        <div className="font-medium">{formatCurrency(data.totalIncome)}</div>
        <div className="text-muted-foreground">Balance</div>
        <div className="font-medium text-lg">{formatCurrency(data.balance)}</div>
      </div>
    )
  }
  return <div className="text-sm text-muted-foreground">No accounting data</div>
}

export default ReportsPage