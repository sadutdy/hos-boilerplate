import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/auth-context'
import { ApiRequestError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'

function LoginPage() {
  const { login, session, loading } = useAuth()
  const navigate = useNavigate()
  const [loginName, setLoginName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Redirect declaratively: calling navigate() during render updates the router mid-render.
  if (session) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    try {
      await login(loginName, password)
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message)
        setFieldErrors(err.fields ?? {})
      } else {
        setError('Could not reach the server. Please try again.')
      }
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">HOS-Boilerplate</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to the staff console</p>
        </div>
        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm"
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="login">Username</Label>
            <Input
              id="login"
              name="login"
              autoComplete="username"
              autoFocus
              required
              value={loginName}
              onChange={(e) => setLoginName(e.target.value)}
              aria-invalid={Boolean(fieldErrors.login)}
              aria-describedby={fieldErrors.login ? 'login-error' : undefined}
            />
            {fieldErrors.login && (
              <p id="login-error" className="text-xs text-destructive">
                {fieldErrors.login}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'password-error' : error ? 'form-error' : undefined}
            />
            {fieldErrors.password && (
              <p id="password-error" className="text-xs text-destructive">
                {fieldErrors.password}
              </p>
            )}
          </div>
          {error && (
            <p id="form-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </main>
  )
}

export { LoginPage as Component }
export default LoginPage
