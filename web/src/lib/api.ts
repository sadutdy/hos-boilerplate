/**
 * API client for the HOS-Boilerplate backend.
 *
 * Convention per rebuild-spec/03-api-spec.md:
 * - REST under /api/v1, JSON, camelCase keys
 * - JWT access token on every request
 * - Errors: 4xx/5xx with { error: { code, message, fields? } }
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

export interface ApiError {
  code: string
  message: string
  fields?: Record<string, string>
}

export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string
  readonly fields?: Record<string, string>

  constructor(status: number, error: ApiError) {
    super(error.message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = error.code
    this.fields = error.fields
  }
}

export interface AuthResponse {
  user: { id: string; login: string; name: string; role: string; phone?: string | null }
  token: string
  hospitalName?: string | null
  needsInstitute?: boolean
  permissions?: string[]
}

export const tokenStore = {
  get: () => localStorage.getItem('hos.token'),
  set: (token: string | null) =>
    token ? localStorage.setItem('hos.token', token) : localStorage.removeItem('hos.token'),
}

async function request<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init
  const token = tokenStore.get()

  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: {
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })

  if (!res.ok) {
    let error: ApiError = {
      code: 'unknown',
      message: `Request failed with status ${res.status}`,
    }
    try {
      const body = (await res.json()) as { error?: ApiError }
      if (body.error) error = body.error
    } catch {
      // non-JSON error body: keep the status-code fallback
    }
    if (res.status === 401) tokenStore.set(null)
    throw new ApiRequestError(res.status, error)
  }

  // 204 / empty body
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, json?: unknown) => request<T>(path, { method: 'POST', json }),
  put: <T>(path: string, json?: unknown) => request<T>(path, { method: 'PUT', json }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  /** PUT a file as the raw request body (e.g. a .wav recording). */
  putFile: <T>(path: string, file: Blob, contentType: string) =>
    request<T>(path, { method: 'PUT', body: file, headers: { 'Content-Type': contentType } }),
}
