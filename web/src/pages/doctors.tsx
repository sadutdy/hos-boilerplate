import { useNavigate } from 'react-router-dom'
import { can, useAuth } from '@/auth/auth-context'
import { PageHeader } from '@/components/page-header'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useList } from '@/hooks/use-list'
import type { Doctor } from '@/types'
import { Link } from 'react-router-dom'
import { Stethoscope } from 'lucide-react'

export function DoctorsPage() {
  const list = useList<Doctor>('/doctors')
  const { session } = useAuth()
  const navigate = useNavigate()
  const canAdd = can(session, 'doctor_add')

  const total = list.data?.total ?? 0

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Doctors"
        description={`${total.toLocaleString()} on file — feeds appointment, prescription, lab, and invoice selects.`}
        actions={
          canAdd ? (
            <Button onClick={() => navigate('/doctors/create')}>Add doctor</Button>
          ) : null
        }
      />

      <Input
        type="search"
        value={list.query}
        onChange={(e) => list.setQuery(e.target.value)}
        placeholder="Search by name, department, phone, or email"
        aria-label="Search doctors"
        className="max-w-md"
      />

      {list.error ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          <p>{list.error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={list.refresh}>
            Try again
          </Button>
        </div>
      ) : list.data && list.data.items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          {list.query ? (
            <p className="text-sm font-medium">No doctors match “{list.query}”.</p>
          ) : (
            <>
              <Stethoscope aria-hidden className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">No doctors on file yet.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Clinical modules stay closed until at least one doctor exists.
              </p>
              {canAdd && (
                <Link to="/doctors/create" className={`${buttonVariants({ size: 'sm' })} mt-4`}>
                  Add the first doctor
                </Link>
              )}
            </>
          )}
        </div>
      ) : list.data && list.data.items.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Department</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium lg:table-cell">Qualification</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">Phone</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Upcoming</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((d) => (
                <tr key={d._id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-accent/40">
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/doctors/${d._id}`} className="underline-offset-2 hover:underline">
                      {d.name}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">{d.department || <span className="text-muted-foreground/60">—</span>}</td>
                  <td className="hidden px-4 py-3 lg:table-cell">{d.specialist || <span className="text-muted-foreground/60">—</span>}</td>
                  <td className="hidden px-4 py-3 sm:table-cell">{d.phone || <span className="text-muted-foreground/60">—</span>}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex min-w-7 justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
                      {d.upcomingAppointments ?? 0}
                    </span>
                    <span className="sr-only"> upcoming appointments</span>
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
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
              <div className="hidden h-4 w-32 animate-pulse rounded bg-muted sm:block" />
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {total > list.limit && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p aria-live="polite">
            {list.offset + 1}–{list.offset + (list.data?.items.length ?? 0)} of {total.toLocaleString()}
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

export default DoctorsPage
