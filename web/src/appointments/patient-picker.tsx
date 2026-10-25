import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import type { Patient } from '@/types'

/**
 * Typeahead patient picker for booking / linking flows.
 * Searches the patients list endpoint (LIKE name / patientId / phone / email).
 */
export function PatientPicker({
  onPick,
  clearSignal = 0,
}: {
  onPick: (patient: Patient) => void
  /** bump to 1+ to move focus back and clear; keeps the field controlled by the parent */
  clearSignal?: number
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Patient[] | null>(null)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Patient | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (query.trim().length < 1) {
      setResults(null)
      setOpen(false)
      return
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      let cancelled = false
      api.get<{ items: Patient[] }>(`/patients?q=${encodeURIComponent(query)}&limit=8`).then(
        (d) => {
          if (cancelled) return
          setResults(d.items)
          setOpen(true)
        },
        () => {
          if (cancelled) return
          setResults([])
          setOpen(true)
        },
      )
      return () => {
        cancelled = true
      }
    }, 220)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [query])

  useEffect(() => {
    if (clearSignal > 0) {
      setQuery('')
      setSelected(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSignal])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div className="relative" ref={boxRef}>
      {selected ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-input bg-muted/40 px-3 py-1.5 text-sm">
          <span>
            <span className="font-medium">{selected.name}</span>{' '}
            <span className="font-mono text-xs text-muted-foreground">
              {selected.patientId}
            </span>
            {selected.phone ? (
              <span className="text-muted-foreground"> · {selected.phone}</span>
            ) : null}
          </span>
          <button
            type="button"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => {
              setSelected(null)
              setQuery('')
            }}
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results && results.length > 0 && setOpen(true)}
            placeholder="Search patient by name, ID, or phone"
            aria-label="Search patient"
            role="combobox"
            aria-controls="patient-picker-results"
            aria-expanded={open && Boolean(results?.length)}
          />
          {open && results && (
            <ul
              id="patient-picker-results"
              role="listbox"
              className="absolute left-0 right-0 top-full z-40 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md"
            >
              {results.length === 0 ? (
                <li className="px-2 py-3 text-sm text-muted-foreground" aria-live="polite">
                  {`No patient found for “${query}”. Register them first.`}
                </li>
              ) : (
                results.map((p) => (
                  <li key={p._id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                      onClick={() => {
                        setSelected(p)
                        onPick(p)
                        setOpen(false)
                        setResults(null)
                        setQuery('')
                      }}
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {p.patientId}
                      </span>
                      {p.phone ? (
                        <span className="text-xs text-muted-foreground">{p.phone}</span>
                      ) : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
