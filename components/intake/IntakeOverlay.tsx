'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CloudCheck, Menu, Minus, X } from 'lucide-react'
import IntakeLayout from './IntakeLayout'
import MinimizedBar from './MinimizedBar'
import SaveForLaterModal from './SaveForLaterModal'
import AddEmailModal from './AddEmailModal'
import ProposalDrawer, { type ProposalSummary, type LeadEmail } from './ProposalDrawer'
import {
  getOrCreateSession,
  getStoredSession,
  storeIdeaForSession,
  storeSession,
  hydrateProposalFromRestore,
  getIdeaForSession,
  clearProposalData,
  validateSession,
  type SessionData,
} from '@/lib/session'
import SessionLoadingScreen from './SessionLoadingScreen'

type Props = {
  initialMessage: string
  onReset?: () => void
  onClose?: () => void
}

export default function IntakeOverlay({ initialMessage, onClose }: Props) {
  const theme = 'dark' as const
  const [session, setSession] = useState<SessionData | null>(null)
  const [sessionError, setSessionError] = useState(false)
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maxAutoRetries = 6 // auto-retry up to 6 times (~30s total)
  // Start mounted=true for returning users so the overlay is opaque on the
  // very first frame (no flash of the homepage behind the transparent overlay).
  // New users (no stored session) get the fade-in animation.
  const [mounted, setMounted] = useState(() => {
    if (typeof window === 'undefined') return false
    try { return !!getStoredSession() } catch { return false }
  })
  const [minimized, setMinimized] = useState(false)
  const [proposalOpen, setProposalOpen] = useState(false)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [liveScopeCount, setLiveScopeCount] = useState(0)
  const [liveConfidenceScore, setLiveConfidenceScore] = useState(0)
  const [emailVerified, setEmailVerified] = useState(false)
  const [currentIdea, setCurrentIdea] = useState(initialMessage)
  // Editable project name — AI-generated initially, user can override. Persisted in localStorage.
  const [appName, setAppName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameInputValue, setNameInputValue] = useState('')
  // Track whether the user has manually edited the name — if so, don't overwrite with AI suggestions
  const nameManuallyEditedRef = useRef(false)
  const [currentSlug, setCurrentSlug] = useState<string | null>(null)
  const cachedEmailRef = useRef<string | null>(null)
  const [showSaved, setShowSaved] = useState(false)
  const lastSyncedAtRef = useRef<number | null>(null)
  const [switchingProposal, setSwitchingProposal] = useState(false)

  // Email management state
  const [leadEmails, setLeadEmails] = useState<LeadEmail[]>([])
  const [addEmailModalOpen, setAddEmailModalOpen] = useState(false)
  const [sendingLink, setSendingLink] = useState(false)

  const updateSlug = useCallback(async (proposalId: string, name: string) => {
    try {
      const res = await fetch(`/api/proposals/${proposalId}/slug`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) return null
      const { slug } = await res.json()
      setCurrentSlug(slug)
      window.history.replaceState(null, '', `/proposal/${slug}`)
      return slug
    } catch {
      return null
    }
  }, [])

  // ── Drawer state ──
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [proposals, setProposals] = useState<ProposalSummary[]>([])
  const [loadingProposals, setLoadingProposals] = useState(false)
  // Track the email we've fetched proposals for — stale-check on drawer open
  const fetchedForProposalRef = useRef<string | null>(null)

  useEffect(() => {
    setMounted(true)
    const timer = setTimeout(() => {
      document.body.style.overflow = 'hidden'
    }, 50)
    return () => {
      clearTimeout(timer)
      document.body.style.overflow = ''
    }
  }, [])

  // Load persisted project name on mount — if present, the user manually set it
  useEffect(() => {
    const saved = localStorage.getItem('cd_project_name')
    if (saved) {
      nameManuallyEditedRef.current = true
      setAppName(saved)
      setNameInputValue(saved)
    }
  }, [])

  function saveAppName() {
    const trimmed = nameInputValue.trim()
    if (!trimmed) {
      // User cleared the name — revert to AI-generated (or blank) and stop tracking manual override
      nameManuallyEditedRef.current = false
      localStorage.removeItem('cd_project_name')
      setEditingName(false)
      return
    }
    nameManuallyEditedRef.current = true
    setAppName(trimmed)
    setNameInputValue(trimmed)
    localStorage.setItem('cd_project_name', trimmed)
    if (session) {
      updateSlug(session.proposalId, trimmed)
    }
    setEditingName(false)
  }

  useEffect(() => {
    if (minimized) {
      document.body.style.overflow = ''
    } else {
      document.body.style.overflow = 'hidden'
    }
  }, [minimized])

  useEffect(() => {
    // Force a new session only when the user just typed a new idea from the
    // homepage (no ?c= in URL yet). If ?c= is present, this is a page reload
    // or email link — restore the existing session.
    const hasExistingParam = new URLSearchParams(window.location.search).has('c')
    const forceNew = !!initialMessage && !hasExistingParam

    async function initSession() {
      const data = await getOrCreateSession(forceNew)

      // Validate the stored session still exists on the server.
      // If the lead was deleted or expired, start fresh.
      if (!forceNew) {
        const isValid = await validateSession(data.proposalId)
        if (!isValid) {
          // Clear stale data and create a new session
          clearProposalData(data.proposalId)
          localStorage.removeItem('cd_session')
          localStorage.removeItem('cd_session_ts')
          localStorage.removeItem('cd_project_name')
          const freshData = await getOrCreateSession(true)
          setSession(freshData)
          if (initialMessage) storeIdeaForSession(freshData.proposalId, initialMessage)
          window.history.replaceState(null, '', `/?c=${freshData.proposalId}`)
          return
        }
      }

      setSession(data)
      if (initialMessage) storeIdeaForSession(data.proposalId, initialMessage)
      window.history.replaceState(null, '', `/?c=${data.proposalId}`)
      if (localStorage.getItem(`cd_email_verified_${data.proposalId}`)) {
        setEmailVerified(true)
      }
    }

    initSession().catch(() => {
      // Auto-retry: schedule the first automatic retry
      retryCountRef.current = 0
      setSessionError(true)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-retry when session error occurs ──
  useEffect(() => {
    if (!sessionError) return
    if (retryCountRef.current >= maxAutoRetries) return // exhausted auto-retries

    const delay = Math.min(2000 * Math.pow(1.5, retryCountRef.current), 10_000) // 2s -> 3s -> 4.5s -> 6.75s -> 10s -> 10s
    retryTimerRef.current = setTimeout(() => {
      retryCountRef.current += 1
      setSessionError(false) // triggers loading screen
      localStorage.removeItem('cd_session')
      localStorage.removeItem('cd_session_ts')
      getOrCreateSession(true)
        .then((data) => {
          setSession(data)
          if (initialMessage) storeIdeaForSession(data.proposalId, initialMessage)
          window.history.replaceState(null, '', `/?c=${data.proposalId}`)
        })
        .catch(() => setSessionError(true)) // will re-trigger this effect
    }, delay)

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [sessionError, initialMessage]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reconnect when user returns to tab after being away ──
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState !== 'visible') return
      // If stuck on error screen, reset retries and try again immediately
      if (sessionError) {
        retryCountRef.current = 0
        handleRetry()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }) // intentionally no deps — always uses latest sessionError

  // ── Fetch proposals for the drawer ──
  const fetchProposals = useCallback(async (proposalId: string) => {
    setLoadingProposals(true)
    try {
      const res = await fetch(`/api/proposals/by-email?proposalId=${proposalId}`)
      if (!res.ok) {
        setProposals([])
        return
      }
      const data = await res.json()
      cachedEmailRef.current = data.email ?? null
      setProposals(data.proposals ?? [])
      fetchedForProposalRef.current = proposalId
    } catch {
      setProposals([])
    } finally {
      setLoadingProposals(false)
    }
  }, [])

  // Fetch verified emails for the current lead
  const fetchLeadEmails = useCallback(async (leadId: string) => {
    try {
      const res = await fetch(`/api/leads/${leadId}/emails`)
      if (!res.ok) { setLeadEmails([]); return }
      const data = await res.json()
      setLeadEmails(data.emails ?? [])
    } catch {
      setLeadEmails([])
    }
  }, [])

  // Auto-fetch proposals and emails when email becomes verified
  useEffect(() => {
    if (emailVerified && session) {
      fetchProposals(session.proposalId)
      fetchLeadEmails(session.proposalId)
    }
  }, [emailVerified, session, fetchProposals, fetchLeadEmails])

  // Refetch when drawer opens and data is stale
  useEffect(() => {
    if (drawerOpen && emailVerified && session && fetchedForProposalRef.current !== session.proposalId) {
      fetchProposals(session.proposalId)
    }
  }, [drawerOpen, emailVerified, session, fetchProposals])

  // ── Switch to a different proposal ──
  const switchToProposal = useCallback(async (targetId: string) => {
    if (!session) return
    setDrawerOpen(false)
    // Show loader immediately — don't stay on old lead
    setSwitchingProposal(true)
    try {
      // Preserve local messages — they have full fidelity (QR, isPause, question fields)
      // that the API restore doesn't carry. Only fall back to API messages if no local data.
      const existingLocalMsgs = localStorage.getItem(`cd_msgs_${targetId}`)
      const existingProposalState = localStorage.getItem(`cd_proposal_${targetId}`)

      const res = await fetch(`/api/proposals/${targetId}/restore`)
      if (!res.ok) throw new Error('Failed to restore')
      const data = await res.json()

      // Hydrate all localStorage keys for the target proposal
      hydrateProposalFromRestore(data)

      // If we had local messages with richer data (QR, isPause, etc.), restore them
      // over the degraded API data
      if (existingLocalMsgs) {
        localStorage.setItem(`cd_msgs_${targetId}`, existingLocalMsgs)
      }
      if (existingProposalState) {
        localStorage.setItem(`cd_proposal_${targetId}`, existingProposalState)
      }

      // Read restored project name
      const meta = data.metadata && typeof data.metadata === 'object' ? data.metadata : {}
      const restoredName = (meta.projectName as string) || ''

      // Update session state — key change on IntakeLayout will cause clean remount
      const newSession: SessionData = {
        sessionId: data.sessionId,
        proposalId: data.proposalId,
        userId: data.userId || session.userId,
      }
      storeSession(newSession)

      // Update URL
      const targetSlug = (data as Record<string, unknown>).slug as string | null
      setCurrentSlug(targetSlug ?? null)
      window.history.replaceState(null, '', targetSlug ? `/proposal/${targetSlug}` : `/?c=${targetId}`)

      // Update project name
      nameManuallyEditedRef.current = false
      setAppName(restoredName)
      setNameInputValue(restoredName)
      if (restoredName) {
        localStorage.setItem('cd_project_name', restoredName)
      } else {
        localStorage.removeItem('cd_project_name')
      }

      // Restore idea
      setCurrentIdea(getIdeaForSession(targetId) || data.brief || '')

      // Check email verified for new lead
      setEmailVerified(!!localStorage.getItem(`cd_email_verified_${targetId}`))

      // Reset confidence and scope count (will be re-populated from localStorage on remount)
      const proposalState = localStorage.getItem(`cd_proposal_${targetId}`)
      if (proposalState) {
        try {
          const parsed = JSON.parse(proposalState)
          setLiveConfidenceScore(parsed.confidenceScore ?? 0)
          setLiveScopeCount(Array.isArray(parsed.detectedScope) ? parsed.detectedScope.length : (Array.isArray(parsed.activeScope) ? parsed.activeScope.length : 0))
        } catch { /* noop */ }
      } else {
        setLiveConfidenceScore(0)
        setLiveScopeCount(0)
      }

      // Close proposal panel if open
      setProposalOpen(false)

      // Trigger remount by updating session
      setSession(newSession)
    } catch (err) {
      console.error('Failed to switch proposal:', err)
    } finally {
      setSwitchingProposal(false)
    }
  }, [session])

  // ── Create a new lead ──
  const handleNewProposal = useCallback(async () => {
    if (!session) return

    // Instant UI reset — synchronous, before any await
    setDrawerOpen(false)
    setAppName('')
    setNameInputValue('')
    setLiveConfidenceScore(0)
    setLiveScopeCount(0)
    setCurrentIdea('')
    setProposalOpen(false)
    setCurrentSlug(null)
    nameManuallyEditedRef.current = false
    localStorage.removeItem('cd_project_name')

    // Temporary session — triggers immediate remount with blank chat
    const tempId = crypto.randomUUID()
    const tempSession: SessionData = { proposalId: tempId, sessionId: tempId, userId: '' }
    window.history.replaceState(null, '', '/?c=' + tempId)
    setSession(tempSession)

    // Real session creation in background
    try {
      const email = cachedEmailRef.current || undefined
      const res = await fetch('/api/intake/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(email ? { email } : {}),
      })
      if (!res.ok) throw new Error('Failed to create session')
      const newSessionData: SessionData = await res.json()
      storeSession(newSessionData)

      if (email) {
        localStorage.setItem(`cd_email_verified_${newSessionData.proposalId}`, '1')
        setEmailVerified(true)
      }

      // Swap temp -> real (move any localStorage data the hook may have stored under tempId)
      const tempMsgs = localStorage.getItem(`cd_msgs_${tempId}`)
      if (tempMsgs) {
        localStorage.setItem(`cd_msgs_${newSessionData.proposalId}`, tempMsgs)
        localStorage.removeItem(`cd_msgs_${tempId}`)
      }
      const tempProposal = localStorage.getItem(`cd_proposal_${tempId}`)
      if (tempProposal) {
        localStorage.setItem(`cd_proposal_${newSessionData.proposalId}`, tempProposal)
        localStorage.removeItem(`cd_proposal_${tempId}`)
      }

      window.history.replaceState(null, '', '/?c=' + newSessionData.proposalId)
      setCurrentSlug(null)
      setSession(newSessionData)

      if (email) {
        fetchProposals(newSessionData.proposalId)
      }
    } catch (err) {
      console.error('Failed to create new lead:', err)
    }
  }, [session, fetchProposals])

  // ── Delete a proposal ──
  const handleDeleteProposal = useCallback(async (targetId: string) => {
    if (!session) return
    try {
      const res = await fetch(`/api/proposals/${targetId}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId }),
      })
      if (!res.ok) throw new Error('Delete failed')

      // Remove from local state
      setProposals(prev => prev.filter(p => p.id !== targetId))
      // Clear localStorage for deleted lead
      clearProposalData(targetId)

      // If we deleted the current lead, switch to first remaining or create new
      if (targetId === session.proposalId) {
        const remaining = proposals.filter(p => p.id !== targetId)
        if (remaining.length > 0) {
          switchToProposal(remaining[0].id)
        } else {
          handleNewProposal()
        }
      }
    } catch (err) {
      console.error('Failed to delete lead:', err)
    }
  }, [session, proposals, switchToProposal, handleNewProposal])

  const handleStateChange = useCallback((m: number, c: number, pName?: string, syncedAt?: number | null) => {
    setLiveScopeCount(m)
    setLiveConfidenceScore(c)
    // Auto-update the project name with the AI-generated project name —
    // but only if the user hasn't manually set their own name
    if (pName && pName.trim() && !nameManuallyEditedRef.current) {
      setAppName(pName.trim())
      setNameInputValue(pName.trim())
      // Generate/update slug when AI provides a project name
      if (session) {
        updateSlug(session.proposalId, pName.trim())
      }
    }
    if (syncedAt && syncedAt !== lastSyncedAtRef.current) {
      lastSyncedAtRef.current = syncedAt
      setShowSaved(true)
    }
  }, [session, updateSlug])

  useEffect(() => {
    if (!showSaved) return
    const timer = setTimeout(() => setShowSaved(false), 2500)
    return () => clearTimeout(timer)
  }, [showSaved])

  const resetRef = useRef<(() => void) | null>(null)

  function doReset() {
    if (session) {
      localStorage.removeItem(`cd_idea_${session.proposalId}`)
      localStorage.removeItem(`cd_msgs_${session.proposalId}`)
      localStorage.removeItem(`cd_proposal_${session.proposalId}`)
    }
    localStorage.removeItem('cd_session')
    window.location.href = '/'
  }

  function handleRetry() {
    // Reset auto-retry counter so manual click gets a fresh set of retries
    retryCountRef.current = 0
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    setSessionError(false)
    // Clear stale session data so we don't restore a broken/expired session
    localStorage.removeItem('cd_session')
    localStorage.removeItem('cd_session_ts')
    getOrCreateSession(true)
      .then((data) => {
        setSession(data)
        if (initialMessage) storeIdeaForSession(data.proposalId, initialMessage)
        window.history.replaceState(null, '', `/?c=${data.proposalId}`)
      })
      .catch(() => setSessionError(true))
  }

  // Only show X (close) when there's truly no work — no idea AND no stored messages
  const hasStoredMessages = session ? !!localStorage.getItem(`cd_msgs_${session.proposalId}`) : false
  const isBlank = currentIdea === '' && !hasStoredMessages

  function handleCloseOrMinimize() {
    if (isBlank) {
      // Clear URL when closing a blank overlay
      window.history.replaceState(null, '', '/')
      onClose?.()
    } else {
      setMinimized(true)
      // Reset URL to "/" so the address bar shows the homepage
      window.history.replaceState(null, '', '/')
    }
  }

  // ── Handle save modal close -> re-check email verified ──
  function handleSaveModalClose() {
    setSaveModalOpen(false)
    if (session && localStorage.getItem(`cd_email_verified_${session.proposalId}`)) {
      setEmailVerified(true)
    }
  }

  // ── Email management handlers ──
  async function handleRemoveEmail(emailId: string) {
    if (!session) return
    try {
      const res = await fetch(`/api/leads/${session.proposalId}/emails/${emailId}`, { method: 'DELETE' })
      if (res.ok) fetchLeadEmails(session.proposalId)
    } catch (e) {
      console.error('Remove email error:', e)
    }
  }

  async function handleSetPrimary(emailId: string) {
    if (!session) return
    try {
      const res = await fetch(`/api/leads/${session.proposalId}/emails/${emailId}`, { method: 'PATCH' })
      if (res.ok) fetchLeadEmails(session.proposalId)
    } catch (e) {
      console.error('Set primary error:', e)
    }
  }

  async function handleSendLink(emails: string[]) {
    if (!session || emails.length === 0) return
    setSendingLink(true)
    try {
      await fetch(`/api/leads/${session.proposalId}/emails/send-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      })
    } catch (e) {
      console.error('Send link error:', e)
    } finally {
      setSendingLink(false)
    }
  }

  return (
    <>
      {/* MinimizedBar — always rendered when minimized */}
      {minimized && (
        <MinimizedBar
          appName={appName}
          confidenceScore={liveConfidenceScore}
          onExpand={() => {
            setMinimized(false)
            // Restore the proposal URL when expanding back
            if (currentSlug) {
              window.history.replaceState(null, '', `/proposal/${currentSlug}`)
            }
          }}
        />
      )}

      {/* Loading / error states — only shown when not minimized and session not ready */}
      {!minimized && sessionError && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 bg-brand-dark ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          <div className="text-center space-y-4">
            {retryCountRef.current < maxAutoRetries ? (
              <>
                <div className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-[var(--ov-text,#ffffff)]" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-[var(--ov-text,#ffffff)]">Reconnecting…</p>
                </div>
              </>
            ) : (
              <>
                <p className="text-[var(--ov-text,#ffffff)]">Couldn&apos;t connect. Check your connection and try again.</p>
                <button
                  onClick={handleRetry}
                  className="px-4 py-2 bg-brand-purple text-white text-sm font-medium rounded-lg hover:bg-brand-purple/90 transition-colors cursor-pointer"
                >
                  Try again
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {!minimized && !session && !sessionError && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 bg-brand-dark ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          <SessionLoadingScreen idea={initialMessage} />
        </div>
      )}

      {/* Full overlay — always mounted once session is ready, hidden via CSS when minimized */}
      {session && (
        <div className={`fixed inset-0 z-50 flex flex-col transition-opacity duration-300 bg-brand-dark ${mounted ? 'opacity-100' : 'opacity-0'} ${minimized ? 'hidden' : ''}`}>
          {/* Top bar */}
          <div className={`flex items-center justify-between px-4 py-3 border-b flex-shrink-0 border-white/5`}>

            {/* Left: Hamburger + Project name */}
            <div className="flex items-center gap-2">
              {/* Hamburger / drawer toggle */}
              <button
                onClick={() => setDrawerOpen(true)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer
                  hover:bg-white/10 text-[var(--ov-text-muted,#7a7a7a)] hover:text-[var(--ov-text,#f0f0f0)]`}
                aria-label="Open proposals drawer"
              >
                <Menu className="w-4 h-4" />
              </button>

              {/* Project name — editable in place on click */}
              {editingName ? (
                <input
                  autoFocus
                  value={nameInputValue}
                  onChange={(e) => setNameInputValue(e.target.value)}
                  onBlur={saveAppName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveAppName()
                    if (e.key === 'Escape') { setNameInputValue(appName); setEditingName(false) }
                  }}
                  maxLength={20}
                  className="font-heading font-bold text-xl tracking-widest text-[var(--ov-text,#ffffff)] bg-transparent border-b border-[var(--ov-accent-border,rgba(115,103,255,0.50))] outline-none uppercase w-36"
                />
              ) : (
                <button
                  onClick={() => { setNameInputValue(appName); setEditingName(true) }}
                  className={`font-heading font-bold text-xl tracking-widest cursor-pointer group flex items-center gap-1.5 transition-all
                    ${appName
                      ? 'text-[var(--ov-text,#ffffff)] hover:opacity-75'
                      : 'text-[var(--ov-text-muted,#727272)] border-b border-dashed border-[var(--ov-text-muted,rgba(114,114,114,0.4))] pb-0.5'
                    }`}
                  title="Click to rename"
                >
                  {appName ? appName.toUpperCase() : 'UNTITLED PROJECT'}
                  <span className={`transition-opacity text-[10px] text-[var(--ov-text-muted,#727272)] font-sans tracking-normal normal-case leading-none
                    ${appName ? 'opacity-0 group-hover:opacity-100' : 'opacity-60'}`}>✎</span>
                </button>
              )}
              {emailVerified && (
                <span
                  className={`ml-2 flex items-center transition-colors duration-300 relative group/cloud
                    ${showSaved ? 'text-green-500' : 'text-[var(--ov-text-muted,#727272)]'}`}
                  title="Auto-saved"
                >
                  <CloudCheck className="w-4 h-4" />
                  <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-1 rounded text-[10px] whitespace-nowrap opacity-0 group-hover/cloud:opacity-100 transition-opacity pointer-events-none bg-[#333] text-white">
                    Auto-saved
                  </span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Save for later — hidden on mobile (available in drawer), hidden when email verified or proposal panel open */}
              {!proposalOpen && !emailVerified && (
                <button
                  type="button"
                  className="hidden md:block text-xs text-[var(--ov-text-muted,#727272)] hover:text-[var(--ov-text,#ffffff)] transition-colors cursor-pointer px-2 py-1.5"
                  title="Save for later"
                  onClick={() => setSaveModalOpen(true)}
                >
                  Save for later
                </button>
              )}

              {/* View / Hide Proposal button — desktop only, mobile uses bottom drawer */}
              <button
                onClick={() => setProposalOpen(p => !p)}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border border-[var(--ov-border,rgba(255,255,255,0.10))] hover:border-[var(--ov-text-muted,rgba(255,255,255,0.20))] bg-transparent text-[var(--ov-text,#ffffff)]"
              >
                {proposalOpen ? (
                  'Hide proposal'
                ) : (
                  <>View Proposal <span className="text-brand-purple">{liveConfidenceScore}%</span></>
                )}
              </button>

              <button
                onClick={handleCloseOrMinimize}
                className="w-8 h-8 rounded-lg bg-[var(--ov-surface-subtle,rgba(255,255,255,0.05))] hover:bg-[var(--ov-input-bg,rgba(255,255,255,0.10))] flex items-center justify-center text-[var(--ov-text-muted,#727272)] hover:text-[var(--ov-text,#ffffff)] transition-colors cursor-pointer"
                aria-label={isBlank ? 'Close' : 'Minimize'}
              >
                {isBlank ? <X className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Loading overlay when switching proposals */}
          {switchingProposal && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-[var(--ov-bg,#1d1d1d)]/80 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <div className="w-6 h-6 border-2 border-[var(--ov-text-muted,#727272)] border-t-[var(--ov-accent-strong,#7367ff)] rounded-full animate-spin" />
                <span className="text-xs text-[var(--ov-text-muted,#727272)]">Loading lead…</span>
              </div>
            </div>
          )}

          {/* Main content — key change forces clean remount when switching proposals */}
          <IntakeLayout
            key={session.proposalId}
            proposalId={session.proposalId}
            initialMessage={currentIdea}
            onStateChange={handleStateChange}
            onResetRef={resetRef}
            onReset={doReset}
            theme={theme}
            proposalOpen={proposalOpen}
            onProposalToggle={() => setProposalOpen(p => !p)}
            onSaveLater={() => setSaveModalOpen(true)}
            emailVerified={emailVerified}
          />

          {/* Proposal Drawer */}
          <ProposalDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            emailVerified={emailVerified}
            currentProposalId={session.proposalId}
            currentAppName={appName}
            currentConfidence={liveConfidenceScore}
            proposals={proposals}
            loading={loadingProposals}
            onSwitchProposal={switchToProposal}
            onNewProposal={handleNewProposal}
            onDeleteProposal={handleDeleteProposal}
            onSaveEmail={() => {
              setDrawerOpen(false)
              setSaveModalOpen(true)
            }}
            theme={theme}
            leadEmails={leadEmails}
            onAddEmail={() => {
              setDrawerOpen(false)
              setAddEmailModalOpen(true)
            }}
            onRemoveEmail={handleRemoveEmail}
            onSetPrimary={handleSetPrimary}
            onSendLink={handleSendLink}
            sendingLink={sendingLink}
          />
        </div>
      )}

      {saveModalOpen && session && (
        <SaveForLaterModal
          proposalId={session.proposalId}
          sessionId={session.sessionId}
          projectName={appName || undefined}
          onClose={handleSaveModalClose}
        />
      )}

      {addEmailModalOpen && session && (
        <AddEmailModal
          leadId={session.proposalId}
          onClose={() => setAddEmailModalOpen(false)}
          onEmailAdded={() => {
            fetchLeadEmails(session.proposalId)
          }}
        />
      )}
    </>
  )
}
