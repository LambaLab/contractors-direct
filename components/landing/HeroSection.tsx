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

// Resolve initial state client-side only (after mount) to avoid hydration mismatch.
// Server always renders open=false (hero page). The useEffect below opens the
// overlay immediately on the first frame if a ?c= session is present.
function getInitialState(): { open: boolean; message: string } {
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
  // On mount: check for ?c= param and restore session (same-device or cross-device)
  useEffect(() => {
    document.documentElement.classList.remove('has-session')

    const params = new URLSearchParams(window.location.search)
    const c = params.get('c')
    const token = params.get('t')
    if (!c) return

    // Same-device restore: session already in localStorage
    const storedSession = getStoredSession()
    if (storedSession?.proposalId === c) {
      const idea = getIdeaForSession(c)
      if (idea) setInitialMessage(idea)
      setIntakeOpen(true)
      return
    }

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

      <section className="min-h-screen flex flex-col items-center justify-center px-4 py-20 relative overflow-hidden noise-bg">
        {/* Gradient orbs */}
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-brand-purple/8 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-15%] right-[-5%] w-[500px] h-[500px] rounded-full bg-brand-teal/6 blur-[100px] pointer-events-none" />
        <div className="absolute top-[30%] right-[15%] w-[300px] h-[300px] rounded-full bg-brand-blue/5 blur-[80px] pointer-events-none" />

        {/* Subtle grid */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(115,103,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(115,103,255,0.03)_1px,transparent_1px)] bg-[size:80px_80px] pointer-events-none" />

        <div className="relative z-10 text-center max-w-4xl mx-auto space-y-8">
          <div className="inline-flex items-center gap-2 bg-brand-purple/10 border border-brand-purple/20 rounded-full px-4 py-1.5 text-sm text-brand-purple font-medium">
            <span className="w-2 h-2 bg-brand-purple rounded-full animate-pulse" />
            AI-powered renovation estimation
          </div>

          <h1 className="font-heading font-bold text-5xl sm:text-6xl md:text-7xl lg:text-8xl leading-[0.95] tracking-tight text-brand-white">
            Your renovation,
            <br />
            <span className="brand-gradient-text">intelligently managed.</span>
          </h1>

          <p className="text-brand-gray-light text-lg sm:text-xl max-w-xl mx-auto leading-relaxed">
            Describe your project. Our AI scopes it, estimates the cost,
            and delivers a real quote in minutes.
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
