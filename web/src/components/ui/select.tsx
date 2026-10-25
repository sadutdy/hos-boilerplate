import * as React from 'react'
import { cn } from '@/lib/utils'

/** Native select wrapper — simple, controlled via value/onChange. */
interface NativeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

function NativeSelect({ className, ...props }: NativeSelectProps) {
  return (
    <select
      className={cn(
        'flex h-9 w-full appearance-none rounded-md border border-input bg-transparent bg-[length:12px] bg-[right_0.6rem_center] bg-no-repeat px-3 pr-8 py-1 text-sm shadow-sm',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23777' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...props}
    />
  )
}

NativeSelect.displayName = 'NativeSelect'

/** Compound Select components — Radix-style, controlled via value/onValueChange. */
interface SelectContextValue {
  value: string
  onValueChange: (value: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
  contentRef: React.RefObject<HTMLDivElement | null>
}

const SelectContext = React.createContext<SelectContextValue | null>(null)

function useSelectContext() {
  const context = React.useContext(SelectContext)
  if (!context) {
    throw new Error('Select components must be used within Select')
  }
  return context
}

interface SelectProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
  onValueChange: (value: string) => void
  children: React.ReactNode
}

const Select = React.forwardRef<HTMLDivElement, SelectProps>(
  ({ className, children, value, onValueChange, ...props }, ref) => {
    const [open, setOpen] = React.useState(false)
    const triggerRef = React.useRef<HTMLButtonElement>(null)
    const contentRef = React.useRef<HTMLDivElement>(null)

    const contextValue = React.useMemo(
      () => ({
        value,
        onValueChange,
        open,
        onOpenChange: setOpen,
        triggerRef,
        contentRef,
      }),
      [value, onValueChange, open, triggerRef, contentRef],
    )

    React.useEffect(() => {
      function handleKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
          setOpen(false)
          triggerRef.current?.focus()
        }
      }
      if (open) {
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
      }
    }, [open])

    return (
      <SelectContext.Provider value={contextValue}>
        <div ref={ref} className={cn('relative', className)} {...props}>
          {children}
        </div>
      </SelectContext.Provider>
    )
  },
)
Select.displayName = 'Select'

interface SelectTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

const SelectTrigger = React.forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ className, children, ...props }, ref) => {
    const { value, onOpenChange, triggerRef, contentRef } = useSelectContext()

    return (
      <button
        ref={(el) => {
          triggerRef.current = el
          if (typeof ref === 'function') ref(el)
          else if (ref) ref.current = el
        }}
        type="button"
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'data-[placeholder]:text-muted-foreground',
          className,
        )}
        aria-haspopup="listbox"
        aria-expanded={contentRef.current !== null}
        onClick={() => onOpenChange(!contentRef.current)}
        {...props}
      >
        <span data-placeholder={!value}>{children}</span>
        <svg
          className="ml-2 h-4 w-4 opacity-50 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    )
  },
)
SelectTrigger.displayName = 'SelectTrigger'

interface SelectValueProps extends React.HTMLAttributes<HTMLSpanElement> {
  placeholder?: string
}

const SelectValue = React.forwardRef<HTMLSpanElement, SelectValueProps>(
  ({ className, children, placeholder, ...props }, ref) => {
    const { value } = useSelectContext()
    return (
      <span ref={ref} className={cn('truncate', className)} {...props}>
        {value ? children : placeholder}
      </span>
    )
  },
)
SelectValue.displayName = 'SelectValue'

interface SelectContentProps extends React.HTMLAttributes<HTMLDivElement> {}

const SelectContent = React.forwardRef<HTMLDivElement, SelectContentProps>(
  ({ className, children, ...props }, ref) => {
    const { open, onOpenChange, contentRef } = useSelectContext()

    if (!open) return null

    React.useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (contentRef.current && !contentRef.current.contains(e.target as Node)) {
          onOpenChange(false)
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [onOpenChange, contentRef])

    return (
      <div
        ref={(el) => {
          contentRef.current = el
          if (typeof ref === 'function') ref(el)
          else if (ref) ref.current = el
        }}
        className={cn(
          'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md',
          className,
        )}
        {...props}
      >
        <div className="max-h-96 overflow-y-auto">{children}</div>
      </div>
    )
  },
)
SelectContent.displayName = 'SelectContent'

interface SelectItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
  disabled?: boolean
}

const SelectItem = React.forwardRef<HTMLDivElement, SelectItemProps>(
  ({ className, children, value, disabled, ...props }, ref) => {
    const { value: currentValue, onValueChange, onOpenChange } = useSelectContext()
    const isSelected = value === currentValue

    return (
      <div
        ref={ref}
        className={cn(
          'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none',
          'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
          'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
          isSelected && 'bg-accent text-accent-foreground',
          disabled && 'pointer-events-none opacity-50',
          className,
        )}
        data-value={value}
        data-disabled={disabled}
        data-highlighted={isSelected}
        onClick={() => {
          if (!disabled) {
            onValueChange(value)
            onOpenChange(false)
          }
        }}
        {...props}
      >
        {isSelected && (
          <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
            <svg
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </span>
        )}
        {children}
      </div>
    )
  },
)
SelectItem.displayName = 'SelectItem'

/** Export compound Select as main, NativeSelect for simple cases. */
export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, NativeSelect }
export type { NativeSelectProps, SelectProps, SelectTriggerProps, SelectValueProps, SelectContentProps, SelectItemProps }