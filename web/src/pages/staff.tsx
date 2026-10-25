import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { can, useAuth } from '@/auth/auth-context'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useList } from '@/hooks/use-list'
import type { StaffType, StaffMember, StaffListResponse, StaffCreateInput } from '@/types'

const STAFF_TYPES: StaffType[] = ['nurse', 'pharmacist', 'laboratorist', 'receptionist', 'accountant']

const TYPE_LABELS: Record<StaffType, string> = {
  nurse: 'Nurse',
  pharmacist: 'Pharmacist',
  laboratorist: 'Laboratorist',
  receptionist: 'Receptionist',
  accountant: 'Accountant',
}

const TYPE_PERMISSIONS: Record<StaffType, string> = {
  nurse: 'nurse',
  pharmacist: 'staff',
  laboratorist: 'staff',
  receptionist: 'staff',
  accountant: 'staff',
}

function buildStaffQuery(q: string, offset: number, _type: StaffType) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  params.set('limit', '25')
  params.set('offset', String(offset))
  return `?${params.toString()}`
}

export function StaffPage() {
  const { session } = useAuth()
  const { type } = useParams<{ type: StaffType }>()
  
  if (!type || !STAFF_TYPES.includes(type)) {
    return <StaffTypeSelector />
  }

  const canView = can(session, `${TYPE_PERMISSIONS[type]}_view`)
  const canAdd = can(session, `${TYPE_PERMISSIONS[type]}_add`)
  const canUpdate = can(session, `${TYPE_PERMISSIONS[type]}_update`)
  const canDelete = can(session, `${TYPE_PERMISSIONS[type]}_delete`)

  if (!canView) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={TYPE_LABELS[type]} description="Staff directory" />
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          You don't have permission to view {TYPE_LABELS[type].toLowerCase()}s.
        </div>
      </div>
    )
  }

  const buildQuery = useCallback((q: string, offset: number) => buildStaffQuery(q, offset, type), [type])
  const list = useList<StaffMember, StaffListResponse>(`/staff/${type}`, buildQuery)

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<StaffMember | null>(null)
  const [form, setForm] = useState<StaffCreateInput>({ name: '', email: '', phone: '', address: '', imgUrl: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetForm = () => {
    setForm({ name: '', email: '', phone: '', address: '', imgUrl: '' })
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
        await api.put(`/staff/${type}/${editing._id}`, form)
      } else {
        await api.post(`/staff/${type}`, form)
      }
      list.refresh()
      resetForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete this ${TYPE_LABELS[type].toLowerCase()}? This cannot be undone.`)) return
    try {
      await api.delete(`/staff/${type}/${id}`)
      list.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const title = `${TYPE_LABELS[type]}s`
  const description = list.data ? `${list.data.total} ${TYPE_LABELS[type].toLowerCase()}(s)` : 'Loading...'

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={title}
        description={description}
        actions={
          canAdd ? (
            <Button onClick={() => { setEditing(null); setShowForm(true); }}>Add {TYPE_LABELS[type]}</Button>
          ) : null
        }
      />

      {showForm && (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{editing ? `Edit ${TYPE_LABELS[type]}` : `Add ${TYPE_LABELS[type]}`}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="text-sm text-destructive">{error}</div>}
              <div className="space-y-1.5">
                <Label htmlFor="staffName">Name *</Label>
                <Input
                  id="staffName"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Full name"
                  maxLength={100}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="staffEmail">Email</Label>
                <Input
                  id="staffEmail"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="name@example.com"
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="staffPhone">Phone</Label>
                <Input
                  id="staffPhone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+92..."
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="staffAddress">Address</Label>
                <Input
                  id="staffAddress"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Optional"
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="staffImgUrl">Photo URL</Label>
                <Input
                  id="staffImgUrl"
                  value={form.imgUrl}
                  onChange={(e) => setForm({ ...form, imgUrl: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
                <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {list.error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          {list.error}
          <Button variant="outline" size="sm" className="mt-2" onClick={list.refresh}>Try again</Button>
        </div>
      )}

      {!list.error && list.data && list.data.items.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm font-medium">No {TYPE_LABELS[type].toLowerCase()}s yet.</p>
          {canAdd && (
            <Button size="sm" className="mt-3" onClick={() => setShowForm(true)}>
              Add {TYPE_LABELS[type]}
            </Button>
          )}
        </div>
      )}

      {list.data && list.data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">Photo</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">Email</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Phone</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium lg:table-cell">Address</th>
                <th scope="col" className="px-4 py-2.5 font-medium w-[100px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((staff) => (
                <tr key={staff._id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3">
                    <Avatar className="h-8 w-8">
                      {staff.imgUrl ? (
                        <AvatarImage src={staff.imgUrl} alt={staff.name} />
                      ) : (
                        <AvatarFallback>{staff.name.charAt(0).toUpperCase()}</AvatarFallback>
                      )}
                    </Avatar>
                  </td>
                  <td className="px-4 py-3 font-medium">{staff.name}</td>
                  <td className="hidden px-4 py-3 sm:table-cell text-sm text-muted-foreground">{staff.email || '—'}</td>
                  <td className="hidden px-4 py-3 md:table-cell text-sm text-muted-foreground">{staff.phone || '—'}</td>
                  <td className="hidden px-4 py-3 lg:table-cell text-sm text-muted-foreground">{staff.address || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {canUpdate && (
                        <Button variant="ghost" size="sm" onClick={() => { setForm({ name: staff.name, email: staff.email || '', phone: staff.phone || '', address: staff.address || '', imgUrl: staff.imgUrl || '' }); setEditing(staff); setShowForm(true); }}>
                          Edit
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(staff._id)}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!list.error && list.loading && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-border/60 p-4 last:border-0">
              <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="hidden h-4 w-24 animate-pulse rounded bg-muted sm:block" />
            </div>
          ))}
        </div>
      )}

      {list.data && list.data.total > list.limit && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <Button variant="outline" size="sm" disabled={list.offset === 0} onClick={() => list.setOffset(list.offset - list.limit)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={(list.offset + list.limit) >= list.data.total} onClick={() => list.setOffset(list.offset + list.limit)}>Next</Button>
        </div>
      )}
    </div>
  )
}

function StaffTypeSelector() {
  const navigate = useNavigate()
  const { session } = useAuth()

  const availableTypes = STAFF_TYPES.filter(t => can(session, `${TYPE_PERMISSIONS[t]}_view`))

  if (availableTypes.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Staff" />
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          You don't have permission to view any staff lists.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Staff" description="Select a staff type to manage" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {availableTypes.map((type) => (
          <Card
            key={type}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate(`/staff/${type}`)}
          >
            <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Badge variant="outline" className="text-base">{type.charAt(0).toUpperCase()}</Badge>
              </div>
              <h3 className="font-medium">{TYPE_LABELS[type]}s</h3>
              <p className="text-xs text-muted-foreground">Manage {TYPE_LABELS[type].toLowerCase()} records</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default StaffPage