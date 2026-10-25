import { useState } from 'react'
import { ApiRequestError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import type { Doctor, DoctorRef } from '@/types'

export interface DoctorFormValues {
  name: string
  email: string
  phone: string
  address: string
  department: string
  specialist: string
}

const initial: DoctorFormValues = {
  name: '',
  email: '',
  phone: '',
  address: '',
  department: '',
  specialist: '',
}

function fieldError(error: unknown, key: keyof DoctorFormValues): string | null {
  return error instanceof ApiRequestError ? (error.fields?.[key] ?? null) : null
}

function formMessage(error: unknown): string | null {
  if (error instanceof ApiRequestError) return error.fields ? null : error.message
  return error instanceof Error ? error.message : null
}

export function DoctorForm({
  initialDoctor,
  submitLabel,
  onSubmit,
  submitting,
  error,
  onCancel,
}: {
  initialDoctor?: Doctor | DoctorRef
  submitLabel: string
  onSubmit: (values: DoctorFormValues) => void
  submitting: boolean
  error: unknown
  onCancel: () => void
}) {
  const [values, setValues] = useState<DoctorFormValues>(
    initialDoctor
      ? {
          name: initialDoctor.name ?? '',
          email: (initialDoctor as Doctor).email ?? '',
          phone: (initialDoctor as Doctor).phone ?? '',
          address: (initialDoctor as Doctor).address ?? '',
          department: initialDoctor.department ?? '',
          specialist: initialDoctor.specialist ?? '',
        }
      : initial,
  )

  const set = (key: keyof DoctorFormValues) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setValues((v) => ({ ...v, [key]: e.target.value }))
  }

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(values)
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="df-name">Name</Label>
          <Input
            id="df-name"
            required
            maxLength={100}
            placeholder="Dr. Ayesha Khan"
            autoComplete="off"
            value={values.name}
            onChange={set('name')}
            aria-invalid={Boolean(fieldError(error, 'name'))}
            aria-describedby={fieldError(error, 'name') ? 'df-name-error' : undefined}
          />
          {fieldError(error, 'name') && (
            <p id="df-name-error" className="text-xs text-destructive">{fieldError(error, 'name')}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="df-department">Department</Label>
          <Input
            id="df-department"
            maxLength={100}
            placeholder="General Medicine"
            autoComplete="off"
            value={values.department}
            onChange={set('department')}
          />
          <p className="text-xs text-muted-foreground">Free text — stays as written; renaming the department later carries doctors along.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="df-email">Email</Label>
          <Input
            id="df-email"
            type="email"
            inputMode="email"
            maxLength={100}
            autoComplete="off"
            value={values.email}
            onChange={set('email')}
            aria-invalid={Boolean(fieldError(error, 'email'))}
            aria-describedby={fieldError(error, 'email') ? 'df-email-error' : undefined}
          />
          {fieldError(error, 'email') && (
            <p id="df-email-error" className="text-xs text-destructive">{fieldError(error, 'email')}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="df-specialist">Qualification / specialty</Label>
          <Input
            id="df-specialist"
            maxLength={100}
            placeholder="MBBS, FCPS — Cardiology"
            autoComplete="off"
            value={values.specialist}
            onChange={set('specialist')}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="df-phone">Phone</Label>
          <Input id="df-phone" type="tel" inputMode="tel" autoComplete="off" value={values.phone} onChange={set('phone')} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="df-address">Address</Label>
          <Input id="df-address" maxLength={100} autoComplete="off" value={values.address} onChange={set('address')} />
        </div>
      </div>

      {formMessage(error) && (
        <p role="alert" className="text-sm text-destructive">{formMessage(error)}</p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}

export function toDoctorRequest(values: DoctorFormValues): Record<string, unknown> {
  return {
    name: values.name.trim(),
    email: values.email,
    phone: values.phone,
    address: values.address,
    department: values.department,
    specialist: values.specialist,
  }
}
