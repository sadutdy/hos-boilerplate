/**
 * Shared placeholder for module screens. Each module becomes a real page as
 * its spec doc (rebuild-spec/01-modules/*.md) is implemented; this keeps the
 * navigation structure and permissions complete from day one.
 */
export function ModulePlaceholder({
  title,
  description,
  specDoc,
}: {
  title: string
  description: string
  specDoc: string
}) {
  return (
    <div>
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </header>
      <div className="mt-6 rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Screens for this module will follow the module spec{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{specDoc}</code>.
        </p>
      </div>
    </div>
  )
}
