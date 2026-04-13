'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
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

  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateArrows = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 2)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateArrows()
    el.addEventListener('scroll', updateArrows, { passive: true })
    const ro = new ResizeObserver(updateArrows)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', updateArrows); ro.disconnect() }
  }, [updateArrows])

  const scrollBy = useCallback((dir: -1 | 1) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: dir * 240, behavior: 'smooth' })
  }, [])

  // Click-and-drag horizontal scrolling
  const dragState = useRef({ isDown: false, startX: 0, scrollLeft: 0, moved: false })

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current
    if (!el || e.button !== 0) return
    dragState.current = { isDown: true, startX: e.clientX, scrollLeft: el.scrollLeft, moved: false }
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState.current.isDown) return
    const el = scrollRef.current
    if (!el) return
    const dx = e.clientX - dragState.current.startX
    if (Math.abs(dx) > 5) dragState.current.moved = true
    if (dragState.current.moved) {
      e.preventDefault()
      el.scrollLeft = dragState.current.scrollLeft - dx
    }
  }, [])

  const endDrag = useCallback(() => {
    dragState.current.isDown = false
  }, [])

  function handleSelect(opt: QuickReplyOption) {
    if (dragState.current.moved) { dragState.current.moved = false; return }
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

      {/* Card carousel with arrow navigation */}
      <div className="relative p-3">
        {/* Left arrow */}
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            className="absolute left-1 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-[var(--ov-surface-subtle,rgba(0,0,0,0.6))] border border-[var(--ov-border,rgba(255,255,255,0.15))] flex items-center justify-center text-[var(--ov-text,#ffffff)] hover:bg-[rgba(0,0,0,0.8)] transition-colors cursor-pointer backdrop-blur-sm"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        {/* Right arrow */}
        {canScrollRight && (
          <button
            type="button"
            onClick={() => scrollBy(1)}
            className="absolute right-1 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-[var(--ov-surface-subtle,rgba(0,0,0,0.6))] border border-[var(--ov-border,rgba(255,255,255,0.15))] flex items-center justify-center text-[var(--ov-text,#ffffff)] hover:bg-[rgba(0,0,0,0.8)] transition-colors cursor-pointer backdrop-blur-sm"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
        <div
          ref={scrollRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          className="flex gap-3 overflow-x-auto scrollbar-hide -mx-3 px-3 pb-1 snap-x snap-mandatory scroll-smooth cursor-grab active:cursor-grabbing select-none"
          style={{ WebkitOverflowScrolling: 'touch' }}
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

      {/* Skip CTA */}
      {onSkipQuestion && (
        <div className="px-4 pb-1">
          <button
            onClick={onSkipQuestion}
            disabled={disabled}
            className="px-4 py-2 rounded-full text-sm font-medium border border-[var(--ov-border,rgba(255,255,255,0.12))] text-[var(--ov-text-muted,#a0a0a0)] hover:text-[var(--ov-text,#ffffff)] hover:border-[var(--ov-accent-border,rgba(115,103,255,0.30))] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            Skip
          </button>
        </div>
      )}

      {/* Pause footer */}
      {(onPauseQuestions || onResumeQuestions) && (
        <div className="flex justify-end px-4 py-2.5 border-t border-[var(--ov-border,rgba(255,255,255,0.06))]">
          <button
            onClick={() => (isPaused ? onResumeQuestions?.() : onPauseQuestions?.())}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--ov-text-muted,#727272)] hover:text-[var(--ov-accent-strong,#7367ff)] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            {isPaused ? 'Resume Auto-questions' : 'Pause Auto-questions'}
          </button>
        </div>
      )}
    </div>
  )
}
