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
import { formatDateTime } from '@/lib/format'
import type { 
  User, 
  UsersResponse, 
  UserCreateInput, 
  UserUpdateInput, 
  UserRole, 
  RolePermissions, 
  ActivityLogsResponse
} from '@/types'
import { PERMISSION_GROUPS, PERMISSION_ROLES } from '@/types'

const ROLES: UserRole[] = ['admin', 'doctor', 'nurse', 'pharmacist', 'laboratorist', 'accountant', 'receptionist', 'patient']

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  doctor: 'Doctor',
  nurse: 'Nurse',
  pharmacist: 'Pharmacist',
  laboratorist: 'Laboratorist',
  accountant: 'Accountant',
  receptionist: 'Receptionist',
  patient: 'Patient',
}

function buildUsersQuery(q: string, offset: number) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  params.set('limit', '25')
  params.set('offset', String(offset))
  return `?${params.toString()}`
}

export function UsersPage() {
  const { session } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  
  const activeTab = searchParams.get('tab') ?? 'users'
  const setActiveTab = (tab: string) => setSearchParams({ ...Object.fromEntries(searchParams), tab })

  const canManage = can(session, 'users')

  const buildQuery = useCallback((q: string, offset: number) => buildUsersQuery(q, offset), [])
  const usersList = useList<User, UsersResponse>('/users', buildQuery)

  const [selectedRole, setSelectedRole] = useState('admin')
  const [permissions, setPermissions] = useState<RolePermissions | null>(null)
  const [permsLoading, setPermsLoading] = useState(false)
  const [permsError, setPermsError] = useState<string | null>(null)

  const [activityLogs, setActivityLogs] = useState<ActivityLogsResponse | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)
  const [activityFilters, setActivityFilters] = useState({ q: '', user: '', method: '', route: '', ip: '' })

  useEffect(() => {
    if (activeTab === 'permissions') {
      loadPermissions(selectedRole)
    }
  }, [activeTab, selectedRole])

  useEffect(() => {
    if (activeTab === 'activity') {
      loadActivityLogs()
    }
  }, [activeTab, activityFilters])

  const loadPermissions = async (role: string) => {
    setPermsLoading(true)
    setPermsError(null)
    try {
      const data = await api.get<RolePermissions>(`/roles/${role}/permissions`)
      setPermissions(data)
    } catch (e) {
      setPermsError(e instanceof Error ? e.message : 'Failed to load permissions')
    } finally {
      setPermsLoading(false)
    }
  }

  const handleSavePermissions = async (keys: string[]) => {
    setPermsLoading(true)
    setPermsError(null)
    try {
      await api.put(`/roles/${selectedRole}/permissions`, { keys })
      await loadPermissions(selectedRole)
    } catch (e) {
      setPermsError(e instanceof Error ? e.message : 'Failed to save permissions')
    } finally {
      setPermsLoading(false)
    }
  }

  const loadActivityLogs = async () => {
    setActivityLoading(true)
    setActivityError(null)
    try {
      const params = new URLSearchParams()
      if (activityFilters.q) params.set('q', activityFilters.q)
      if (activityFilters.user) params.set('user', activityFilters.user)
      if (activityFilters.method) params.set('method', activityFilters.method)
      if (activityFilters.route) params.set('route', activityFilters.route)
      if (activityFilters.ip) params.set('ip', activityFilters.ip)
      params.set('limit', '25')
      const data = await api.get<ActivityLogsResponse>(`/activity?${params.toString()}`)
      setActivityLogs(data)
    } catch (e) {
      setActivityError(e instanceof Error ? e.message : 'Failed to load activity logs')
    } finally {
      setActivityLoading(false)
    }
  }

  const handleClearActivity = async () => {
    if (!confirm('Move all activity logs to trash?')) return
    try {
      await api.post('/activity/clear')
      loadActivityLogs()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to clear logs')
    }
  }

  const handleDestroyActivity = async () => {
    if (!confirm('Permanently destroy all trashed logs? This cannot be undone.')) return
    try {
      await api.post('/activity/destroy')
      loadActivityLogs()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to destroy logs')
    }
  }

  if (!canManage) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Users & Permissions" />
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          You don't have permission to manage users.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Users & Permissions"
        description={usersList.data ? `${usersList.data.total} users` : 'Loading...'}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="activity">Activity Log</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-5">
          <UsersTab users={usersList} canManage={canManage} />
        </TabsContent>

        <TabsContent value="permissions" className="mt-5">
          <PermissionsTab 
            selectedRole={selectedRole}
            setSelectedRole={setSelectedRole}
            permissions={permissions}
            permsLoading={permsLoading}
            permsError={permsError}
            onSave={handleSavePermissions}
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-5">
          <ActivityTab
            logs={activityLogs}
            loading={activityLoading}
            error={activityError}
            filters={activityFilters}
            setFilters={setActivityFilters}
            onRefresh={loadActivityLogs}
            onClear={handleClearActivity}
            onDestroy={handleDestroyActivity}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function UsersTab({ users, canManage }: { users: ReturnType<typeof useList<User, UsersResponse>>; canManage: boolean }) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [form, setForm] = useState<UserCreateInput>({ 
    firstName: '', lastName: '', login: '', email: '', role: 'doctor', phone: '', about: '', password: '' 
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetForm = () => {
    setForm({ firstName: '', lastName: '', login: '', email: '', role: 'doctor', phone: '', about: '', password: '' })
    setEditing(null)
    setShowForm(false)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.firstName || !form.lastName || !form.login || !form.email) {
      setError('All required fields must be filled')
      return
    }
    if (!editing && !form.password) {
      setError('Password is required for new users')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      if (editing) {
        const updateData: UserUpdateInput = { ...form }
        if (!form.password) delete updateData.password
        await api.put(`/users/${editing._id}`, updateData)
      } else {
        await api.post('/users', form)
      }
      users.refresh()
      resetForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save user')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this user? This cannot be undone.')) return
    try {
      await api.delete(`/users/${id}`)
      users.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">User Accounts</h3>
        {canManage && (
          <Button onClick={() => { setEditing(null); setShowForm(true); }}>Add User</Button>
        )}
      </div>

      {showForm && (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{editing ? 'Edit User' : 'New User'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="text-sm text-destructive">{error}</div>}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input id="firstName" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required maxLength={20} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input id="lastName" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required maxLength={20} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="login">Login (Username) *</Label>
                  <Input id="login" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} required maxLength={20} placeholder="username" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email *</Label>
                  <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required maxLength={100} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="role">Role *</Label>
                  <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+92..." maxLength={20} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">{editing ? 'New Password (leave blank to keep current)' : 'Password *'} </Label>
                  <Input id="password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" autoComplete="new-password" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="about">About</Label>
                <Input id="about" value={form.about} onChange={(e) => setForm({ ...form, about: e.target.value })} placeholder="Optional description" maxLength={200} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
                <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {users.error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          {users.error}
          <Button variant="outline" size="sm" className="mt-2" onClick={users.refresh}>Try again</Button>
        </div>
      )}

      {!users.error && users.data && users.data.items.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm font-medium">No users yet.</p>
          {canManage && (
            <Button size="sm" className="mt-3" onClick={() => setShowForm(true)}>
              Add User
            </Button>
          )}
        </div>
      )}

      {users.data && users.data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Login</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Email</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Role</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Phone</th>
                <th scope="col" className="px-4 py-2.5 font-medium w-[100px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.data.items.map((user) => (
                <tr key={user._id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-medium">{user.firstName} {user.lastName}</td>
                  <td className="px-4 py-3 font-mono text-xs">{user.login}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{user.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{ROLE_LABELS[user.role]}</Badge>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell text-sm text-muted-foreground">{user.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => { 
                        setForm({ 
                          firstName: user.firstName, 
                          lastName: user.lastName, 
                          login: user.login, 
                          email: user.email, 
                          role: user.role, 
                          phone: user.phone || '', 
                          about: user.about || '', 
                          password: '' 
                        }); 
                        setEditing(user); 
                        setShowForm(true); 
                      }}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(user._id)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!users.error && users.loading && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-border/60 p-4 last:border-0">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {users.data && users.data.total > users.limit && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <Button variant="outline" size="sm" disabled={users.offset === 0} onClick={() => users.setOffset(users.offset - users.limit)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={(users.offset + users.limit) >= users.data.total} onClick={() => users.setOffset(users.offset + users.limit)}>Next</Button>
        </div>
      )}
    </div>
  )
}

