import { useNavigate } from 'react-router-dom'
import { can, useAuth } from '@/auth/auth-context'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useList } from '@/hooks/use-list'
import { formatDate } from '@/lib/format'
import type { Patient } from '@/types'

export function PatientsPage() {
  const list = useList<Patient>('/patients')
  const { session } = useAuth()
  const navigate = useNavigate()

  const onRow = (id: string) => navigate(`/patients/${id}`)

  const { data, query } = list
  const total = data?.total ?? 0
  const from = data?.items.length === 0 ? 0 : list.offset + 1
  const to = data ? list.offset + data.items.length : 0

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Patients"
        description={`${total.toLocaleString()} registered`}
        actions={
          can(session, 'patient_add') ? (
            <Button onClick={() => navigate('/patients/create')}>Add patient</Button>
          ) : null
        }
      />

      <Input
        type="search"
        value={list.query}
        onChange={(e) => list.setQuery(e.target.value)}
        placeholder="Search by name, patient ID, phone, or email"
        aria-label="Search patients"
        className="max-w-md"
      />

      {list.error && (
        <ErrorCard error={list.error} onRetry={list.refresh} />
      )}

      {!list.error && data && data.items.length === 0 && (
        <EmptyState
          query={query}
          canAdd={can(session, 'patient_add')}
          onAdd={() => navigate('/patients/create')}
        />
      )}

      {data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">Patient ID</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Age</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">Sex</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Phone</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium lg:table-cell">Doctor</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Registered</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <PatientRow key={p._id} patient={p} onOpen={() => onRow(p._id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!list.error && list.loading && <LoadingRows />}

      {total > list.limit && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p aria-live="polite">
            {from}–{to} of {total.toLocaleString()}
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
              disabled={to >= total}
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

function PatientRow({ patient, onOpen }: { patient: Patient; onOpen: () => void }) {
  return (
    <tr
      className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-accent/60"
      onClick={onOpen}
    >
      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
        {patient.patientId}
      </td>
      <td className="px-4 py-3 font-medium">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpen()
          }}
          className="text-left underline-offset-2 hover:underline"
        >
          {patient.name}
        </button>
      </td>
      <td className="px-4 py-3 tabular-nums">{patient.age ?? '—'}</td>
      <td className="hidden px-4 py-3 capitalize sm:table-cell">{patient.sex || '—'}</td>
      <td className="hidden px-4 py-3 md:table-cell">{patient.phone || '—'}</td>
      <td className="hidden px-4 py-3 lg:table-cell">{patient.doctorName || '—'}</td>
      <td className="hidden px-4 py-3 md:table-cell">{formatDate(patient.addDate)}</td>
    </tr>
  )
}

function LoadingRows() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border/60 p-4 last:border-0">
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
          <div className="hidden h-4 w-24 animate-pulse rounded bg-muted sm:block" />
          <div className="hidden h-4 w-28 animate-pulse rounded bg-muted md:block" />
        </div>
      ))}
    </div>
  )
}

function ErrorCard({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
      <p>{error}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

function EmptyState({
  query,
  canAdd,
  onAdd,
}: {
  query: string
  canAdd: boolean
  onAdd: () => void
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center">
      <p className="text-sm font-medium">
        {query ? `No patients match “${query}”.` : 'No patients registered yet.'}
      </p>
      {canAdd ? (
        <Button size="sm" className="mt-3" onClick={onAdd}>
          Add patient
        </Button>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Search for a different name or ID.</p>
      )}
    </div>
  )
}

export default PatientsPage
