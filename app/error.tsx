'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (
      error.name === 'ChunkLoadError' ||
      error.message?.includes('Failed to load chunk') ||
      error.message?.includes('Loading chunk')
    ) {
      window.location.reload()
    }
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-8">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <pre className="text-xs text-red-400 bg-red-500/10 rounded-lg p-4 max-w-lg overflow-auto whitespace-pre-wrap">
        {error.message}
      </pre>
      <button
        onClick={() => window.location.reload()}
        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
