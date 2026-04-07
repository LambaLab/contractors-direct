'use client'

import { useState, useEffect } from 'react'
import HeroInput from './HeroInput'
import IntakeOverlay from '@/components/intake/IntakeOverlay'
import RestoreGateModal from './RestoreGateModal'
import { getStoredSession, getIdeaForSession, hydrateProposalFromRestore as hydrateLeadFromRestore } from '@/lib/session'

type RestoreData = {
  leadId: string
  sessionId: string
  email?: string | null
  brief?: string
  messages?: { role: string; content: string }[]
  [key: string]: unknown
}

// Check localStorage synchronously during initial render so returning users
// never see a flash of the homepage before the chat overlay appears.
function getInitialState(): { open: boolean; message: string } {
  if (typeof window === 'undefined') return { open: false, message: '' }
  try {
    const params = new URLSearchParams(window.location.search)
    const c = params.get('c')
    if (c) {
      const storedSession = getStoredSession()
      const idea = storedSession?.proposalId === c ? getIdeaForSession(c) : null
      if (idea) return { open: true, message: idea }
      // Cross-device restore handled in useEffect (needs async fetch)
      return { open: false, message: '' }
    }
    // Only auto-restore if the user isn't landing on the bare root URL.
    // If someone pastes "/" in a new tab, they expect the landing page —
    // not an automatic jump back into a previous conversation.
    // Auto-restore is still triggered via ?c= links (handled above).
  } catch { /* SSR or localStorage error — fall through */ }
  return { open: false, message: '' }
}

type HeroProps = {
  onIntakeChange?: () => void
  onIntakeClose?: () => void
}

export default function HeroSection({ onIntakeChange, onIntakeClose }: HeroProps) {
  const initial = getInitialState()
  const [intakeOpen, setIntakeOpen] = useState(initial.open)
  const [initialMessage, setInitialMessage] = useState(initial.message)
  const [heroInputResetKey, setHeroInputResetKey] = useState(0)
  // Restore gate: holds the restore data while waiting for email verification
  const [restoreGate, setRestoreGate] = useState<RestoreData | null>(null)

  // Remove the anti-flash class once React has hydrated — the overlay (if open)
  // covers everything via its own fixed positioning, so the CSS hack is no longer needed.
  useEffect(() => {
    document.documentElement.classList.remove('has-session')
  }, [])

  // Handle cross-device restore (async fetch) — same-device restore is handled
  // synchronously above in getInitialState so there's no flash.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const c = params.get('c')
    const token = params.get('t')
    if (!c) return // Same-device already handled in getInitialState

    // If already open (same-device match found synchronously), skip fetch
    if (intakeOpen) return

    // If there's an auth token (user clicked link from email), try auto-auth
    if (token) {
      fetch('/api/auth/verify-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, leadId: c }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.verified) {
            // Auto-authenticate: skip OTP gate entirely
            // Strip the token from URL so it can't be reused from address bar
            window.history.replaceState(null, '', `/?c=${c}`)
            handleLeadRestoreSuccess(data)
            return
          }
          // Token invalid/expired — fall through to normal restore flow
          fetchRestore(c)
        })
        .catch(() => fetchRestore(c))
      return
    }

    // No token — normal cross-device restore (will show OTP gate if email exists)
    fetchRestore(c)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function fetchRestore(leadId: string) {
    fetch(`/api/leads/${leadId}/restore`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) {
          setRestoreGate({ leadId, sessionId: '' })
          return
        }
        setRestoreGate(data)
      })
      .catch(() => {
        setRestoreGate({ leadId, sessionId: '' })
      })
  }

  function handleFirstMessage(message: string) {
    setInitialMessage(message)
    setIntakeOpen(true)
    onIntakeChange?.()
  }

  function handleReset() {
    setInitialMessage('')
    setHeroInputResetKey((k) => k + 1)
  }

  function handleClose() {
    setIntakeOpen(false)
    setInitialMessage('')
    setHeroInputResetKey((k) => k + 1)
    // Reset URL to bare "/" so the address bar doesn't keep showing the lead slug
    window.history.replaceState(null, '', '/')
    onIntakeClose?.()
  }

  // Called after email/OTP verification succeeds — hydrate and open
  function handleLeadRestoreSuccess(data: RestoreData) {
    // Map leadId -> proposalId for the hydrate function
    const { leadId, ...rest } = data
    hydrateLeadFromRestore({ proposalId: leadId, ...rest })
    setInitialMessage(data.brief || data.messages?.[0]?.content || '')
    setRestoreGate(null)
    setIntakeOpen(true)
    onIntakeChange?.()
  }

  // Called when user clicks "Start new project" from the gate modal
  function handleStartNew() {
    setRestoreGate(null)
    // Clear the ?c= param from URL
    window.history.replaceState(null, '', '/')
  }

  return (
    <>
      {/* IntakeOverlay renders on top via fixed positioning */}
      {intakeOpen && (
        <IntakeOverlay
          initialMessage={initialMessage}
          onReset={handleReset}
          onClose={handleClose}
        />
      )}

      <section className="min-h-screen flex flex-col items-center justify-center px-4 py-20 relative">
        {/* Background grid */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,252,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,252,0,0.03)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />

        <div className="relative z-10 text-center max-w-4xl mx-auto space-y-8">
          <div className="inline-flex items-center gap-2 bg-brand-yellow/10 border border-brand-yellow/20 rounded-full px-4 py-1.5 text-sm text-brand-yellow font-medium">
            <span className="w-2 h-2 bg-brand-yellow rounded-full animate-pulse" />
            AI-powered renovation estimation
          </div>

          <h1 className="font-bebas text-6xl sm:text-7xl md:text-8xl lg:text-9xl leading-none tracking-wide text-brand-white">
            TRANSFORM
            <br />
            <span className="text-brand-yellow">YOUR HOME</span>
          </h1>

          <p className="text-brand-gray-mid text-lg sm:text-xl max-w-xl mx-auto font-inter">
            Describe your renovation. Our AI breaks it down into scope items,
            estimates the cost, and delivers a real quote — in minutes.
          </p>

          <HeroInput key={heroInputResetKey} onFirstMessage={handleFirstMessage} />
        </div>
      </section>

      {/* Restore gate modal — shown when opening a shared link on a new device */}
      {restoreGate && (
        <RestoreGateModal
          restoreData={restoreGate}
          onRestoreSuccess={handleLeadRestoreSuccess}
          onStartNew={handleStartNew}
        />
      )}

    </>
  )
}
