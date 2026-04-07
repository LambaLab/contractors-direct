'use client'

import TypingIndicator from './TypingIndicator'

const SESSION_LABELS = [
  'Reviewing your project',
  'Mapping the scope',
  'Estimating the work',
  'Preparing the workspace',
  'Setting up the AI',
]

type Props = {
  idea: string
}

export default function SessionLoadingScreen({ idea }: Props) {
  const preview = idea.length > 60 ? idea.slice(0, 60).trimEnd() + '…' : idea

  return (
    <div className="flex flex-col items-center justify-center gap-6">
      {preview && (
        <p className="text-sm text-[var(--ov-text-muted,#727272)] italic text-center max-w-xs px-4 leading-relaxed">
          &ldquo;{preview}&rdquo;
        </p>
      )}

      {/* Three staggered pulsing dots */}
      <div className="flex items-center gap-2.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-brand-purple animate-pulse"
            style={{ animationDelay: `${i * 200}ms` }}
          />
        ))}
      </div>

      {/* Rotating analysis label */}
      <TypingIndicator labels={SESSION_LABELS} />
    </div>
  )
}
