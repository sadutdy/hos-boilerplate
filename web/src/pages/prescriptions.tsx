import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { can, useAuth } from '@/auth/auth-context'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useList } from '@/hooks/use-list'
import { formatDate, truncate } from '@/lib/format'
import type { OnDrugResponse, Prescription, PrescriptionsResponse } from '@/types'

export function PrescriptionsPage() {
  const [params, setParams] = useSearchParams()
  const { session } = useAuth()
  const navigate = useNavigate()

  const patientFilter = params.get('patient') ?? ''
  const doctorFilter = params.get('doctor') ?? ''
  const urlDrug = params.get('drug') ?? ''
  const [drugFilter, setDrugFilter] = useState(urlDrug)

  // Must be stable — an inline callback re-runs the fetch on every render.
  const listQuery = useCallback(
    (_q: string, offset: number) => {
      const p = new URLSearchParams()
      if (patientFilter) p.set('patient', patientFilter)
      if (doctorFilter) p.set('doctor', doctorFilter)
      if (drugFilter) p.set('drug', drugFilter)
      p.set('limit', '25')
      p.set('offset', String(offset))
      return `?${p.toString()}`
    },
    [patientFilter, doctorFilter, drugFilter],
  )

  const list = useList<Prescription, PrescriptionsResponse>('/prescriptions', listQuery)

  // Patient/doctor filters come from the URL; the search box drives the drug filter only.
  const data = list.data
  const total = data?.total ?? 0

  const [onDrugOpen, setOnDrugOpen] = useState(false)
  const [onDrugTerm, setOnDrugTerm] = useState('')
  const [onDrugData, setOnDrugData] = useState<OnDrugResponse | null>(null)
  const [onDrugBusy, setOnDrugBusy] = useState(false)
  const [onDrugError, setOnDrugError] = useState<string | null>(null)

  async function findPatientsOnDrug() {
    const t = onDrugTerm.trim()
    if (!t) return
    setOnDrugBusy(true)
    setOnDrugError(null)
    try {
      const d = await api.get<OnDrugResponse>(`/prescriptions/on-drug?drug=${encodeURIComponent(t)}`)
      setOnDrugData(d)
    } catch (e) {
      setOnDrugError(e instanceof Error ? e.message : 'Search failed.')
    } finally {
      setOnDrugBusy(false)
    }
  }

  useEffect(() => {
    // live-sync the search box when the URL drives it (deep links, clear-filters)
    setDrugFilter((cur) => (cur === urlDrug ? cur : urlDrug))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlDrug])

  function setFilter(key: 'patient' | 'doctor' | 'drug', value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const canAdd = can(session, 'prescription_add')

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Prescriptions"
        description={`${total.toLocaleString()} written — drugs are rows, never packed strings.`}
        actions={
          canAdd ? (
            <Button
              onClick={() =>
                navigate(
                  `/prescriptions/create${patientFilter ? `?patient=${patientFilter}` : ''}${doctorFilter ? `${patientFilter ? '&' : '?'}doctor=${doctorFilter}` : ''}`,
                )
              }
            >
              Write prescription
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={drugFilter}
          onChange={(e) => setDrugFilter(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setFilter('drug', drugFilter)}
          onBlur={() => setFilter('drug', drugFilter)}
          placeholder="Filter by drug name…"
          aria-label="Filter by drug name"
          className="w-56"
        />
        {(patientFilter || doctorFilter) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const next = new URLSearchParams(params)
              next.delete('patient')
              next.delete('doctor')
              next.delete('drug')
              setParams(next, { replace: true })
              setDrugFilter('')
            }}
          >
            Clear filters
          </Button>
        )}
        <Button
          variant="outline"
          className="ml-auto"
          onClick={() => {
            setOnDrugOpen((v) => !v)
            setOnDrugData(null)
            setOnDrugError(null)
          }}
          aria-expanded={onDrugOpen}
        >
          Who is on this drug?
        </Button>
      </div>

      {onDrugOpen && (
        <div className="rounded-lg border border-border bg-card p-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              findPatientsOnDrug()
            }}
          >
            <Input
              value={onDrugTerm}
              onChange={(e) => setOnDrugTerm(e.target.value)}
              placeholder="Drug name — also matches free-typed prescriptions"
              aria-label="Drug name to search"
              className="max-w-sm"
            />
            <Button type="submit" disabled={onDrugBusy || !onDrugTerm.trim()}>
              {onDrugBusy ? 'Searching…' : 'Search'}
            </Button>
          </form>
          {onDrugError && (
            <p role="alert" className="mt-3 text-sm text-destructive">{onDrugError}</p>
          )}
          {onDrugData && (
            <div className="mt-3">
              {onDrugData.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No prescriptions found matching “{onDrugTerm}”.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-border/60">
                  {onDrugData.items.map((row) => (
                    <li key={row.prescriptionId} className="flex flex-wrap items-baseline gap-x-3 py-2">
                      <Link
                        to={`/patients/${row.patientId}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {row.patientName}
                      </Link>
                      <span className="font-mono text-xs text-muted-foreground">{row.patientCode}</span>
                      <span className="text-sm text-muted-foreground">
                        {row.onThisDrug.map((i) => i.name).join(', ')}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">{formatDate(row.date)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {list.error ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          <p>{list.error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={list.refresh}>
            Try again
          </Button>
        </div>
      ) : data && data.items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm font-medium">
            {drugFilter
              ? `No prescriptions contain “${drugFilter}”.`
              : 'No prescriptions written yet.'}
          </p>
        </div>
      ) : data && data.items.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Patient</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Doctor</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Drugs</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p._id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                  <td className="whitespace-nowrap px-4 py-3">{formatDate(p.date)}</td>
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/prescriptions/${p._id}`} className="underline-offset-2 hover:underline">
                      {data.patientNames[p.patientId] ?? 'Unknown patient'}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">{data.doctorNames[p.doctorId] ?? 'Removed doctor'}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {truncate(p.summary ?? p.items.map((i) => i.name).join(', '), 80)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!list.error && list.loading && (
        <div aria-hidden className="rounded-lg border border-border bg-card">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-border/60 px-4 py-3.5 last:border-0">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
              <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {total > list.limit && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p aria-live="polite">
            {list.offset + 1}–{list.offset + (data?.items.length ?? 0)} of {total.toLocaleString()}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={list.offset === 0}
              onClick={() => list.setOffset(list.offset - list.limit)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={list.offset + list.limit >= total}
              onClick={() => list.setOffset(list.offset + list.limit)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default PrescriptionsPage
