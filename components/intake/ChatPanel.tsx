'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { ArrowRight, ArrowDown, Pause, Play } from 'lucide-react'
import MessageBubble from './MessageBubble'
import ScopeProgressCard from './ScopeProgressCard'
import PauseCheckpoint from './PauseCheckpoint'
import BallparkResultCard from './BallparkResultCard'
import QuickReplies from './QuickReplies'
import CardChoiceCarousel from './CardChoiceCarousel'
import SqftPicker from './SqftPicker'
import BudgetPicker from './BudgetPicker'
import FileUploadWidget from './FileUploadWidget'
import ScopeMultiSelectGrid from './ScopeMultiSelectGrid'
import type { ChatMessage } from '@/hooks/useIntakeChat'
import type { QuickReplies as QuickRepliesType, UploadedFile } from '@/lib/intake-types'

type Props = {
  messages: ChatMessage[]
  isStreaming: boolean
  onSend: (message: string, displayContent?: string, sourceQR?: QuickRepliesType, sourceQuestion?: string) => void
  onEdit?: (messageId: string, newContent: string, displayContent?: string) => void
  onRequestViewProposal?: () => void
  onSaveLater?: () => void
  constrained?: boolean
  theme?: 'dark' | 'light'
  isPaused?: boolean
  pausedQuestion?: string | null
  questionRevealed?: boolean
  onPauseQuestions?: () => void
  onResumeQuestions?: () => void
  onRevealPausedQuestion?: () => void
  onSkipQuestion?: () => void
  confidenceScore?: number
  emailVerified?: boolean
  // Upload widget wiring
  leadId?: string
  sessionId?: string
  onFileUploaded?: (messageId: string, file: UploadedFile) => void
  onFileUploadDone?: (messageId: string) => void
  onFileUploadSkipped?: (messageId: string) => void
  onUpgradeToFull?: () => void
}

