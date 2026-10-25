import * as React from 'react'
import { cn } from '@/lib/utils'

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
  onValueChange: (value: string) => void
  children: React.ReactNode
  defaultValue?: string
}

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ className, children, value, onValueChange, defaultValue, ...props }, ref) => {
    const [activeValue, setActiveValue] = React.useState(value ?? defaultValue ?? '')

    React.useEffect(() => {
      if (value !== undefined) {
        setActiveValue(value)
      }
    }, [value])

    const handleValueChange = (newValue: string) => {
      setActiveValue(newValue)
      onValueChange?.(newValue)
    }

    return (
      <div ref={ref} className={cn('flex flex-col', className)} {...props}>
        <TabsContext.Provider value={{ value: activeValue, onValueChange: handleValueChange }}>
          {children}
        </TabsContext.Provider>
      </div>
    )
  },
)
Tabs.displayName = 'Tabs'

interface TabsContextValue {
  value: string
  onValueChange: (value: string) => void
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

function useTabsContext() {
  const context = React.useContext(TabsContext)
  if (!context) {
    throw new Error('Tabs components must be used within Tabs')
  }
  return context
}

interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {}

const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      role="tablist"
      aria-orientation="horizontal"
      className={cn('inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground', className)}
      {...props}
    >
      {children}
    </div>
  ),
)
TabsList.displayName = 'TabsList'

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
  disabled?: boolean
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, disabled, children, ...props }, ref) => {
    const { value: activeValue, onValueChange } = useTabsContext()
    const isActive = activeValue === value

    return (
      <button
        ref={ref}
        role="tab"
        aria-selected={isActive}
        aria-controls={`tabs-panel-${value}`}
        id={`tabs-trigger-${value}`}
        data-state={isActive ? 'active' : 'inactive'}
        disabled={disabled}
        type="button"
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          isActive ? 'bg-background text-foreground shadow-sm' : 'hover:bg-accent hover:text-accent-foreground',
          className,
        )}
        onClick={() => !disabled && onValueChange(value)}
        {...props}
      >
        {children}
      </button>
    )
  },
)
TabsTrigger.displayName = 'TabsTrigger'

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, children, ...props }, ref) => {
    const { value: activeValue } = useTabsContext()
    const isActive = activeValue === value

    if (!isActive) return null

    return (
      <div
        ref={ref}
        role="tabpanel"
        id={`tabs-panel-${value}`}
        aria-labelledby={`tabs-trigger-${value}`}
        className={cn('mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', className)}
        {...props}
      >
        {children}
      </div>
    )
  },
)
TabsContent.displayName = 'TabsContent'

export { Tabs, TabsList, TabsTrigger, TabsContent }