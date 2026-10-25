import { Link } from 'react-router-dom'

function NotFoundPage() {
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        The page you were looking for doesn’t exist.
      </p>
      <Link to="/" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
        Go back to the dashboard
      </Link>
    </div>
  )
}

export default NotFoundPage
