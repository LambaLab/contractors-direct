'use client'

import { useState } from 'react'
import * as Icons from 'lucide-react'
import { Check, ArrowRight } from 'lucide-react'
import { SCOPE_CATALOG, SCOPE_CONTEXT_MAP } from '@/lib/scope/catalog'

type Props = {
  onSubmit: (selectedIds: string[], displayText: string) => void
  isLast: boolean
  isStreaming: boolean
  /** Limits items to those relevant for this project context (e.g. "kitchen"). Shows all if empty/absent. */
  scopeContext?: string
  onSkipQuestion?: () => void
  onPauseQuestions?: () => void
  onResumeQuestions?: () => void
  isPaused?: boolean
}

export default function ScopeMultiSelectGrid({ onSubmit, isLast, isStreaming, scopeContext, onSkipQuestion, onPauseQuestions, onResumeQuestions, isPaused }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [otherText, setOtherText] = useState('')
  const showActions = isLast && !isStreaming

  const relevantIds = scopeContext ? SCOPE_CONTEXT_MAP[scopeContext] : null
  const visibleItems = relevantIds
    ? SCOPE_CATALOG.filter(item => relevantIds.includes(item.id))
    : SCOPE_CATALOG

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSubmit() {
    const ids = Array.from(selected)
    const names = ids.map(id => SCOPE_CATALOG.find(s => s.id === id)?.name ?? id)
    const parts = [...names]
    if (otherText.trim()) parts.push(otherText.trim())
    const displayText = parts.join(', ')
    onSubmit(ids, displayText)
  }

  return (
    <div className="w-full space-y-3 py-1">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {visibleItems.map((item) => {
          const isChecked = selected.has(item.id)
          const IconComponent = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[item.icon] ?? Icons.Circle
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle(item.id)}
              className={[
                'relative flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm transition-colors cursor-pointer',
                isChecked
                  ? 'bg-[rgba(115,103,255,0.15)] border border-[var(--ov-accent-border,rgba(115,103,255,0.50))] text-[var(--ov-text,#ffffff)]'
                  : 'border border-[var(--ov-border,rgba(255,255,255,0.12))] text-[var(--ov-text-muted,#a0a0a0)] hover:border-[var(--ov-accent-border,rgba(115,103,255,0.30))] hover:text-[var(--ov-text,#ffffff)]',
              ].join(' ')}
            >
              {/* Checkbox indicator */}
              <div
                className={[
                  'flex-shrink-0 w-4 h-4 rounded flex items-center justify-center transition-colors',
                  isChecked
                    ? 'bg-brand-purple text-brand-dark'
                    : 'border border-[var(--ov-border,rgba(255,255,255,0.20))]',
                ].join(' ')}
              >
                {isChecked && <Check className="w-3 h-3" />}
              </div>
              <IconComponent className="w-4 h-4 flex-shrink-0 opacity-60" />
              <span className="truncate">{item.name}</span>
            </button>
          )
        })}

        {/* Other (please type) */}
        <button
          type="button"
          onClick={() => {
            const input = document.getElementById('scope-other-input')
            if (input) input.focus()
          }}
          className="relative flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm transition-colors cursor-pointer border border-[var(--ov-border,rgba(255,255,255,0.12))] text-[var(--ov-text-muted,#a0a0a0)] hover:border-[var(--ov-accent-border,rgba(115,103,255,0.30))] hover:text-[var(--ov-text,#ffffff)]"
        >
          <div className="flex-shrink-0 w-4 h-4 rounded flex items-center justify-center border border-[var(--ov-border,rgba(255,255,255,0.20))]" />
          <Icons.Plus className="w-4 h-4 flex-shrink-0 opacity-60" />
          <span className="truncate">Other</span>
        </button>
      </div>

      {/* Other text input */}
      <input
        id="scope-other-input"
        type="text"
        placeholder="Type anything else..."
        value={otherText}
        onChange={(e) => setOtherText(e.target.value)}
        enterKeyHint="done"
        autoComplete="off"
        className="w-full px-3 py-2 rounded-lg text-sm bg-transparent border border-[var(--ov-border,rgba(255,255,255,0.12))] text-[var(--ov-text,#ffffff)] placeholder:text-[var(--ov-text-muted,#727272)] focus:outline-none focus:border-[var(--ov-accent-border,rgba(115,103,255,0.50))]"
      />

      {/* Continue button */}
      {showActions && (selected.size > 0 || otherText.trim()) && (
        <button
          type="button"
          onClick={handleSubmit}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer bg-brand-purple border border-brand-purple text-brand-dark hover:bg-brand-purple/90"
        >
          Continue
          <ArrowRight className="w-4 h-4" />
        </button>
      )}

      {/* Skip / Pause footer */}
      {(onSkipQuestion || onPauseQuestions || onResumeQuestions) && (
        <div className="flex items-center justify-between pt-2 border-t border-[var(--ov-border,rgba(255,255,255,0.06))]">
          <div>
            {onSkipQuestion && (
              <button onClick={onSkipQuestion} disabled={isStreaming} className="text-xs text-[var(--ov-text-muted,#727272)] hover:text-[var(--ov-text,#ffffff)] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
                Skip this question
              </button>
            )}
          </div>
          <div>
            {(onPauseQuestions || onResumeQuestions) && (
              <button
                onClick={() => isPaused ? onResumeQuestions?.() : onPauseQuestions?.()}
                disabled={isStreaming}
                className="inline-flex items-center gap-1.5 text-xs text-[var(--ov-text-muted,#727272)] hover:text-[var(--ov-accent-strong,#7367ff)] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPaused ? <Icons.Play className="w-3 h-3" /> : <Icons.Pause className="w-3 h-3" />}
                {isPaused ? 'Resume Auto-questions' : 'Pause Auto-questions'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