function PermissionsTab({ 
  selectedRole, 
  setSelectedRole, 
  permissions, 
  permsLoading, 
  permsError, 
  onSave 
}: { 
  selectedRole: string
  setSelectedRole: (r: string) => void
  permissions: RolePermissions | null
  permsLoading: boolean
  permsError: string | null
  onSave: (keys: string[]) => void
}) {
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (permissions) {
      setCheckedKeys(new Set(permissions.keys))
    }
  }, [permissions])

  const toggleKey = (key: string) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleSave = () => {
    onSave(Array.from(checkedKeys))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="roleSelect">Role</Label>
          <Select 
            id="roleSelect"
            value={selectedRole} 
            onChange={(e) => { setSelectedRole(e.target.value); setCheckedKeys(new Set()); }} 
            className="w-[250px]"
            disabled={permsLoading}
          >
            {PERMISSION_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r as UserRole]}</option>)}
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <Button onClick={handleSave} disabled={permsLoading}>{permsLoading ? 'Saving…' : 'Save Permissions'}</Button>
        </div>
      </div>

      {permsError && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">{permsError}</div>
      )}

      {permsLoading && !permissions && (
        <div className="h-32 animate-pulse rounded-lg bg-muted" />
      )}

      {permissions && (
        <div className="space-y-4">
          {Object.entries(PERMISSION_GROUPS).map(([group, keys]) => (
            <Card key={group}>
              <CardHeader>
                <CardTitle className="text-sm capitalize">{group.replace('_', ' ')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {keys.map((key) => (
                    <label key={key} className="inline-flex items-center gap-1.5 rounded border border-border bg-card px-3 py-1.5 text-xs cursor-pointer hover:bg-accent transition-colors">
                      <input
                        type="checkbox"
                        checked={checkedKeys.has(key)}
                        onChange={() => toggleKey(key)}
                        className="h-3 w-3"
                      />
                      <span>{key}</span>
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function ActivityTab({
  logs,
  loading,
  error,
  filters,
  setFilters,
  onRefresh,
  onClear,
  onDestroy,
}: {
  logs: ActivityLogsResponse | null
  loading: boolean
  error: string | null
  filters: { q: string; user: string; method: string; route: string; ip: string }
  setFilters: React.Dispatch<React.SetStateAction<{ q: string; user: string; method: string; route: string; ip: string }>>
  onRefresh: () => void
  onClear: () => void
  onDestroy: () => void
}) {
  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1.5 flex-1 min-w-[200px]">
          <Label htmlFor="actSearch">Search</Label>
          <Input id="actSearch" value={filters.q} onChange={(e) => handleFilterChange('q', e.target.value)} placeholder="Search descriptions..." />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="actUser">User ID</Label>
          <Input id="actUser" value={filters.user} onChange={(e) => handleFilterChange('user', e.target.value)} placeholder="User ID" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="actMethod">Method</Label>
          <Select id="actMethod" value={filters.method} onChange={(e) => handleFilterChange('method', e.target.value)} className="w-[140px]">
            <option value="">All</option>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="actRoute">Route</Label>
          <Input id="actRoute" value={filters.route} onChange={(e) => handleFilterChange('route', e.target.value)} placeholder="/api/v1/..." />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="actIp">IP</Label>
          <Input id="actIp" value={filters.ip} onChange={(e) => handleFilterChange('ip', e.target.value)} placeholder="192.168.x.x" />
        </div>
        <div className="flex gap-2">
          <Button onClick={onRefresh} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</Button>
          <Button variant="outline" onClick={onClear}>Clear (Trash)</Button>
          <Button variant="destructive" onClick={onDestroy}>Destroy All</Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      )}

      {loading && !logs && (
        <div className="h-32 animate-pulse rounded-lg bg-muted" />
      )}

      {logs && logs.items.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No activity logs found.
        </div>
      )}

      {logs && logs.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">Time</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Description</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">User</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Method</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium lg:table-cell">Route</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium xl:table-cell">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.items.map((entry) => (
                <tr key={entry._id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{formatDateTime(entry.createdAt)}</td>
                  <td className="px-4 py-3 font-medium">{entry.description}</td>
                  <td className="hidden px-4 py-3 sm:table-cell text-sm text-muted-foreground">{entry.userId || 'guest'}</td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <Badge variant="outline" className="text-xs">{entry.method || '—'}</Badge>
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell text-sm text-muted-foreground truncate max-w-[200px]">{entry.route || '—'}</td>
                  <td className="hidden px-4 py-3 xl:table-cell text-sm text-muted-foreground font-mono">{entry.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {logs && logs.total > 25 && (
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Showing {logs.items.length} of {logs.total}</span>
        </div>
      )}
    </div>
  )
}

export default UsersPage