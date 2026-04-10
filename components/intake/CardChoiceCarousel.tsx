'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Pause, Play } from 'lucide-react'
import type { QuickReplies as QuickRepliesType, QuickReplyOption } from '@/lib/intake-types'

type Props = {
  quickReplies: QuickRepliesType
  onSelect: (value: string, label?: string) => void
  disabled?: boolean
  question?: string
  questionNumber?: number
  onSkipQuestion?: () => void
  onPauseQuestions?: () => void
  isPaused?: boolean
  onResumeQuestions?: () => void
}

// Deterministic gradient picker: the same value always picks the same gradient,
// so the same card looks consistent across renders and page reloads.
const FALLBACK_GRADIENTS = [
  'from-indigo-500/30 via-purple-500/20 to-pink-500/30',
  'from-emerald-500/30 via-teal-500/20 to-cyan-500/30',
  'from-amber-500/30 via-orange-500/20 to-red-500/30',
  'from-blue-500/30 via-indigo-500/20 to-violet-500/30',
  'from-rose-500/30 via-pink-500/20 to-fuchsia-500/30',
  'from-lime-500/30 via-green-500/20 to-emerald-500/30',
]
function pickGradient(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0
  return FALLBACK_GRADIENTS[Math.abs(hash) % FALLBACK_GRADIENTS.length]
}

function CardImage({ option }: { option: QuickReplyOption }) {
  const [errored, setErrored] = useState(false)

  if (!option.imageUrl || errored) {
    return (
      <div
        className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${pickGradient(
          option.value
        )} bg-[var(--ov-surface-subtle,rgba(255,255,255,0.04))]`}
      >
        <span className="text-6xl select-none drop-shadow-lg" aria-hidden>
          {option.icon || '🏠'}
        </span>
      </div>
    )
  }

  return (
    <Image
      src={option.imageUrl}
      alt={option.imageAlt || option.label}
      fill
      sizes="(max-width: 640px) 200px, 220px"
      className="object-cover"
      onError={() => setErrored(true)}
    />
  )
}

export default function CardChoiceCarousel({
  quickReplies,
  onSelect,
  disabled,
  question,
  questionNumber,
  onSkipQuestion,
  onPauseQuestions,
  isPaused,
  onResumeQuestions,
}: Props) {
  const { options, allowCustom } = quickReplies
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customValue, setCustomValue] = useState('')

  function handleSelect(opt: QuickReplyOption) {
    if (disabled) return
    onSelect(opt.value, opt.label)
  }

  function handleCustomSubmit() {
    if (disabled || !customValue.trim()) return
    onSelect(customValue.trim())
  }

  return (
    <div className="rounded-xl border border-[var(--ov-border,rgba(255,255,255,0.10))] overflow-hidden">
      {/* Question header */}
      {question && (
        <div className="px-4 py-3 border-b border-[var(--ov-border,rgba(255,255,255,0.10))]">
          {questionNumber != null && questionNumber > 0 && (
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--ov-text-muted,#727272)]/50 mb-1">
              Question {questionNumber}
            </p>
          )}
          <p className="text-sm text-[var(--ov-text,#ffffff)] leading-relaxed">{question}</p>
        </div>
      )}

      {/* Card carousel: always horizontal snap-scroll regardless of viewport.
          We intentionally do NOT grid-wrap to multiple rows on desktop — the
          bottom panel is flex-shrink-0, so a tall card grid would collapse the
          chat history scroll area above. Keeping it to a single horizontal row
          means the carousel is at most ~220px tall and the page stays scrollable. */}
      <div className="p-3">
        <div
          className="
            flex gap-3 overflow-x-auto
            snap-x snap-mandatory scrollbar-hide
            -mx-3 px-3
            pb-1
          "
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleSelect(opt)}
              disabled={disabled}
              className="
                flex-shrink-0 w-[200px] sm:w-[220px] snap-start
                rounded-xl overflow-hidden border border-[var(--ov-border,rgba(255,255,255,0.10))]
                bg-[var(--ov-surface-subtle,rgba(255,255,255,0.03))]
                hover:border-[var(--ov-accent-border,rgba(115,103,255,0.40))]
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors cursor-pointer text-left
                focus:outline-none focus:border-[var(--ov-accent-strong,#7367ff)]
              "
            >
              <div className="relative aspect-[4/3] w-full">
                <CardImage option={opt} />
              </div>
              <div className="px-3 py-2">
                <p className="text-sm font-medium text-[var(--ov-text,#ffffff)] flex items-center gap-1.5">
                  {opt.icon && <span>{opt.icon}</span>}
                  <span className="truncate">{opt.label}</span>
                </p>
                {opt.description && (
                  <p className="text-[11px] text-[var(--ov-text-muted,#727272)] mt-0.5 line-clamp-2">
                    {opt.description}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-[var(--ov-text-muted,#727272)]/60 mt-1.5 text-center">
          Scroll sideways to see more
        </p>
      </div>

      {/* Type something else */}
      {allowCustom !== false && (
        <div className="border-t border-[var(--ov-border,rgba(255,255,255,0.10))]">
          {showCustomInput ? (
            <div className="flex gap-2 p-3">
              <input
                autoFocus
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
                placeholder="Type your answer..."
                className="flex-1 bg-[var(--ov-input-bg,rgba(255,255,255,0.05))] border border-[var(--ov-border,rgba(255,255,255,0.10))] rounded-lg px-3 py-2 text-sm text-[var(--ov-text,#ffffff)] placeholder:text-[var(--ov-text-muted,#727272)] outline-none focus:border-brand-purple/50"
              />
              <button
                onClick={handleCustomSubmit}
                disabled={disabled || !customValue.trim()}
                className="px-3 py-2 bg-brand-purple text-brand-dark rounded-lg text-sm font-medium disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                Send
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCustomInput(true)}
              disabled={disabled}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--ov-surface-subtle,rgba(255,255,255,0.05))] transition-colors text-left disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              <span className="text-sm text-[var(--ov-text-muted,#727272)]">Type something else...</span>
            </button>
          )}
        </div>
      )}

      {/* Skip / Pause footer */}
      {(onSkipQuestion || onPauseQuestions || onResumeQuestions) && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--ov-border,rgba(255,255,255,0.06))]">
          <div>
            {onSkipQuestion && (
              <button
                onClick={onSkipQuestion}
                disabled={disabled}
                className="text-xs text-[var(--ov-text-muted,#727272)] hover:text-[var(--ov-text,#ffffff)] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                Skip this question
              </button>
            )}
          </div>
          <div>
            {(onPauseQuestions || onResumeQuestions) && (
              <button
                onClick={() => (isPaused ? onResumeQuestions?.() : onPauseQuestions?.())}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 text-xs text-[var(--ov-text-muted,#727272)] hover:text-[var(--ov-accent-strong,#7367ff)] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                {isPaused ? 'Resume Auto-questions' : 'Pause Auto-questions'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
