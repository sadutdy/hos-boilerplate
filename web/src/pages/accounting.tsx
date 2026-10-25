import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { can, useAuth } from '@/auth/auth-context'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect as Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useList } from '@/hooks/use-list'
import { formatDate, formatCurrency } from '@/lib/format'
import type { AccountSector, LedgerEntry, LedgerEntriesResponse, AccountingSettings, ReportSummary, TypeReport, BatchEntryInput } from '@/types'

function buildEntriesQuery(q: string, offset: number, type: string, from: string, to: string) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  params.set('limit', '25')
  params.set('offset', String(offset))
  if (type) params.set('type', type)
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  return `?${params.toString()}`
}

export function AccountingPage() {
  const { session } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  
  const activeTab = searchParams.get('tab') ?? 'sectors'
  const filterType = searchParams.get('type') ?? ''
  const filterFrom = searchParams.get('from') ?? ''
  const filterTo = searchParams.get('to') ?? ''

  const setActiveTab = (tab: string) => {
    setSearchParams({ ...Object.fromEntries(searchParams), tab })
  }

  const sectorsQuery = useCallback(() => '?limit=200', [])
  const sectorsList = useList<AccountSector>('/accounting/sectors', sectorsQuery)

  const buildQuery = useCallback((q: string, offset: number) => 
    buildEntriesQuery(q, offset, filterType, filterFrom, filterTo), 
    [filterType, filterFrom, filterTo]
  )
  const entriesList = useList<LedgerEntry, LedgerEntriesResponse>('/accounting/entries', buildQuery)

  const [settings, setSettings] = useState<AccountingSettings | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [summary, setSummary] = useState<ReportSummary | null>(null)
  const [typeReport, setTypeReport] = useState<TypeReport | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get<AccountingSettings>('/accounting/settings').then(
      (d) => { setSettings(d); setSettingsLoading(false); },
      () => { setSettingsLoading(false); }
    )
  }, [])

  const handleSaveSettings = async (data: Omit<AccountingSettings, '_id'>) => {
    try {
      setError(null)
      const saved = await api.put<AccountingSettings>('/accounting/settings', data)
      setSettings(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings')
    }
  }

  const handleRunReport = async (type: 'income' | 'expense' | 'summary') => {
    if (!filterFrom || !filterTo) {
      setError('Please select a date range')
      return
    }
    setReportLoading(true)
    setError(null)
    try {
      if (type === 'summary') {
        const data = await api.get<ReportSummary>(`/accounting/reports/summary?from=${filterFrom}&to=${filterTo}`)
        setSummary(data)
        setTypeReport(null)
      } else {
        const data = await api.get<TypeReport>(`/accounting/reports/${type}?from=${filterFrom}&to=${filterTo}`)
        setTypeReport(data)
        setSummary(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate report')
    } finally {
      setReportLoading(false)
    }
  }

  const canManage = can(session, 'accounting')

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Accounting"
        description="Manual cashbook, sectors, and reports"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="sectors">Sectors</TabsTrigger>
          <TabsTrigger value="entries">Entries</TabsTrigger>
          <TabsTrigger value="batch">Batch Entry</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="sectors" className="mt-5">
          <SectorsTab sectors={sectorsList} canManage={canManage} />
        </TabsContent>

        <TabsContent value="entries" className="mt-5">
          <EntriesTab 
            entries={entriesList} 
            filterType={filterType} 
            filterFrom={filterFrom} 
            filterTo={filterTo}
            onFilterChange={(type, from, to) => setSearchParams({ ...Object.fromEntries(searchParams), type, from, to })}
            canManage={canManage}
          />
        </TabsContent>

        <TabsContent value="batch" className="mt-5">
          <BatchEntryTab sectors={sectorsList.data?.items ?? []} canManage={canManage} />
        </TabsContent>

        <TabsContent value="reports" className="mt-5">
          <ReportsTab 
            filterType={filterType}
            filterFrom={filterFrom}
            filterTo={filterTo}
            onFilterChange={(type, from, to) => setSearchParams({ ...Object.fromEntries(searchParams), type, from, to })}
            summary={summary}
            typeReport={typeReport}
            reportLoading={reportLoading}
            error={error}
            onRunReport={handleRunReport}
          />
        </TabsContent>

        <TabsContent value="settings" className="mt-5">
          <SettingsTab settings={settings} settingsLoading={settingsLoading} onSave={handleSaveSettings} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SectorsTab({ sectors, canManage }: { sectors: ReturnType<typeof useList<AccountSector>>; canManage: boolean }) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<AccountSector | null>(null)
  const [form, setForm] = useState({ name: '', type: 'income' as 'income' | 'expense' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetForm = () => {
    setForm({ name: '', type: 'income' })
    setEditing(null)
    setShowForm(false)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      if (editing) {
        await api.put(`/accounting/sectors/${editing._id}`, form)
      } else {
        await api.post('/accounting/sectors', form)
      }
      sectors.refresh()
      resetForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save sector')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this sector? This cannot be undone.')) return
    try {
      await api.delete(`/accounting/sectors/${id}`)
      sectors.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  if (sectors.loading && !sectors.data) {
    return <div className="h-32 animate-pulse rounded-lg bg-muted" />
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Account Sectors</h3>
        {canManage && (
          <Button onClick={() => { setEditing(null); setShowForm(true); }}>Add Sector</Button>
        )}
      </div>

      {showForm && (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{editing ? 'Edit Sector' : 'New Sector'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="text-sm text-destructive">{error}</div>}
              <div className="space-y-1.5">
                <Label htmlFor="sectorName">Name *</Label>
                <Input
                  id="sectorName"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Consultation Fees"
                  maxLength={500}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sectorType">Type *</Label>
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'income' | 'expense' })}>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
                <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {sectors.data?.items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No sectors defined yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Type</th>
                <th scope="col" className="px-4 py-2.5 font-medium w-[120px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sectors.data?.items.map((sector) => (
                <tr key={sector._id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-medium">{sector.name}</td>
                  <td className="px-4 py-3">
                    <Badge variant={sector.type === 'income' ? 'default' : 'destructive'}>
                      {sector.type}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {canManage && (
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => { setForm({ name: sector.name, type: sector.type }); setEditing(sector); setShowForm(true); }}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(sector._id)}>
                          Delete
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function EntriesTab({ 
  entries, 
  filterType, 
  filterFrom, 
  filterTo, 
  onFilterChange,
  canManage
}: { 
  entries: ReturnType<typeof useList<LedgerEntry, LedgerEntriesResponse>>;
  filterType: string;
  filterFrom: string;
  filterTo: string;
  onFilterChange: (type: string, from: string, to: string) => void;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<LedgerEntry | null>(null)
  const [form, setForm] = useState({ amount: '', date: '', description: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleEdit = (entry: LedgerEntry) => {
    setForm({ amount: entry.amount, date: entry.date?.slice(0, 10) ?? '', description: entry.description ?? '' })
    setEditing(entry)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setSubmitting(true)
    setError(null)
    try {
      await api.put(`/accounting/entries/${editing._id}`, form)
      entries.refresh()
      setEditing(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update entry')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this entry? This cannot be undone.')) return
    try {
      await api.delete(`/accounting/entries/${id}`)
      entries.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const total = entries.data?.total_amount ?? '0.00'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1.5">
          <Label htmlFor="entriesType">Type</Label>
          <Select value={filterType} onChange={(e) => onFilterChange(e.target.value, filterFrom, filterTo)} className="w-[160px]">
            <option value="">All</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="entriesFrom">From</Label>
          <Input id="entriesFrom" type="date" value={filterFrom} onChange={(e) => onFilterChange(filterType, e.target.value, filterTo)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="entriesTo">To</Label>
          <Input id="entriesTo" type="date" value={filterTo} onChange={(e) => onFilterChange(filterType, filterFrom, e.target.value)} />
        </div>
      </div>

      <div className="flex justify-between text-sm text-muted-foreground">
        <span>Total: <strong>{formatCurrency(total)}</strong></span>
        <span>{entries.data?.total ?? 0} entries</span>
      </div>

      {editing && (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Edit Entry</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="text-sm text-destructive">{error}</div>}
              <div className="space-y-1.5">
                <Label htmlFor="editAmount">Amount *</Label>
                <Input id="editAmount" type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="editDate">Date *</Label>
                <Input id="editDate" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="editDesc">Description</Label>
                <Input id="editDesc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {entries.data?.items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No entries found. Use the Batch Entry tab to add entries.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Sector</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Type</th>
                <th scope="col" className="px-4 py-2.5 font-medium tabular-nums text-right">Amount</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Description</th>
                <th scope="col" className="px-4 py-2.5 font-medium w-[100px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.data?.items.map((entry) => (
                <tr key={entry._id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{formatDate(entry.date)}</td>
                  <td className="px-4 py-3">{entry.sectorName}</td>
                  <td className="px-4 py-3">
                    <Badge variant={entry.type === 'income' ? 'default' : 'destructive'}>{entry.type}</Badge>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-right font-medium">
                    {formatCurrency(entry.amount)}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{entry.description || '—'}</td>
                  <td className="px-4 py-3">
                    {canManage && (
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(entry)}>Edit</Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(entry._id)}>Delete</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {entries.data && entries.data.total > entries.limit && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <Button variant="outline" size="sm" disabled={entries.offset === 0} onClick={() => entries.setOffset(entries.offset - entries.limit)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={(entries.offset + entries.limit) >= entries.data.total} onClick={() => entries.setOffset(entries.offset + entries.limit)}>Next</Button>
        </div>
      )}
    </div>
  )
}

function BatchEntryTab({ sectors, canManage }: { sectors: AccountSector[]; canManage: boolean }) {
  const [type, setType] = useState<'income' | 'expense'>('income')
  const [entries, setEntries] = useState<BatchEntryInput[]>([{ sectorId: '', amount: '', date: '', description: '' }])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ saved: number; skipped: number } | null>(null)

  const handleEntryChange = (index: number, field: keyof BatchEntryInput, value: string) => {
    setEntries((prev) => prev.map((e, i) => i === index ? { ...e, [field]: value } : e))
  }

  const addRow = () => setEntries((prev) => [...prev, { sectorId: '', amount: '', date: '', description: '' }])
  const removeRow = (index: number) => setEntries((prev) => prev.filter((_, i) => i !== index))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validEntries = entries.filter(e => e.sectorId && e.amount !== '' && e.date)
    if (!validEntries.length) {
      setError('At least one complete entry is required')
      return
    }
    setSubmitting(true)
    setError(null)
    setResult(null)
    try {
      const res = await api.post<{ saved: number; skipped: number }>('/accounting/batch', { type, entries: validEntries })
      setResult(res)
      if (res.saved > 0) {
        setEntries([{ sectorId: '', amount: '', date: '', description: '' }])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save batch')
    } finally {
      setSubmitting(false)
    }
  }

  if (!canManage) {
    return <div className="text-sm text-muted-foreground">You don't have permission to create batch entries.</div>
  }

  const filteredSectors = sectors.filter(s => s.type === type)

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <div className="space-y-1.5">
        <Label>Entry Type</Label>
        <Select value={type} onChange={(e) => { setType(e.target.value as 'income' | 'expense'); setEntries([{ sectorId: '', amount: '', date: '', description: '' }]); setResult(null); }}>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Batch Entries</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground">
              <div className="col-span-4 font-medium">Sector *</div>
              <div className="col-span-2 font-medium text-right">Amount *</div>
              <div className="col-span-3 font-medium">Date *</div>
              <div className="col-span-3 font-medium">Description</div>
            </div>
            {entries.map((entry, index) => (
              <div key={index} className="flex flex-wrap gap-2 items-end">
                <div className="w-full sm:w-[33%] min-w-[200px] space-y-1.5">
                  <Select value={entry.sectorId} onChange={(e) => handleEntryChange(index, 'sectorId', e.target.value)}>
                    <option value="">Select sector</option>
                    {filteredSectors.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                  </Select>
                </div>
                <div className="w-full sm:w-[17%] min-w-[100px] space-y-1.5">
                  <Input type="number" step="0.01" min="0" value={entry.amount} onChange={(e) => handleEntryChange(index, 'amount', e.target.value)} placeholder="0.00" />
                </div>
                <div className="w-full sm:w-[25%] min-w-[140px] space-y-1.5">
                  <Input type="date" value={entry.date} onChange={(e) => handleEntryChange(index, 'date', e.target.value)} />
                </div>
                <div className="w-full sm:w-[25%] min-w-[140px] space-y-1.5">
                  <Input value={entry.description} onChange={(e) => handleEntryChange(index, 'description', e.target.value)} placeholder="Optional" />
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(index)} disabled={entries.length === 1} aria-label="Remove row">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addRow} className="w-fit">Add Row</Button>

            {error && <div className="text-sm text-destructive">{error}</div>}
            {result && <div className="text-sm text-green-600">Saved {result.saved} entries, skipped {result.skipped}</div>}

            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save Batch'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function ReportsTab({ 
  filterType, 
  filterFrom, 
  filterTo, 
  onFilterChange,
  summary,
  typeReport,
  reportLoading,
  error,
  onRunReport,
}: { 
  filterType: string;
  filterFrom: string;
  filterTo: string;
  onFilterChange: (type: string, from: string, to: string) => void;
  summary: ReportSummary | null;
  typeReport: TypeReport | null;
  reportLoading: boolean;
  error: string | null;
  onRunReport: (type: 'income' | 'expense' | 'summary') => void;

}) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Date Range</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1.5">
            <Label htmlFor="reportType">Type</Label>
            <Select value={filterType} onChange={(e) => onFilterChange(e.target.value, filterFrom, filterTo)} className="w-[160px]">
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reportFrom">From</Label>
            <Input id="reportFrom" type="date" value={filterFrom} onChange={(e) => onFilterChange(filterType, e.target.value, filterTo)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reportTo">To</Label>
            <Input id="reportTo" type="date" value={filterTo} onChange={(e) => onFilterChange(filterType, filterFrom, e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => onRunReport('summary')} disabled={reportLoading || !filterFrom || !filterTo}>
              {reportLoading ? 'Generating…' : 'Run Summary'}
            </Button>
            <Button onClick={() => onRunReport(filterType as 'income' | 'expense')} disabled={reportLoading || !filterFrom || !filterTo}>
              {reportLoading ? 'Generating…' : `Run ${filterType.charAt(0).toUpperCase() + filterType.slice(1)} Report`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}

      {summary && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Summary Report</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card><CardContent className="space-y-1">
              <p className="text-xs text-muted-foreground">Manual Income</p>
              <p className="text-2xl font-bold">{formatCurrency(summary.income)}</p>
            </CardContent></Card>
            <Card><CardContent className="space-y-1">
              <p className="text-xs text-muted-foreground">Manual Expense</p>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(summary.expense)}</p>
            </CardContent></Card>
            <Card><CardContent className="space-y-1">
              <p className="text-xs text-muted-foreground">Invoice Collections</p>
              <p className="text-2xl font-bold">{formatCurrency(summary.billing.paid)}</p>
            </CardContent></Card>
            <Card><CardContent className="space-y-1">
              <p className="text-xs text-muted-foreground">Total Income</p>
              <p className="text-2xl font-bold">{formatCurrency(summary.totalIncome)}</p>
            </CardContent></Card>
            <Card><CardContent className="space-y-1">
              <p className="text-xs text-muted-foreground">Balance</p>
              <p className="text-2xl font-bold">{formatCurrency(summary.balance)}</p>
            </CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Billing Breakdown</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-4">
              <div><p className="text-xs text-muted-foreground">Regular Charged</p><p className="font-medium">{formatCurrency(summary.billing.charged)}</p></div>
              <div><p className="text-xs text-muted-foreground">Deposit Charged</p><p className="font-medium">{formatCurrency(summary.billing.depositCharged)}</p></div>
              <div><p className="text-xs text-muted-foreground">Collected</p><p className="font-medium">{formatCurrency(summary.billing.paid)}</p></div>
              <div><p className="text-xs text-muted-foreground">Due</p><p className="font-medium text-red-600">{formatCurrency(summary.billing.due)}</p></div>
            </CardContent>
          </Card>
        </div>
      )}

      {typeReport && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium capitalize">{typeReport.type} Report</h3>
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span>Total: <strong>{formatCurrency(typeReport.total)}</strong></span>
            <span>{typeReport.entries.length} entries</span>
          </div>

          {typeReport.billing && (
            <Card className="mb-4">
              <CardHeader><CardTitle>Invoice Billing (from invoices)</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-4">
                <div><p className="text-xs text-muted-foreground">Regular Charged</p><p className="font-medium">{formatCurrency(typeReport.billing.charged)}</p></div>
                <div><p className="text-xs text-muted-foreground">Deposit Charged</p><p className="font-medium">{formatCurrency(typeReport.billing.depositCharged)}</p></div>
                <div><p className="text-xs text-muted-foreground">Collected</p><p className="font-medium">{formatCurrency(typeReport.billing.paid)}</p></div>
                <div><p className="text-xs text-muted-foreground">Due</p><p className="font-medium text-red-600">{formatCurrency(typeReport.billing.due)}</p></div>
              </CardContent>
            </Card>
          )}

          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Sector</th>
                  <th scope="col" className="px-4 py-2.5 font-medium tabular-nums text-right">Amount</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {typeReport.entries.map((entry, i) => (
                  <tr key={i} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-mono text-xs">{formatDate(entry.date)}</td>
                    <td className="px-4 py-3">{entry.sectorName}</td>
                    <td className="px-4 py-3 tabular-nums text-right font-medium">{formatCurrency(entry.amount)}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{entry.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {typeReport.entries.length === 0 && (
            <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No data in range
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SettingsTab({ settings, settingsLoading, onSave }: { settings: AccountingSettings | null; settingsLoading: boolean; onSave: (data: Omit<AccountingSettings, '_id'>) => void }) {
  const [form, setForm] = useState({ companyId: '', apiLink: '', username: '', password: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (settings) {
      setForm({ companyId: settings.companyId ?? '', apiLink: settings.apiLink ?? '', username: settings.username ?? '', password: '' })
    }
  }, [settings])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.companyId || !form.apiLink || !form.username || !form.password) {
      setError('All fields are required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(form)
      setForm((f) => ({ ...f, password: '' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (settingsLoading) {
    return <div className="h-32 animate-pulse rounded-lg bg-muted" />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>External Accounting Integration</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="space-y-1.5">
            <Label htmlFor="companyId">Company ID *</Label>
            <Input id="companyId" value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="apiLink">API Link *</Label>
            <Input id="apiLink" value={form.apiLink} onChange={(e) => setForm({ ...form, apiLink: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="username">Username *</Label>
            <Input id="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password *</Label>
            <Input id="password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required autoComplete="new-password" />
            {settings?.passwordConfigured && <p className="text-xs text-muted-foreground">Leave blank to keep current password</p>}
          </div>
          <div className="flex justify-end pt-4 border-t border-border">
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export default AccountingPage