export default function ChatPanel({ messages, isStreaming, onSend, onEdit, onRequestViewProposal, onSaveLater, constrained = false, theme, isPaused, pausedQuestion, questionRevealed, onPauseQuestions, onResumeQuestions, onRevealPausedQuestion, onSkipQuestion, confidenceScore = 0, emailVerified, leadId, sessionId, onFileUploaded, onFileUploadDone, onFileUploadSkipped, onUpgradeToFull }: Props) {
  const [input, setInput] = useState('')
  const [reEditingMessageId, setReEditingMessageId] = useState<string | null>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior })
  }, [])

  useEffect(() => {
    scrollToBottom('smooth')
  }, [messages, scrollToBottom])

  // Track scroll position to show/hide scroll-to-bottom button
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    function handleScroll() {
      if (!container) return
      const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
      setShowScrollBtn(distFromBottom > 150)
    }
    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  // After the panel open/close animation completes, snap to bottom so
  // the latest message is always in view regardless of reflow from width change
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToBottom('instant')
    }, 320) // just after the 300ms CSS transition
    return () => clearTimeout(timer)
  }, [constrained, scrollToBottom])

  // Clear re-edit mode when AI starts streaming (edit was confirmed)
  useEffect(() => {
    if (isStreaming) setReEditingMessageId(null)
  }, [isStreaming])

  function handleSubmit() {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return
    setReEditingMessageId(null)
    onSend(trimmed)
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  // Show the bottom QR card for the last assistant message.
  // Four special styles get dedicated components dispatched in the bottom panel:
  //   - 'cards'  → CardChoiceCarousel
  //   - 'sqft'   → SqftPicker
  //   - 'budget' → BudgetPicker
  //   - everything else → list-style QuickReplies
  // Safety net: treat pills with 3+ options as list — normalizeQRStyle should have
  // caught this upstream, but defend at render level too.
  const lastMsg = messages[messages.length - 1]
  const lastQR = lastMsg?.role === 'assistant' && !lastMsg?.isPause && lastMsg.quickReplies && !!lastMsg.content
    ? lastMsg.quickReplies
    : null
  const isCardsQR = lastQR?.style === 'cards'
  const isSqftQR = lastQR?.style === 'sqft'
  const isBudgetQR = lastQR?.style === 'budget'
  const isScopeGridQR = lastQR?.style === 'scope_grid'
  const isCustomPicker = isCardsQR || isSqftQR || isBudgetQR || isScopeGridQR
  const shouldBeList = lastQR && !isCustomPicker && (lastQR.style === 'list' || (Array.isArray(lastQR.options) && lastQR.options.length >= 3))
  const listQR = shouldBeList
    ? { ...lastQR!, style: 'list' as const }
    : isCustomPicker
    ? lastQR
    : null
  const questionText = listQR ? (lastMsg?.question ?? undefined) : undefined

  // Compute question number: count non-pause, non-divider assistant messages after the first one.
  // The first assistant message is the reaction to the user's initial idea (not a numbered
  // question). Each subsequent one represents a Q&A turn. We can't count by m.question
  // because that field gets cleared when the user answers.
  const assistantTurns = messages.filter(m => m.role === 'assistant' && !m.isPause && !m.isScopeStart && !m.isScopeComplete)
  const questionNumber = Math.max(0, assistantTurns.length - 1)

  // Re-editing: user tapped edit on a past row-selection bubble
  const reEditingMsg = reEditingMessageId ? messages.find(m => m.id === reEditingMessageId) : null
  const reEditingQR = reEditingMsg?.sourceQuickReplies ?? null
  const reEditingQuestion = reEditingMsg?.sourceQuestion

  // Active QR at bottom: re-edit takes priority over new question QR.
  // When paused, force to null so the textarea always shows — UNLESS the user
  // tapped the peek card to temporarily reveal the question (questionRevealed).
  const activeQR = (isPaused && !questionRevealed) ? (reEditingQR ?? null) : (reEditingQR ?? listQR)
  const activeQuestion = reEditingQR ? reEditingQuestion : questionText

  return (
    <div className="flex flex-col h-full">
      {/* Messages — scroll container stays full-width always; content div handles centering */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto py-4 scrollbar-hide relative">
        <div
          className="px-6 space-y-4 mx-auto w-full"
          style={{ maxWidth: '760px' }}
        >
          {(() => {
            const visible = messages.filter(m => !m.hidden)
            return visible.map((msg, i) => {
            // isLast must compare against the FILTERED array length, not
            // messages.length — hidden reserved-signal user messages (e.g.
            // __files_share_later__) would otherwise cause isLast to be false
            // for the visually-last message, hiding pause checkpoint CTAs.
            const isLastVisible = i === visible.length - 1
            return (
            (msg.isScopeStart || msg.isScopeComplete) ? (
              <ScopeProgressCard
                key={msg.id}
                message={msg}
                onSend={(val, display) => onSend(val, display)}
                onRequestViewProposal={onRequestViewProposal}
                isLast={isLastVisible}
                isStreaming={isStreaming && isLastVisible}
              />
            ) : msg.isFileUploadPrompt ? (
              leadId && sessionId ? (
                <FileUploadWidget
                  key={msg.id}
                  leadId={leadId}
                  sessionId={sessionId}
                  purpose={msg.uploadPurpose ?? 'floor_plans'}
                  existingFiles={msg.uploadedFiles ?? []}
                  completed={msg.uploadCompleted === true}
                  onFileUploaded={(file) => onFileUploaded?.(msg.id, file)}
                  onDone={() => onFileUploadDone?.(msg.id)}
                  onSkip={() => onFileUploadSkipped?.(msg.id)}
                />
              ) : null
            ) : msg.isBallpark && msg.ballparkRange ? (
              <BallparkResultCard
                key={msg.id}
                range={msg.ballparkRange}
                scopeIds={msg.ballparkScopeIds ?? []}
                propertyType={msg.ballparkPropertyType ?? ''}
                location={msg.ballparkLocation ?? ''}
                sizeSqft={msg.ballparkSizeSqft ?? 0}
                condition={msg.ballparkCondition ?? ''}
                stylePreference={msg.ballparkStylePreference ?? ''}
                onDigDeeper={() => onUpgradeToFull?.()}
                onSaveLater={() => onSaveLater?.()}
                isLast={isLastVisible}
                isStreaming={isStreaming && isLastVisible}
              />
            ) : msg.isPause ? (
              // Hide breather checkpoint while a paused question is temporarily revealed
              questionRevealed ? null : <PauseCheckpoint
                key={msg.id}
                message={msg}
                onSend={(val, display) => onSend(val, display)}
                onRequestViewProposal={onRequestViewProposal}
                onSaveLater={onSaveLater}
                isLast={isLastVisible}
                isStreaming={isStreaming && isLastVisible}
                emailVerified={emailVerified}
              />
            ) : msg.isAutoContinue && msg.role === 'assistant' ? (
              // Auto-continue messages: suppress the bubble text entirely.
              // The question card renders from the bottom panel via the list QR.
              null
            ) : (
              <MessageBubble
                key={msg.id}
                message={msg}
                theme={theme}
                isStreaming={isStreaming && isLastVisible && msg.role === 'assistant'}
                onQuickReply={(value, label) => {
                  // Intercept reserved proposal-action values anywhere they appear.
                  // The AI occasionally generates these in regular turns — never let
                  // them be sent as plain messages; always treat them as UI actions.
                  if (value === '__view_proposal__' || value === '__submit__') {
                    onRequestViewProposal?.()
                    return
                  }
                  onSend(value, label)
                }}
                isLastMessage={isLastVisible}
                onEdit={onEdit}
                onStartRowEdit={setReEditingMessageId}
                isBeingReEdited={msg.id === reEditingMessageId}
              />
            )
            )
            })
          })()}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollBtn && (
        <div className="flex-shrink-0 flex justify-center -mt-5 mb-1 relative z-10">
          <button
            onClick={() => scrollToBottom('smooth')}
            className="w-8 h-8 rounded-full bg-[var(--ov-surface-subtle,rgba(255,255,255,0.10))] border border-[var(--ov-border,rgba(255,255,255,0.10))] flex items-center justify-center text-[var(--ov-text-muted,#727272)] hover:text-[var(--ov-text,#ffffff)] hover:bg-[var(--ov-input-bg,rgba(255,255,255,0.15))] transition-all shadow-lg cursor-pointer"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Bottom area: list rows card (new question OR re-edit) OR regular textarea.
          max-h caps the bottom panel so a tall QR card (e.g. card carousel, long
          list of options) never consumes the whole viewport and pushes the chat
          history off-screen. Inner content scrolls internally if it exceeds the cap. */}
      <div className="flex-shrink-0 px-6 pb-4 max-h-[60vh] overflow-y-auto scrollbar-hide">
        <div
          className="mx-auto w-full"
          style={{ maxWidth: '760px' }}
        >
        {activeQR ? (
          <>
            {reEditingQR && (
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs text-[var(--ov-text-muted,#727272)]">Changing your answer...</span>
                <button
                  onClick={() => setReEditingMessageId(null)}
                  className="text-xs text-brand-gray-mid hover:text-brand-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
            {activeQR.style === 'cards' ? (
              <CardChoiceCarousel
                quickReplies={activeQR}
                onSelect={(value, label) => {
                  if (value === '__view_proposal__' || value === '__submit__') {
                    onRequestViewProposal?.()
                    return
                  }
                  const answerDisplay = label || value
                  if (reEditingQR && reEditingMessageId) {
                    onEdit?.(reEditingMessageId, value, answerDisplay)
                    setReEditingMessageId(null)
                  } else {
                    onSend(value, answerDisplay, activeQR, activeQuestion || undefined)
                  }
                }}
                disabled={isStreaming}
                question={activeQuestion}
                questionNumber={!reEditingQR ? questionNumber : undefined}
                onSkipQuestion={!reEditingQR && confidenceScore >= 40 ? onSkipQuestion : undefined}
                onPauseQuestions={!reEditingQR ? onPauseQuestions : undefined}
                onResumeQuestions={!reEditingQR ? onResumeQuestions : undefined}
                isPaused={isPaused}
              />
            ) : activeQR.style === 'sqft' ? (
              <SqftPicker
                onSelect={(value, label) => {
                  const answerDisplay = label || value
                  if (reEditingQR && reEditingMessageId) {
                    onEdit?.(reEditingMessageId, value, answerDisplay)
                    setReEditingMessageId(null)
                  } else {
                    onSend(value, answerDisplay, activeQR, activeQuestion || undefined)
                  }
                }}
                disabled={isStreaming}
                question={activeQuestion}
                questionNumber={!reEditingQR ? questionNumber : undefined}
                onSkipQuestion={!reEditingQR && confidenceScore >= 40 ? onSkipQuestion : undefined}
                onPauseQuestions={!reEditingQR ? onPauseQuestions : undefined}
                onResumeQuestions={!reEditingQR ? onResumeQuestions : undefined}
                isPaused={isPaused}
              />
            ) : activeQR.style === 'budget' ? (
              <BudgetPicker
                onSelect={(value, label) => {
                  const answerDisplay = label || value
                  if (reEditingQR && reEditingMessageId) {
                    onEdit?.(reEditingMessageId, value, answerDisplay)
                    setReEditingMessageId(null)
                  } else {
                    onSend(value, answerDisplay, activeQR, activeQuestion || undefined)
                  }
                }}
                disabled={isStreaming}
                question={activeQuestion}
                questionNumber={!reEditingQR ? questionNumber : undefined}
                onSkipQuestion={!reEditingQR && confidenceScore >= 40 ? onSkipQuestion : undefined}
                onPauseQuestions={!reEditingQR ? onPauseQuestions : undefined}
                onResumeQuestions={!reEditingQR ? onResumeQuestions : undefined}
                isPaused={isPaused}
              />
            ) : activeQR.style === 'scope_grid' ? (
              <ScopeMultiSelectGrid
                onSubmit={(ids, displayText) => {
                  const value = ids.join(', ')
                  if (reEditingQR && reEditingMessageId) {
                    onEdit?.(reEditingMessageId, value, displayText)
                    setReEditingMessageId(null)
                  } else {
                    onSend(value, displayText, activeQR, activeQuestion || undefined)
                  }
                }}
                isLast={true}
                isStreaming={isStreaming}
                scopeContext={activeQR.scopeContext}
              />
            ) : (
              <QuickReplies
                quickReplies={activeQR}
                onSelect={(value, label) => {
                  // Intercept reserved proposal actions — open the panel instead of sending.
                  if (value === '__view_proposal__' || value === '__submit__') {
                    onRequestViewProposal?.()
                    return
                  }
                  // displayContent is just the answer label — question is shown separately above the bubble
                  const answerDisplay = label || value
                  if (reEditingQR && reEditingMessageId) {
                    // Re-edit: replace the old message and re-run AI
                    onEdit?.(reEditingMessageId, value, answerDisplay)
                    setReEditingMessageId(null)
                  } else {
                    // Normal selection: new user message
                    onSend(value, answerDisplay, activeQR, activeQuestion || undefined)
                  }
                }}
                disabled={isStreaming}
                question={activeQuestion}
                questionNumber={!reEditingQR ? questionNumber : undefined}
                onSkipQuestion={!reEditingQR && confidenceScore >= 40 ? onSkipQuestion : undefined}
                onPauseQuestions={!reEditingQR ? onPauseQuestions : undefined}
                onResumeQuestions={!reEditingQR ? onResumeQuestions : undefined}
                isPaused={isPaused}
              />
            )}
          </>
        ) : (
          <>
            {/* Peek card — paused question sliding from behind the input field */}
            {isPaused && pausedQuestion && onRevealPausedQuestion && (
              <button
                onClick={onRevealPausedQuestion}
                className="w-[calc(100%-16px)] mx-auto block group/peek px-4 py-2.5 rounded-t-xl bg-[var(--ov-surface-subtle,rgba(255,255,255,0.04))] border border-b-0 border-[var(--ov-border,rgba(255,255,255,0.08))] hover:bg-[var(--ov-surface-subtle,rgba(255,255,255,0.08))] transition-colors cursor-pointer text-left"
                aria-label="Answer this question"
              >
                {questionNumber > 0 && (
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--ov-text-muted,#727272)]/50 group-hover/peek:text-[var(--ov-text-muted,#727272)] transition-colors">
                    Question {questionNumber}
                  </span>
                )}
                <span className="text-xs leading-relaxed text-[var(--ov-text-muted,#727272)] group-hover/peek:text-[var(--ov-text,#ffffff)] transition-colors block">
                  {pausedQuestion}
                </span>
              </button>
            )}
            <div className="flex items-center gap-2 bg-[var(--ov-input-bg,rgba(255,255,255,0.05))] border border-[var(--ov-border,rgba(255,255,255,0.10))] rounded-xl p-3 focus-within:border-[var(--ov-focus-ring,rgba(115,103,255,0.30))] transition-colors relative z-[1]">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder={isPaused ? "Ask anything or share your thoughts..." : (messages.length === 0 ? "Describe your renovation project..." : "Tell me more...")}
                rows={1}
                disabled={isStreaming}
                aria-label="Chat input"
                enterKeyHint="send"
                autoComplete="off"
                className="flex-1 bg-transparent text-[var(--ov-text,#ffffff)] placeholder:text-[var(--ov-text-muted,#727272)] resize-none outline-none text-sm leading-relaxed min-h-[20px] max-h-[120px] overflow-y-auto disabled:opacity-50"
              />
              {/* Pause/Play toggle — only visible after conversation has started */}
              {messages.length > 1 && (onPauseQuestions || onResumeQuestions) && (
                <button
                  onClick={() => isPaused ? onResumeQuestions?.() : onPauseQuestions?.()}
                  disabled={isStreaming}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--ov-text-muted,#727272)] hover:text-[var(--ov-accent-strong,#7367ff)] hover:bg-[var(--ov-surface-subtle,rgba(255,255,255,0.08))] transition-all flex-shrink-0 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label={isPaused ? 'Resume Auto-questions' : 'Pause Auto-questions'}
                  title={isPaused ? 'Resume Auto-questions' : 'Pause Auto-questions'}
                >
                  {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
              )}
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || isStreaming}
                className="w-8 h-8 bg-brand-purple rounded-lg flex items-center justify-center disabled:opacity-30 hover:bg-brand-purple/90 transition-all active:scale-95 flex-shrink-0 cursor-pointer disabled:cursor-not-allowed"
                aria-label="Send message"
              >
                <ArrowRight className="w-4 h-4 text-brand-dark" />
              </button>
            </div>
            {/* Paused indicator — shown below input when auto-questions are paused; tappable to resume */}
            {isPaused && messages.length > 1 && (
              <button
                onClick={onResumeQuestions}
                className="w-full flex items-center justify-center gap-1.5 mt-2 cursor-pointer hover:opacity-80 transition-opacity"
                aria-label="Resume auto-questions"
              >
                <Pause className="w-3 h-3 text-[var(--ov-text-muted,#727272)]" />
                <span className="text-xs text-[var(--ov-text-muted,#727272)]">Auto-questions paused</span>
              </button>
            )}
          </>
        )}
        </div>
      </div>
    </div>
  )
}
