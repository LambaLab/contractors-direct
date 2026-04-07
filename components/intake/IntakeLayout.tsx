'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import ChatPanel from './ChatPanel'
import ScopePanel from './ScopePanel'
import MobileBottomDrawer from './MobileBottomDrawer'
import { useIntakeChat } from '@/hooks/useIntakeChat'
import { formatPriceRange, isPricingVisible } from '@/lib/pricing/engine'

type Props = {
  proposalId: string
  initialMessage: string
  onStateChange?: (scopeCount: number, confidenceScore: number, projectName?: string, lastSyncedAt?: number | null) => void
  onResetRef?: React.MutableRefObject<(() => void) | null>
  theme?: 'dark' | 'light'
  proposalOpen: boolean
  onProposalToggle: () => void
  onReset?: () => void
  onSaveLater?: () => void
  emailVerified?: boolean
}

export default function IntakeLayout({ proposalId, initialMessage, onStateChange, onResetRef, theme, proposalOpen, onProposalToggle, onReset, onSaveLater, emailVerified }: Props) {
  const {
    messages,
    detectedScope,
    completedScope,
    confidenceScore,
    priceRange,
    isStreaming,
    sendMessage,
    toggleScope,
    projectOverview,
    editMessage,
    reset,
    scopeSummaries,
    projectName,
    isPaused,
    pausedQuestion,
    questionRevealed,
    pauseQuestions,
    resumeQuestions,
    revealPausedQuestion,
    skipQuestion,
    lastSyncedAt,
    currentScope,
  } = useIntakeChat({ proposalId, idea: initialMessage })

  const [chatWidthPct, setChatWidthPct] = useState(55)
  const isDragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // `chatConstrained` controls the 650px centered layout inside ChatPanel.
  // On open: drop constraint immediately so content fills the sliding container cleanly.
  // On close: restore constraint only AFTER the 300ms slide animation finishes,
  //           so the re-centering never fights the panel transition.
  const [chatConstrained, setChatConstrained] = useState(true)
  const constrainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (constrainTimerRef.current) clearTimeout(constrainTimerRef.current)
    if (proposalOpen) {
      // Opening: keep 650px constraint during the slide so content doesn't expand.
      // Release only after the animation completes — at 55% width the container is
      // wider than 650px on all typical desktops so the snap is barely visible.
      constrainTimerRef.current = setTimeout(() => setChatConstrained(false), 310)
    } else {
      // Closing: re-constrain immediately so content stays 650px while the
      // container expands back to 100% around it. No content expansion visible.
      setChatConstrained(true)
    }
    return () => {
      if (constrainTimerRef.current) clearTimeout(constrainTimerRef.current)
    }
  }, [proposalOpen])

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    document.body.style.userSelect = 'none'

    function onMouseMove(e: MouseEvent) {
      if (!isDragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pct = ((e.clientX - rect.left) / rect.width) * 100
      setChatWidthPct(Math.min(70, Math.max(30, Math.round(pct))))
    }

    function onMouseUp() {
      isDragging.current = false
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  // Ref to programmatically open MobileBottomDrawer
  const mobileDrawerRef = useRef<{ open: () => void }>(null)

  // Opens the proposal panel (used by PauseCheckpoint "Get ballpark estimate" pill)
  const openProposal = useCallback(() => {
    // Desktop: toggle the side panel
    if (!proposalOpen) onProposalToggle()
    // Mobile: open the bottom drawer
    mobileDrawerRef.current?.open()
  }, [proposalOpen, onProposalToggle])

  const onStateChangeRef = useRef(onStateChange)
  useEffect(() => { onStateChangeRef.current = onStateChange })

  useEffect(() => {
    if (onResetRef) onResetRef.current = reset
  }, [reset, onResetRef])

  useEffect(() => {
    onStateChangeRef.current?.(detectedScope.length, confidenceScore, projectName, lastSyncedAt)
  }, [detectedScope.length, confidenceScore, projectName, lastSyncedAt])

  const pricingVisible = isPricingVisible(confidenceScore)

  // aiStarted = true once the AI has responded at least once (confidence > 0)
  const aiStarted = confidenceScore > 0

  const summaryText = pricingVisible
    ? `View proposal · ${formatPriceRange(priceRange)}`
    : `View proposal ${confidenceScore}%`

  return (
    <div className="flex-1 overflow-hidden flex">
      {/* Desktop: animated split layout */}
      <div ref={containerRef} className="hidden md:flex flex-1 overflow-hidden">

        {/* Chat panel — centered when proposal closed, left side when open */}
        <div
          className="overflow-hidden transition-[width] duration-300 ease-in-out"
          style={{ width: proposalOpen ? `${chatWidthPct}%` : '100%' }}
        >
          <ChatPanel
            messages={messages}
            isStreaming={isStreaming}
            onSend={sendMessage}
            onEdit={editMessage}
            onRequestViewProposal={openProposal}
            onSaveLater={onSaveLater}
            constrained={chatConstrained}
            theme={theme}
            isPaused={isPaused}
            pausedQuestion={pausedQuestion}
            questionRevealed={questionRevealed}
            onPauseQuestions={pauseQuestions}
            onResumeQuestions={resumeQuestions}
            onRevealPausedQuestion={revealPausedQuestion}
            onSkipQuestion={skipQuestion}
            confidenceScore={confidenceScore}
            emailVerified={emailVerified}
          />
        </div>

        {/* Draggable divider — only rendered when proposal is open */}
        {proposalOpen && (
          <div
            className="w-1 cursor-col-resize flex-shrink-0 relative bg-[var(--ov-surface-subtle,rgba(255,255,255,0.05))] hover:bg-[var(--ov-accent-border,rgba(115,103,255,0.30))] active:bg-[var(--ov-accent-strong,rgba(115,103,255,0.50))] transition-colors group"
            onMouseDown={handleDividerMouseDown}
          >
            {/* Drag handle: small pill indicator centred on the divider */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-[var(--ov-border,rgba(255,255,255,0.20))] group-hover:bg-[var(--ov-accent-strong,rgba(115,103,255,0.70))] transition-colors pointer-events-none" />
          </div>
        )}

        {/* Proposal panel — slides in/out */}
        <div
          className="overflow-hidden transition-[width,opacity] duration-300 ease-in-out flex-shrink-0"
          style={{
            width: proposalOpen ? `${100 - chatWidthPct}%` : '0%',
            opacity: proposalOpen ? 1 : 0,
          }}
        >
          <ScopePanel
            detectedScope={detectedScope}
            confirmedScope={completedScope}
            confidenceScore={confidenceScore}
            projectOverview={projectOverview}
            proposalId={proposalId}
            onToggle={toggleScope}
            aiStarted={aiStarted}
            theme={theme}
            scopeSummaries={scopeSummaries}
            onReset={onReset}
            onSaveLater={onSaveLater}
            currentScope={currentScope}
          />
        </div>
      </div>

      {/* Mobile: full chat + fixed bottom drawer */}
      <div className="md:hidden flex-1 overflow-hidden flex flex-col">
        {/* pb-14 compensates for the fixed drawer handle height (56px) */}
        <div className="flex-1 overflow-hidden pb-14">
          <ChatPanel
            messages={messages}
            isStreaming={isStreaming}
            onSend={sendMessage}
            onEdit={editMessage}
            onRequestViewProposal={openProposal}
            onSaveLater={onSaveLater}
            theme={theme}
            isPaused={isPaused}
            pausedQuestion={pausedQuestion}
            questionRevealed={questionRevealed}
            onPauseQuestions={pauseQuestions}
            onResumeQuestions={resumeQuestions}
            onRevealPausedQuestion={revealPausedQuestion}
            onSkipQuestion={skipQuestion}
            confidenceScore={confidenceScore}
            emailVerified={emailVerified}
          />
        </div>
        <MobileBottomDrawer
          ref={mobileDrawerRef}
          summary={summaryText}
          detectedScope={detectedScope}
          confirmedScope={completedScope}
          confidenceScore={confidenceScore}
          projectOverview={projectOverview}
          proposalId={proposalId}
          aiStarted={aiStarted}
          onToggle={toggleScope}
          scopeSummaries={scopeSummaries}
          onReset={onReset}
          onSaveLater={onSaveLater}
          currentScope={currentScope}
        />
      </div>
    </div>
  )
}
