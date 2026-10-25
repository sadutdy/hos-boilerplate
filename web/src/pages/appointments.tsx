import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { can, useAuth } from '@/auth/auth-context'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { NativeSelect as Select } from '@/components/ui/select'
import { humanDate, shiftDateStr, statusChipClass, statusLabel, todayStr } from '@/appointments/constants'
import { APPOINTMENT_STATUSES } from '@/appointments/constants'
import type { Appointment, DoctorRef } from '@/types'

export function AppointmentsPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { session } = useAuth()

  const date = params.get('date') ?? todayStr()
  const doctorFilter = params.get('doctor') ?? ''
  const statusFilter = params.get('status') ?? ''

  const [items, setItems] = useState<Appointment[] | null>(null)
  const [doctors, setDoctors] = useState<DoctorRef[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [busyDeleteId, setBusyDeleteId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [nonce, setNonce] = useState(0)
  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  const query = `/appointment-calendar?date=${date}${doctorFilter ? `&doctor=${doctorFilter}` : ''}${statusFilter ? `&status=${statusFilter}` : ''}`

  useEffect(() => {
    let cancelled = false
    api
      .get<{ items: Appointment[]; count: number; empty: string | null }>(query)
      .then(
        (d) => {
          if (cancelled) return
          setItems(d.items)
          setError(null)
          setLoading(false)
        },
        (e) => {
          if (cancelled) return
          setError(e instanceof Error ? e.message : 'Failed to load')
          setLoading(false)
        },
      )
    return () => {
      cancelled = true
    }
  }, [query, nonce])

  useEffect(() => {
    let cancelled = false
    api.get<{ items: DoctorRef[] }>('/doctors?limit=100').then(
      (d) => !cancelled && setDoctors(d.items),
      () => !cancelled && setDoctors([]),
    )
    return () => {
      cancelled = true
    }
  }, [])

  function setFilter(key: 'doctor' | 'status', value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  function setDate(next: string) {
    const p = new URLSearchParams(params)
    p.set('date', next)
    setParams(p, { replace: true })
  }

  async function onStatusChange(appt: Appointment, status: string) {
    if (!status || status === appt.status) return
    try {
      await api.put<Appointment>(`/appointments/${appt._id}`, { status })
      setItems((its) =>
        (its ?? []).map((a) => (a._id === appt._id ? { ...a, status: status as Appointment['status'] } : a)),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update status.')
      refresh()
    }
  }

  const apptToDelete = items?.find((a) => a._id === deleteId)

  async function onDelete() {
    if (!deleteId) return
    setBusyDeleteId(deleteId)
    setDeleteError(null)
    try {
      await api.delete(`/appointments/${deleteId}`)
      setItems((its) => (its ?? []).filter((a) => a._id !== deleteId))
      setDeleteId(null)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Could not remove the appointment. Try again.')
    } finally {
      setBusyDeleteId(null)
    }
  }

  const canAdd = can(session, 'appointment_add')
  const canUpdate = can(session, 'appointment_update')
  const canCancel = can(session, 'appointment_cancel')

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Appointments"
        description={humanDate(date)}
        actions={
          canAdd ? (
            <Button onClick={() => navigate(`/appointments/create?date=${date}&doctor=${doctorFilter}`)}>
              Book appointment
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-md border border-input" role="group" aria-label="Change date">
          <Button variant="ghost" size="icon" aria-label="Previous day" onClick={() => setDate(shiftDateStr(date, -1))}>
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="m15 18-6-6 6-6" />
            </svg>
          </Button>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            aria-label="Date"
            className="border-none bg-transparent px-1 py-1.5 text-sm focus:outline-none"
          />
          <Button variant="ghost" size="icon" aria-label="Next day" onClick={() => setDate(shiftDateStr(date, 1))}>
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="m9 18 6-6-6-6" />
            </svg>
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => setDate(todayStr())}>
          Today
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Select
            aria-label="Filter by doctor"
            className="w-auto"
            value={doctorFilter}
            onChange={(e) => setFilter('doctor', e.target.value)}
          >
            <option value="">All doctors</option>
            {(doctors ?? []).map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter by status"
            className="w-auto"
            value={statusFilter}
            onChange={(e) => setFilter('status', e.target.value)}
          >
            <option value="">All statuses</option>
            {APPOINTMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          <p>{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={refresh}>
            Try again
          </Button>
        </div>
      )}

      {!error && loading && (
        <div aria-hidden className="rounded-lg border border-border bg-card">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-border/60 px-4 py-3.5 last:border-0">
              <div className="h-4 w-28 animate-pulse rounded bg-muted" />
              <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
              <div className="hidden h-4 w-32 animate-pulse rounded bg-muted sm:block" />
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {!error && !loading && items && items.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm font-medium">Nothing booked for {humanDate(date)}.</p>
          {canAdd && (
            <Button
              size="sm"
              className="mt-3"
              onClick={() => navigate(`/appointments/create?date=${date}&doctor=${doctorFilter}`)}
            >
              Book appointment
            </Button>
          )}
          {(doctorFilter || statusFilter) && (
            <p className="mt-2 text-sm text-muted-foreground">
              Filters are on —{' '}
              <button
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => {
                  const next = new URLSearchParams(params)
                  next.delete('doctor')
                  next.delete('status')
                  setParams(next, { replace: true })
                }}
              >
                clear them
              </button>.
            </p>
          )}
        </div>
      )}

      {!error && !loading && items && items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">Time</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Patient</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">Doctor</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Remarks</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium lg:table-cell">Vitals</th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <AppointmentRow
                  key={a._id}
                  appt={a}
                  canUpdate={canUpdate}
                  canCancel={canCancel}
                  onEdit={() => navigate(`/appointments/${a._id}/edit`)}
                  onDelete={() => {
                    setDeleteId(a._id)
                    setDeleteError(null)
                  }}
                  onStatus={(s) => onStatusChange(a, s)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteError && (
        <p role="alert" className="text-sm text-destructive">
          {deleteError}
        </p>
      )}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title={apptToDelete ? `Remove ${apptToDelete.timeSlot} with ${apptToDelete.patientName}?` : 'Remove appointment?'}
        message="This deletes the appointment and frees its slot. If you only want to stop seeing them, set the status to “Cancelled” or “No show” instead."
        confirmLabel="Remove"
        onConfirm={onDelete}
        onCancel={() => {
          setDeleteId(null)
          setDeleteError(null)
        }}
        busy={Boolean(busyDeleteId)}
      />
    </div>
  )
}

function AppointmentRow({
  appt,
  canUpdate,
  canCancel,
  onEdit,
  onDelete,
  onStatus,
}: {
  appt: Appointment
  canUpdate: boolean
  canCancel: boolean
  onEdit: () => void
  onDelete: () => void
  onStatus: (status: string) => void
}) {
  const vitals = appt.vitals
  const vitalItems = vitals
    ? [
        ['BP', vitals.bloodPressure],
        ['Pulse', vitals.pulse],
        ['Temp', vitals.temperature],
        ['Wt', vitals.weight],
      ].filter(([, v]) => Boolean(v))
    : []

  return (
    <tr className="border-b border-border/60 transition-colors last:border-0 hover:bg-accent/40">
      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-foreground/90">
        {appt.timeSlot}
      </td>
      <td className="px-4 py-3 font-medium">
        {appt.patientName === 'Unknown patient' ? (
          appt.patientName
        ) : (
          <Link
            to={`/patients/${appt.patientId}`}
            className="underline-offset-2 hover:underline"
          >
            {appt.patientName}
          </Link>
        )}
      </td>
      <td className="hidden px-4 py-3 sm:table-cell">{appt.doctorName || 'Removed doctor'}</td>
      <td className="px-4 py-3">
        {canUpdate ? (
          <Select
            aria-label={`Status for ${appt.timeSlot}`}
            className={`h-7 !bg-transparent w-auto rounded-full border !py-0 !pr-6 !pl-2.5 text-xs font-medium ${statusChipClass[appt.status]}`}
            value={appt.status}
            onChange={(e) => onStatus(e.target.value)}
          >
            {APPOINTMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </Select>
        ) : (
          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusChipClass[appt.status]}`}>
            {statusLabel(appt.status)}
          </span>
        )}
      </td>
      <td className="hidden max-w-40 truncate px-4 py-3 text-muted-foreground md:table-cell">
        {appt.remarks || '—'}
      </td>
      <td className="hidden px-4 py-3 lg:table-cell">
        {vitalItems.length > 0 ? (
          <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs tabular-nums">
            {vitalItems.map(([label, value]) => (
              <span key={label} className="text-muted-foreground">
                <span className="text-foreground/80">{value}</span> {label}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-1">
          {canUpdate && (
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
          )}
          {canCancel && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10"
              onClick={onDelete}
            >
              Remove
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}

export default AppointmentsPage
