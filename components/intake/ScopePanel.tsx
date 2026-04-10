'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import ScopeCard from './ScopeCard'
import ConfidenceBar from './ConfidenceBar'
import AuthGateModal from './AuthGateModal'
import { SCOPE_CATALOG } from '@/lib/scope/catalog'

type Props = {
  detectedScope: string[]
  confirmedScope: string[]
  confidenceScore: number
  projectOverview: string
  proposalId: string
  onToggle: (id: string) => void
  aiStarted: boolean
  theme?: 'dark' | 'light'
  scopeSummaries?: { [id: string]: string }
  onReset?: () => void
  onSaveLater?: () => void
  currentScope?: string
}

// Renders project overview text — supports labeled sections and plain paragraphs.
// The AI sometimes outputs literal "\n" sequences instead of actual newline characters
// in JSON string fields — normalize them before splitting.
// Also handles cases where the AI puts all sections in one block separated by single
// newlines instead of double newlines.
function ProjectOverview({ text }: { text: string }) {
  const normalized = text.replace(/\\n/g, '\n')

  // Known section labels the AI uses — split on these even if only single-newline separated
  const sectionLabels = ['What it is', 'Who it\'s for', 'How it works', 'Key features', 'Monetization', 'Why it matters']
  const labelPattern = new RegExp(`(?:^|\\n)(?=${sectionLabels.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'i')

  // First try splitting on label boundaries (handles single-\n between sections)
  let sections: string[]
  if (labelPattern.test(normalized)) {
    // Split before each known label, preserving the label
    const splitRegex = new RegExp(`\\n(?=${sectionLabels.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
    sections = normalized.split(splitRegex).filter(Boolean).map(s => s.trim())
  } else {
    // No known labels — fall back to double-newline splitting
    sections = normalized.split('\n\n').filter(Boolean)
  }

  return (
    <div className="space-y-4">
      {sections.map((para, i) => {
        const labelMatch = para.match(/^([^:\n]{1,30}):\s+([\s\S]+)$/)
        if (labelMatch) {
          return (
            <div key={i}>
              <p className="text-[10px] font-semibold text-[var(--ov-text-muted,#727272)] uppercase tracking-widest mb-1">
                {labelMatch[1]}
              </p>
              <p className="text-sm text-[var(--ov-text,#ffffff)] leading-relaxed">
                {labelMatch[2].trim()}
              </p>
            </div>
          )
        }
        return (
          <p key={i} className="text-sm text-[var(--ov-text,#ffffff)] leading-relaxed">
            {para}
          </p>
        )
      })}
    </div>
  )
}

export default function ScopePanel({
  detectedScope,
  confirmedScope,
  confidenceScore,
  projectOverview,
  proposalId,
  onToggle,
  aiStarted,
  theme,
  scopeSummaries = {},
  onReset,
  onSaveLater,
  currentScope,
}: Props) {
  const [showAuthGate, setShowAuthGate] = useState(false)
  const [projectOpen, setProjectOpen] = useState(true)
  const [scopeOpen, setScopeOpen] = useState(true)
  const [resetConfirm, setResetConfirm] = useState(false)
  const resetConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (resetConfirmTimerRef.current) clearTimeout(resetConfirmTimerRef.current)
    }
  }, [])

  function handleResetClick() {
    if (!resetConfirm) {
      setResetConfirm(true)
      resetConfirmTimerRef.current = setTimeout(() => setResetConfirm(false), 3000)
    }
  }

  function handleResetConfirm() {
    if (resetConfirmTimerRef.current) clearTimeout(resetConfirmTimerRef.current)
    setResetConfirm(false)
    onReset?.()
  }

  function handleResetCancel() {
    if (resetConfirmTimerRef.current) clearTimeout(resetConfirmTimerRef.current)
    setResetConfirm(false)
  }

  return (
    <div className="flex flex-col h-full">

      {/* 1. Estimate Accuracy — always visible at top */}
      <div className="px-4 py-3 border-b border-[var(--ov-border,rgba(255,255,255,0.05))] flex-shrink-0">
        <ConfidenceBar score={confidenceScore} />
      </div>

      {/* Scrollable middle */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">

        {/* 2. Project Overview accordion */}
        <div className="border-b border-[var(--ov-border,rgba(255,255,255,0.05))]">
          <button
            type="button"
            onClick={() => setProjectOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--ov-hover-bg,rgba(255,255,255,0.02))] transition-colors"
          >
            <h2 className="font-heading font-bold text-xs tracking-[0.15em] text-[var(--ov-text-muted,#727272)]">
              PROJECT OVERVIEW
            </h2>
            <ChevronDown
              className={`w-4 h-4 text-[var(--ov-text-muted,#727272)] transition-transform duration-200 ${
                projectOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
          <div
            className="grid transition-[grid-template-rows] duration-300 ease-in-out"
            style={{ gridTemplateRows: projectOpen ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden">
              <div className="px-4 pb-4">
                {projectOverview ? (
                  <ProjectOverview text={projectOverview} />
                ) : (
                  <p className="text-sm text-[var(--ov-text-muted,#727272)]/50 leading-relaxed italic">
                    Your project overview will appear here as we learn more...
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 3. Project Scope accordion */}
        <div>
          <button
            type="button"
            onClick={() => setScopeOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--ov-hover-bg,rgba(255,255,255,0.02))] transition-colors"
          >
            <div className="flex items-center gap-2">
              <h2 className="font-heading font-bold text-xs tracking-[0.15em] text-[var(--ov-text-muted,#727272)]">
                PROJECT SCOPE
              </h2>
              {confirmedScope.length > 0 && (
                <span className="text-[10px] bg-[var(--ov-accent-bg,rgba(115,103,255,0.15))] text-[var(--ov-accent-strong,#7367ff)] px-1.5 py-0.5 rounded-full font-medium">
                  {confirmedScope.length}
                </span>
              )}
            </div>
            <ChevronDown
              className={`w-4 h-4 text-[var(--ov-text-muted,#727272)] transition-transform duration-200 ${
                scopeOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
          <div
            className="grid transition-[grid-template-rows] duration-300 ease-in-out"
            style={{ gridTemplateRows: scopeOpen ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden">
              <div className="px-4 pb-4 space-y-2">
                {/* 1. Confirmed scope items (deep-dive complete) — yellow */}
                {confirmedScope.map((id) => (
                  <ScopeCard
                    key={id}
                    scopeId={id}
                    status="confirmed"
                    detectedScope={detectedScope}
                    onToggle={onToggle}
                    summary={scopeSummaries[id]}
                  />
                ))}

                {/* 2. Currently being discussed — yellow dashed */}
                {currentScope && !confirmedScope.includes(currentScope) && detectedScope.includes(currentScope) && (
                  <ScopeCard
                    key={currentScope}
                    scopeId={currentScope}
                    status="current"
                    detectedScope={detectedScope}
                    onToggle={onToggle}
                    summary={scopeSummaries[currentScope]}
                  />
                )}

                {/* 3. Detected but not yet confirmed or current — grey dashed */}
                {detectedScope
                  .filter((id) => !confirmedScope.includes(id) && id !== currentScope)
                  .map((id) => (
                    <ScopeCard
                      key={id}
                      scopeId={id}
                      status="detected"
                      detectedScope={detectedScope}
                      onToggle={onToggle}
                      summary={scopeSummaries[id]}
                    />
                  ))}

                {/* Divider between detected and remaining catalog */}
                {detectedScope.length > 0 && (
                  <div className="py-2">
                    <div className="h-px bg-[var(--ov-border,rgba(255,255,255,0.05))]" />
                    <p className="text-xs text-[var(--ov-text-muted,#727272)] mt-2 mb-1">
                      Add scope items
                    </p>
                  </div>
                )}

                {/* 3. Remaining catalog (not detected) — grey 50% opacity */}
                {SCOPE_CATALOG
                  .filter((m) => !detectedScope.includes(m.id))
                  .map((m) => (
                    <ScopeCard
                      key={m.id}
                      scopeId={m.id}
                      status="inactive"
                      detectedScope={detectedScope}
                      onToggle={onToggle}
                    />
                  ))}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* 4. Bottom action bar */}
      <div className="flex-shrink-0 border-t border-[var(--ov-border,rgba(255,255,255,0.05))] px-4 py-4 space-y-2">

        {/* Save Proposal — hidden when email is already verified */}
        {!localStorage.getItem(`cd_email_verified_${proposalId}`) && (
          <button
            type="button"
            onClick={onSaveLater}
            className="w-full py-2.5 rounded-xl border border-[var(--ov-border,rgba(255,255,255,0.10))] text-[var(--ov-text,#ffffff)] text-sm font-medium hover:bg-[var(--ov-hover-bg,rgba(255,255,255,0.03))] transition-colors cursor-pointer"
          >
            Save Proposal
          </button>
        )}

        {/* Submit Lead — shown once AI has started */}
        {aiStarted && (
          <button
            type="button"
            onClick={() => setShowAuthGate(true)}
            className="w-full py-2.5 bg-brand-purple text-white font-medium rounded-xl hover:bg-brand-purple/90 transition-all active:scale-[0.98] text-sm cursor-pointer"
          >
            Submit Lead →
          </button>
        )}

        {/* Reset — two-step confirm */}
        <div className="flex items-center justify-center pt-1">
          {resetConfirm ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--ov-text-muted,#727272)]">Start over?</span>
              <button
                type="button"
                onClick={handleResetConfirm}
                className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded-lg hover:bg-[var(--ov-surface-subtle,rgba(255,255,255,0.05))] cursor-pointer"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={handleResetCancel}
                className="text-xs text-[var(--ov-text-muted,#727272)] hover:text-[var(--ov-text,#ffffff)] transition-colors px-2 py-1 rounded-lg hover:bg-[var(--ov-surface-subtle,rgba(255,255,255,0.05))] cursor-pointer"
              >
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleResetClick}
              className="text-xs text-[var(--ov-text-muted,#727272)] hover:text-[var(--ov-text,#ffffff)] transition-colors px-2 py-1 rounded-lg hover:bg-[var(--ov-surface-subtle,rgba(255,255,255,0.05))] cursor-pointer"
            >
              ↺ Reset
            </button>
          )}
        </div>

      </div>

      {showAuthGate && (
        <AuthGateModal
          proposalId={proposalId}
          onClose={() => setShowAuthGate(false)}
          theme={theme}
        />
      )}

    </div>
  )
}
