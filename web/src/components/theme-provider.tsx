import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'system' | 'light' | 'dark'

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: 'system',
  setTheme: () => {},
})

function apply(theme: Theme) {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('hos.theme') as Theme | null) ?? 'system',
  )

  useEffect(() => {
    apply(theme)
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => theme === 'system' && apply('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme])

  const value = {
    theme,
    setTheme: (t: Theme) => {
      localStorage.setItem('hos.theme', t)
      setTheme(t)
    },
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
