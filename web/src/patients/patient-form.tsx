import { useState } from 'react'
import type { ApiRequestError } from '@/lib/api'
import { toDateInputValue } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { NativeSelect as Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { Patient } from '@/types'

const TODAY = new Date().toISOString()

const SEX_OPTIONS: { value: Patient['sex']; label: string }[] = [
  { value: '', label: 'Unspecified' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
]

const BLOOD_GROUPS = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

export function computeAge(dob: string): string {
  if (!dob) return ''
  const dobDate = new Date(dob)
  const now = new Date()
  if (Number.isNaN(dobDate.getTime()) || dobDate > now) return ''
  let age = now.getFullYear() - dobDate.getFullYear()
  const beforeBirthday =
    now.getMonth() < dobDate.getMonth() ||
    (now.getMonth() === dobDate.getMonth() && now.getDate() < dobDate.getDate())
  if (beforeBirthday) age -= 1
  return String(age)
}

export interface PatientFormValues {
  name: string
  fatherName: string
  phone: string
  email: string
  address: string
  sex: NonNullable<Patient['sex']>
  dateOfBirth: string
  bloodGroup: string
  doctorName: string
}

export function valuesFromPatient(p: Patient): PatientFormValues {
  return {
    name: p.name ?? '',
    fatherName: p.fatherName ?? '',
    phone: p.phone ?? '',
    email: p.email ?? '',
    address: p.address ?? '',
    sex: (p.sex ?? '') as NonNullable<Patient['sex']>,
    dateOfBirth: toDateInputValue(p.dateOfBirth),
    bloodGroup: p.bloodGroup ?? '',
    doctorName: p.doctorName ?? '',
  }
}

const initial: PatientFormValues = {
  name: '',
  fatherName: '',
  phone: '',
  email: '',
  address: '',
  sex: '',
  dateOfBirth: '',
  bloodGroup: '',
  doctorName: '',
}

function fieldError(
  err: unknown,
  key: keyof PatientFormValues | 'form',
): string | null {
  if (err instanceof Error && 'fields' in err) {
    const fields = (err as ApiRequestError).fields
    return fields?.[key] ?? null
  }
  return null
}

function formMessage(err: unknown): string | null {
  if (err instanceof Error) {
    return (err as ApiRequestError).fields ? null : err.message
  }
  return null
}

export function PatientForm({
  initialPatient,
  submitLabel,
  onSubmit,
  submitting,
  error,
  onCancel,
}: {
  initialPatient?: Patient
  submitLabel: string
  onSubmit: (values: PatientFormValues) => void
  submitting: boolean
  error: unknown
  onCancel?: () => void
}) {
  const [values, setValues] = useState<PatientFormValues>(
    initialPatient ? valuesFromPatient(initialPatient) : initial,
  )

  const set = (key: keyof PatientFormValues) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    setValues((v) => ({ ...v, [key]: e.target.value }))
  }

  const age = computeAge(values.dateOfBirth)

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
          <Label htmlFor="pf-name">Name</Label>
          <Input
            id="pf-name"
            name="name"
            autoComplete="off"
            required
            maxLength={100}
            value={values.name}
            onChange={set('name')}
            aria-label="Patient name"
            aria-invalid={Boolean(fieldError(error, 'name'))}
            aria-describedby={fieldError(error, 'name') ? 'pf-name-error' : undefined}
          />
          {fieldError(error, 'name') && (
            <p id="pf-name-error" className="text-xs text-destructive">
              {fieldError(error, 'name')}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-fatherName">Father / guardian name</Label>
          <Input
            id="pf-fatherName"
            name="fatherName"
            autoComplete="off"
            maxLength={100}
            value={values.fatherName}
            onChange={set('fatherName')}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-phone">Phone</Label>
          <Input
            id="pf-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={values.phone}
            onChange={set('phone')}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-email">Email</Label>
          <Input
            id="pf-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            maxLength={190}
            value={values.email}
            onChange={set('email')}
            aria-invalid={Boolean(fieldError(error, 'email'))}
            aria-describedby={fieldError(error, 'email') ? 'pf-email-error' : undefined}
          />
          {fieldError(error, 'email') && (
            <p id="pf-email-error" className="text-xs text-destructive">
              {fieldError(error, 'email')}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-sex">Sex</Label>
          <Select id="pf-sex" value={values.sex} onChange={set('sex')}>
            {SEX_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-dob">Date of birth</Label>
          <Input
            id="pf-dob"
            name="dateOfBirth"
            type="date"
            max={toDateInputValue(TODAY)}
            value={values.dateOfBirth}
            onChange={set('dateOfBirth')}
            aria-describedby="pf-dob-hint"
          />
          <p id="pf-dob-hint" className="text-xs text-muted-foreground">
            Age is derived automatically{age ? `: ${age}` : ''}.
          </p>
          {fieldError(error, 'dateOfBirth') && (
            <p className="text-xs text-destructive">{fieldError(error, 'dateOfBirth')}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-bloodGroup">Blood group</Label>
          <Select id="pf-bloodGroup" value={values.bloodGroup} onChange={set('bloodGroup')}>
            {BLOOD_GROUPS.map((g) => (
              <option key={g || 'unspecified'} value={g}>
                {g || 'Unspecified'}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-doctorName">Assigned doctor</Label>
          <Input
            id="pf-doctorName"
            name="doctorName"
            autoComplete="off"
            maxLength={100}
            placeholder="Optional — recorded as entered"
            value={values.doctorName}
            onChange={set('doctorName')}
          />
        </div>
        <div className="sm:col-span-2 space-y-1.5">
          <Label htmlFor="pf-address">Address</Label>
          <Textarea id="pf-address" name="address" rows={2} value={values.address} onChange={set('address')} />
        </div>
      </div>

      {formMessage(error) && (
        <p role="alert" className="text-sm text-destructive">
          {formMessage(error)}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}

/** Exactly what the API accepts back; `age` is never sent. */
export function toRequest(values: PatientFormValues): Record<string, unknown> {
  return {
    name: values.name.trim(),
    fatherName: values.fatherName,
    phone: values.phone,
    email: values.email,
    address: values.address,
    sex: values.sex,
    dateOfBirth: values.dateOfBirth || null,
    bloodGroup: values.bloodGroup,
    doctorName: values.doctorName,
  }
}
