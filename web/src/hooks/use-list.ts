import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

const LIMIT = 25
const DEBOUNCE_MS = 260

export interface ListData<T> {
  items: T[]
  total: number
}

/** Stable module-level identity so the fetch effect doesn't re-run per render. */
const defaultBuildQuery = (q: string, offset: number) =>
  `?q=${encodeURIComponent(q)}&limit=${LIMIT}&offset=${offset}`

/**
 * Debounced search + offset paging for list endpoints returning { items, total }.
 * `buildQuery` receives the debounced query and current offset; keep it stable
 * (module-level or wrapped in useCallback) — a fresh inline function re-triggers
 * the fetch on every render.
 */
export function useList<T, R extends ListData<T> = ListData<T>>(
  basePath: string,
  buildQuery: (q: string, offset: number) => string = defaultBuildQuery,
) {
  const [query, setQueryState] = useState('')
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState<R | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastQueryRef = useRef<string | null>(null)

  const fetchList = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false

    // Typing (different query than last run) is debounced; paging, refresh,
    // and cleared searches run immediately.
    const immediate = lastQueryRef.current === query || query === ''
    lastQueryRef.current = query

    function run() {
      setLoading(true)
      api.get<R>(`${basePath}${buildQuery(query, offset)}`).then(
        (d) => {
          if (cancelled) return
          setData(d)
          setError(null)
          setLoading(false)
        },
        (e: unknown) => {
          if (cancelled) return
          setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
          setLoading(false)
        },
      )
    }

    if (immediate) {
      run()
    } else if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(run, DEBOUNCE_MS)
    } else {
      timerRef.current = setTimeout(run, DEBOUNCE_MS)
    }

    return () => {
      cancelled = true
    }
  }, [basePath, buildQuery, query, offset, nonce])

  function setQuery(q: string) {
    setQueryState(q)
    setOffset(0)
  }

  return {
    query,
    setQuery,
    offset,
    setOffset,
    limit: LIMIT,
    data,
    error,
    loading,
    refresh: fetchList,
  }
}
