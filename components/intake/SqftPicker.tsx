'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'

type Props = {
  onSelect: (value: string, label?: string) => void
  disabled?: boolean
  question?: string
  questionNumber?: number
  onSkipQuestion?: () => void
  onPauseQuestions?: () => void
  isPaused?: boolean
  onResumeQuestions?: () => void
  /** Starting value for the scrubber. Default 1500. */
  initialValue?: number
}

// Realistic bounds for UAE residential + commercial fit-outs.
const MIN = 200
const MAX = 15000
const STEPS = [
  { value: 500, label: 'Studio' },
  { value: 800, label: '1BR apt' },
  { value: 1200, label: '2BR apt' },
  { value: 1800, label: '3BR apt' },
  { value: 2500, label: 'Townhouse' },
  { value: 4000, label: 'Villa' },
  { value: 6000, label: 'Large villa' },
  { value: 10000, label: 'Office floor' },
]

function formatSqft(n: number): string {
  // Round to nearest 50 for tidiness
  const rounded = Math.round(n / 50) * 50
  return rounded.toLocaleString('en-US')
}

/**
 * Map a slider position (0-1) to a value using a logarithmic scale, so the
 * lower end (200-3000 sqft) gets more of the slider real estate where most
 * residential projects live.
 */
function posToValue(pos: number): number {
  const logMin = Math.log(MIN)
  const logMax = Math.log(MAX)
  return Math.exp(logMin + (logMax - logMin) * pos)
}
function valueToPos(value: number): number {
  const logMin = Math.log(MIN)
  const logMax = Math.log(MAX)
  return (Math.log(value) - logMin) / (logMax - logMin)
}

export default function SqftPicker({
  onSelect,
  disabled,
  question,
  questionNumber,
  onSkipQuestion,
  onPauseQuestions,
  isPaused,
  onResumeQuestions,
  initialValue = 1500,
}: Props) {
  const [value, setValue] = useState(Math.max(MIN, Math.min(MAX, initialValue || 1500)))
  const [isDragging, setIsDragging] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)

  // Set value from a clientX relative to the track.
  const setValueFromClientX = useCallback((clientX: number) => {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    setValue(posToValue(pos))
  }, [])

  // Pointer event handlers (unified for mouse + touch via PointerEvent)
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return
      e.preventDefault()
      setIsDragging(true)
      const target = e.currentTarget
      target.setPointerCapture(e.pointerId)
      setValueFromClientX(e.clientX)
    },
    [disabled, setValueFromClientX]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || disabled) return
      setValueFromClientX(e.clientX)
    },
    [isDragging, disabled, setValueFromClientX]
  )

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return
    setIsDragging(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch { /* ignore */ }
  }, [isDragging])

  // Keyboard support for accessibility: arrow keys nudge the value.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (disabled) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault()
        setValue((v) => Math.max(MIN, v - 50))
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault()
        setValue((v) => Math.min(MAX, v + 50))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [disabled])

  function handleConfirm() {
    if (disabled) return
    const rounded = Math.round(value / 50) * 50
    onSelect(String(rounded), `${formatSqft(rounded)} sqft`)
  }

  function jumpTo(target: number) {
    if (disabled) return
    setValue(target)
  }

  const pos = valueToPos(value)

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

      {/* Big readout */}
      <div className="px-4 pt-5 pb-2 text-center">
        <p className="text-4xl font-semibold text-[var(--ov-text,#ffffff)] tabular-nums leading-none">
          {formatSqft(value)}
        </p>
        <p className="text-xs text-[var(--ov-text-muted,#727272)] uppercase tracking-widest mt-1">
          square feet
        </p>
      </div>

      {/* Scrub track */}
      <div className="px-5 pt-6 pb-3">
        <div
          ref={trackRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          role="slider"
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-valuenow={Math.round(value)}
          aria-label="Property size in square feet"
          tabIndex={0}
          className="relative h-12 touch-none cursor-grab active:cursor-grabbing select-none"
        >
          {/* Tick marks — vertical lines showing the scrub scale */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-8 flex items-center justify-between">
            {Array.from({ length: 41 }).map((_, i) => {
              const isMajor = i % 10 === 0
              return (
                <div
                  key={i}
                  className={`${
                    isMajor
                      ? 'w-px h-6 bg-[var(--ov-text,#ffffff)]/30'
                      : 'w-px h-3 bg-[var(--ov-text-muted,#727272)]/25'
                  }`}
                />
              )
            })}
          </div>

          {/* Center indicator line */}
          <div
            className="absolute top-0 bottom-0 w-[3px] rounded-full bg-brand-purple pointer-events-none transition-[left]"
            style={{
              left: `calc(${pos * 100}% - 1.5px)`,
              transition: isDragging ? 'none' : 'left 120ms ease-out',
            }}
          />

          {/* Thumb highlight */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-brand-purple/20 border-2 border-brand-purple pointer-events-none"
            style={{
              left: `calc(${pos * 100}% - 16px)`,
              transition: isDragging ? 'none' : 'left 120ms ease-out',
            }}
          />
        </div>

        {/* Range labels */}
        <div className="flex items-center justify-between mt-2 text-[10px] text-[var(--ov-text-muted,#727272)]/60">
          <span>{formatSqft(MIN)}</span>
          <span>Drag to scrub</span>
          <span>{formatSqft(MAX)}+</span>
        </div>
      </div>

      {/* Quick-jump chips */}
      <div className="px-4 pb-3">
        <div className="flex flex-wrap gap-1.5">
          {STEPS.map((step) => (
            <button
              key={step.value}
              type="button"
              onClick={() => jumpTo(step.value)}
              disabled={disabled}
              className="px-2.5 py-1 rounded-full text-[11px] border border-[var(--ov-border,rgba(255,255,255,0.10))] text-[var(--ov-text-muted,#727272)] hover:text-[var(--ov-text,#ffffff)] hover:border-[var(--ov-accent-border,rgba(115,103,255,0.40))] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              title={`${formatSqft(step.value)} sqft`}
            >
              {step.label}
            </button>
          ))}
        </div>
      </div>

      {/* Confirm */}
      <div className="px-4 pb-3">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={disabled}
          className="w-full py-2.5 rounded-xl bg-brand-purple text-brand-dark text-sm font-medium hover:bg-brand-purple/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Confirm {formatSqft(value)} sqft
        </button>
      </div>

      {/* Footer: skip / pause */}
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
