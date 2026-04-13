'use client'

import { useState, useEffect } from 'react'
import { Pause, Play } from 'lucide-react'
import type { QuickReplies as QuickRepliesType, QuickReplyOption } from '@/lib/intake-types'

type Props = {
  quickReplies: QuickRepliesType
  onSelect: (value: string, label?: string) => void
  disabled?: boolean
  question?: string  // Shown as a header at the top of the list card
  questionNumber?: number  // e.g. 5 → "QUESTION 5" shown above the question text
  onSkipQuestion?: () => void
  onPauseQuestions?: () => void
  isPaused?: boolean
  onResumeQuestions?: () => void
}

export default function QuickReplies({ quickReplies, onSelect, disabled, question, questionNumber, onSkipQuestion, onPauseQuestions, isPaused, onResumeQuestions }: Props) {
  const { multiSelect, allowCustom, options } = quickReplies
  // Safety net: force list for 3+ options regardless of AI's style choice.
  // This is the last line of defence — normalizeQRStyle and ChatPanel should
  // have already converted, but if data somehow arrives uncorrected, catch it here.
  // Cards, sqft, and budget styles are handled upstream by ChatPanel dispatching
  // to dedicated components; if any of them reach this component it's a bug, so
  // we fall through to list.
  const incomingStyle = quickReplies.style
  const style =
    incomingStyle === 'cards' || incomingStyle === 'sqft' || incomingStyle === 'budget'
      ? ('list' as const)
      : incomingStyle !== 'list' && Array.isArray(options) && options.length >= 3
      ? ('list' as const)
      : incomingStyle
  // Show "Type something else..." for list style unless explicitly disabled
  const effectiveAllowCustom = style === 'list' ? (allowCustom !== false) : (allowCustom ?? false)
  const [selected, setSelected] = useState<string[]>([])
  // Auto-expand text input when there are no predefined options (e.g. location question)
  const noOptions = options.length === 0 && effectiveAllowCustom
  const [showCustomInput, setShowCustomInput] = useState(noOptions)
  const [customValue, setCustomValue] = useState('')

  // Sync auto-expand when options change (e.g. new question replaces the previous one)
  useEffect(() => {
    setShowCustomInput(options.length === 0 && effectiveAllowCustom)
  }, [options.length, effectiveAllowCustom])

  function toggleSelected(value: string) {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    )
  }

  function handleSingleSelect(opt: QuickReplyOption) {
    if (disabled) return
    onSelect(opt.value, opt.label)
  }

  function handleMultiConfirm() {
    if (disabled || selected.length === 0) return
    const allValues = showCustomInput && customValue.trim()
      ? [...selected, customValue.trim()]
      : selected
    onSelect(allValues.join(', '))
  }

  function handleCustomSubmit() {
    if (disabled || !customValue.trim()) return
    if (multiSelect) {
      setSelected((prev) => [...prev, customValue.trim()])
      setShowCustomInput(false)
      setCustomValue('')
    } else {
      onSelect(customValue.trim())
    }
  }

  const allOptions: (QuickReplyOption | 'custom')[] = effectiveAllowCustom
    ? [...options, 'custom']
    : options

  // Number key shortcuts: press 1-4 to select corresponding row (list style only)
  useEffect(() => {
    if (style !== 'list' || disabled) return

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      const num = parseInt(e.key)
      if (!isNaN(num) && num >= 1 && num <= allOptions.length) {
        e.preventDefault()
        const opt = allOptions[num - 1]
        if (opt === 'custom') {
          setShowCustomInput(true)
        } else if (!multiSelect) {
          handleSingleSelect(opt as QuickReplyOption)
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [style, disabled, allOptions, multiSelect]) // eslint-disable-line react-hooks/exhaustive-deps

  if (style === 'pills') {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((opt) => {
          const isChecked = selected.includes(opt.value)
          return (
            <button
              key={opt.value}
              onClick={() => multiSelect ? toggleSelected(opt.value) : handleSingleSelect(opt)}
              disabled={disabled}
              className={`px-3 py-1.5 rounded-full border text-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                isChecked
                  ? 'bg-[var(--ov-accent-strong,#7367ff)] text-[var(--ov-bubble-user-text,#1d1d1d)] border-[var(--ov-accent-strong,#7367ff)] font-medium'
                  : 'bg-[var(--ov-surface-subtle,rgba(255,255,255,0.05))] text-[var(--ov-text,#ffffff)] border-[var(--ov-border,rgba(255,255,255,0.10))] hover:border-[var(--ov-accent-border,rgba(115,103,255,0.40))]'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
        {effectiveAllowCustom && !showCustomInput && (
          <button
            onClick={() => setShowCustomInput(true)}
            disabled={disabled}
            className="px-3 py-1.5 rounded-full border border-[var(--ov-border,rgba(255,255,255,0.10))] bg-[var(--ov-surface-subtle,rgba(255,255,255,0.05))] text-[var(--ov-text-muted,#727272)] text-sm hover:border-[var(--ov-accent-border,rgba(115,103,255,0.40))] transition-all cursor-pointer disabled:cursor-not-allowed"
          >
            Other...
          </button>
        )}
        {showCustomInput && (
          <form onSubmit={(e) => { e.preventDefault(); handleCustomSubmit() }} className="w-full flex gap-2 mt-1">
            <input
              autoFocus
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              placeholder="Type your answer..."
              enterKeyHint="send"
              autoComplete="off"
              className="flex-1 bg-[var(--ov-input-bg,rgba(255,255,255,0.05))] border border-[var(--ov-border,rgba(255,255,255,0.10))] rounded-xl px-3 py-2 text-sm text-[var(--ov-text,#ffffff)] placeholder:text-[var(--ov-text-muted,#727272)] outline-none focus:border-brand-purple/50"
            />
            <button
              type="submit"
              disabled={disabled || !customValue.trim()}
              className="px-3 py-2 bg-brand-purple text-white rounded-xl text-sm font-medium disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              Send
            </button>
          </form>
        )}
        {multiSelect && selected.length > 0 && (
          <button
            onClick={handleMultiConfirm}
            disabled={disabled}
            className="w-full mt-2 py-2 bg-brand-purple text-white font-medium rounded-xl text-sm transition-all hover:bg-brand-purple/90 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            Continue →
          </button>
        )}
      </div>
    )
  }

  // style === 'list' — rendered at the bottom of ChatPanel
  // Loading skeleton: question is ready but options are still generating
  // (only show skeleton if no question yet — otherwise it's a fallback card with free-text only)
  if (style === 'list' && options.length === 0) {
    // Fallback card: AI sent a question but no predefined options.
    // Show the question header + only the free-text input row.
    if (question) {
      return (
        <div className="rounded-xl border border-[var(--ov-border,rgba(255,255,255,0.10))] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--ov-border,rgba(255,255,255,0.10))]">
            {questionNumber != null && questionNumber > 0 && (
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--ov-text-muted,#727272)]/50 mb-1">Question {questionNumber}</p>
            )}
            <p className="text-sm text-[var(--ov-text,#ffffff)] leading-relaxed">{question}</p>
          </div>
          <div className="border-t border-[var(--ov-border,rgba(255,255,255,0.10))] first:border-t-0">
            {showCustomInput ? (
              <form onSubmit={(e) => { e.preventDefault(); handleCustomSubmit() }} className="flex gap-2 p-3">
                <input
                  autoFocus
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  placeholder="Type your answer..."
                  enterKeyHint="send"
                  autoComplete="off"
                  className="flex-1 bg-[var(--ov-input-bg,rgba(255,255,255,0.05))] border border-[var(--ov-border,rgba(255,255,255,0.10))] rounded-lg px-3 py-2 text-sm text-[var(--ov-text,#ffffff)] placeholder:text-[var(--ov-text-muted,#727272)] outline-none focus:border-brand-purple/50"
                />
                <button
                  type="submit"
                  disabled={disabled || !customValue.trim()}
                  className="px-3 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  Send
                </button>
              </form>
            ) : (
              <button
                onClick={() => setShowCustomInput(true)}
                disabled={disabled}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--ov-surface-subtle,rgba(255,255,255,0.05))] transition-colors text-left disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                <span className="text-sm text-[var(--ov-text-muted,#727272)]">Type your answer...</span>
              </button>
            )}
          </div>
          {/* Skip CTA */}
          {onSkipQuestion && (
            <div className="px-4 pb-1">
              <button onClick={onSkipQuestion} disabled={disabled} className="px-4 py-2 rounded-full text-sm font-medium border border-[var(--ov-border,rgba(255,255,255,0.12))] text-[var(--ov-text-muted,#a0a0a0)] hover:text-[var(--ov-text,#ffffff)] hover:border-[var(--ov-accent-border,rgba(115,103,255,0.30))] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
                Skip
              </button>
            </div>
          )}
          {/* Pause footer */}
          {(onPauseQuestions || onResumeQuestions) && (
            <div className="flex justify-end px-4 py-2.5 border-t border-[var(--ov-border,rgba(255,255,255,0.06))]">
              <button
                onClick={() => isPaused ? onResumeQuestions?.() : onPauseQuestions?.()}
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
    // No question yet — show loading skeleton
    return (
      <div className="rounded-xl border border-[var(--ov-border,rgba(255,255,255,0.10))] overflow-hidden">
        {[1, 2, 3].map((i) => (
          <div key={i} className="px-4 py-3.5 border-t border-[var(--ov-border,rgba(255,255,255,0.10))] first:border-t-0 animate-pulse">
            <div className="h-4 bg-[var(--ov-surface-subtle,rgba(255,255,255,0.08))] rounded w-2/5 mb-2" />
            <div className="h-3 bg-[var(--ov-surface-subtle,rgba(255,255,255,0.04))] rounded w-3/5" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--ov-border,rgba(255,255,255,0.10))] overflow-hidden">
      {/* Question header */}
      {question && (
        <div className="px-4 py-3 border-b border-[var(--ov-border,rgba(255,255,255,0.10))]">
          {questionNumber != null && questionNumber > 0 && (
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--ov-text-muted,#727272)]/50 mb-1">Question {questionNumber}</p>
          )}
          <p className="text-sm text-[var(--ov-text,#ffffff)] leading-relaxed">{question}</p>
        </div>
      )}

      {allOptions.map((opt, i) => {
        const isCustom = opt === 'custom'
        const value = isCustom ? '' : (opt as QuickReplyOption).value
        const isChecked = !isCustom && selected.includes(value)
        const num = i + 1

        if (isCustom) {
          return (
            <div key="custom" className="border-t border-[var(--ov-border,rgba(255,255,255,0.10))] first:border-t-0">
              {showCustomInput ? (
                <form onSubmit={(e) => { e.preventDefault(); handleCustomSubmit() }} className="flex gap-2 p-3">
                  <input
                    autoFocus
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                    placeholder="Type your answer..."
                    enterKeyHint="send"
                    autoComplete="off"
                    className="flex-1 bg-[var(--ov-input-bg,rgba(255,255,255,0.05))] border border-[var(--ov-border,rgba(255,255,255,0.10))] rounded-lg px-3 py-2 text-sm text-[var(--ov-text,#ffffff)] placeholder:text-[var(--ov-text-muted,#727272)] outline-none focus:border-brand-purple/50"
                  />
                  <button
                    type="submit"
                    disabled={disabled || !customValue.trim()}
                    className="px-3 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    Send
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => setShowCustomInput(true)}
                  disabled={disabled}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--ov-surface-subtle,rgba(255,255,255,0.05))] transition-colors text-left disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  <span className="text-sm text-[var(--ov-text-muted,#727272)]">Type something else...</span>
                  <span className="text-xs text-[var(--ov-text-muted,#727272)] bg-[var(--ov-surface-subtle,rgba(255,255,255,0.10))] rounded-md px-2 py-0.5 font-mono">{num}</span>
                </button>
              )}
            </div>
          )
        }

        const option = opt as QuickReplyOption
        return (
          <button
            key={option.value}
            onClick={() => multiSelect ? toggleSelected(option.value) : handleSingleSelect(option)}
            disabled={disabled}
            className={`w-full flex items-start justify-between px-4 py-3 hover:bg-[var(--ov-surface-subtle,rgba(255,255,255,0.05))] transition-colors text-left border-t border-[var(--ov-border,rgba(255,255,255,0.10))] first:border-t-0 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed ${
              isChecked ? 'bg-[var(--ov-input-bg,rgba(255,255,255,0.10))]' : ''
            }`}
          >
            <div className="flex items-start gap-3 flex-1 min-w-0">
              {multiSelect && (
                <div className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center ${
                  isChecked ? 'bg-[var(--ov-accent-strong,#7367ff)] border-[var(--ov-accent-strong,#7367ff)]' : 'border-[var(--ov-border,rgba(255,255,255,0.30))]'
                }`}>
                  {isChecked && <span className="text-[var(--ov-bubble-user-text,#1d1d1d)] text-[10px] font-bold">✓</span>}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--ov-text,#ffffff)]">
                  {option.label}
                </p>
                {option.description && (
                  <p className="text-xs text-[var(--ov-text-muted,#727272)] mt-0.5 leading-relaxed">{option.description}</p>
                )}
              </div>
            </div>
            <span className="text-xs text-[var(--ov-text-muted,#727272)] bg-[var(--ov-surface-subtle,rgba(255,255,255,0.10))] rounded-md px-2 py-0.5 font-mono ml-3 flex-shrink-0">{num}</span>
          </button>
        )
      })}

      {multiSelect && selected.length > 0 && (
        <div className="border-t border-[var(--ov-border,rgba(255,255,255,0.10))] p-3">
          <button
            onClick={handleMultiConfirm}
            disabled={disabled}
            className="w-full py-2 bg-brand-purple text-white font-medium rounded-xl text-sm transition-all hover:bg-brand-purple/90 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            Continue →
          </button>
        </div>
      )}

      {/* Skip CTA */}
      {onSkipQuestion && (
        <div className="px-4 pb-1">
          <button onClick={onSkipQuestion} disabled={disabled} className="px-4 py-2 rounded-full text-sm font-medium border border-[var(--ov-border,rgba(255,255,255,0.12))] text-[var(--ov-text-muted,#a0a0a0)] hover:text-[var(--ov-text,#ffffff)] hover:border-[var(--ov-accent-border,rgba(115,103,255,0.30))] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
            Skip
          </button>
        </div>
      )}
      {/* Pause footer */}
      {(onPauseQuestions || onResumeQuestions) && (
        <div className="flex justify-end px-4 py-2.5 border-t border-[var(--ov-border,rgba(255,255,255,0.06))]">
          <button
            onClick={() => isPaused ? onResumeQuestions?.() : onPauseQuestions?.()}
            disabled={disabled}
            title={isPaused ? 'Resume Auto-questions' : 'Pause Auto-questions'}
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
