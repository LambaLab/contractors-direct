'use client'

export default function AdminDashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-8">
      <h2 className="text-xl font-semibold text-foreground">Something went wrong</h2>
      <pre className="text-xs text-red-400 bg-red-500/10 rounded-lg p-4 max-w-lg overflow-auto whitespace-pre-wrap">
        {error.message}
        {error.stack && '\n\n' + error.stack.split('\n').slice(0, 5).join('\n')}
      </pre>
      <button
        onClick={reset}
        className="px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-purple/90 transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
