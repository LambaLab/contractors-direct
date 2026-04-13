const SESSION_KEY = 'cd_session'
const SESSION_TS_KEY = 'cd_session_ts'
/** Sessions older than 7 days are considered stale and auto-cleared. */
const MAX_SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000

export type SessionData = {
  sessionId: string
  proposalId: string
  userId: string
}

function isValidSession(data: unknown): data is SessionData {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as SessionData).sessionId === 'string' &&
    typeof (data as SessionData).proposalId === 'string' &&
    typeof (data as SessionData).userId === 'string'
  )
}

export function getStoredSession(): SessionData | null {
  if (typeof window === 'undefined') return null
  try {
    // Check session age — clear if stale
    const ts = localStorage.getItem(SESSION_TS_KEY)
    if (ts) {
      const age = Date.now() - Number(ts)
      if (age > MAX_SESSION_AGE_MS) {
        // Session too old — clear everything
        const raw = localStorage.getItem(SESSION_KEY)
        if (raw) {
          try {
            const parsed = JSON.parse(raw)
            if (isValidSession(parsed)) {
              clearProposalData(parsed.proposalId)
            }
          } catch { /* ignore */ }
        }
        localStorage.removeItem(SESSION_KEY)
        localStorage.removeItem(SESSION_TS_KEY)
        localStorage.removeItem('cd_project_name')
        return null
      }
    }

    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return isValidSession(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function storeSession(data: SessionData) {
  if (typeof window === 'undefined') return
  localStorage.setItem(SESSION_KEY, JSON.stringify(data))
  localStorage.setItem(SESSION_TS_KEY, String(Date.now()))
}

export function storeIdeaForSession(proposalId: string, idea: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(`cd_idea_${proposalId}`, idea)
}

export function getIdeaForSession(proposalId: string): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(`cd_idea_${proposalId}`)
}

// In-flight guard — prevents concurrent API calls (e.g. React StrictMode double-fire)
let inflightPromise: Promise<SessionData> | null = null

/** Fetch with a timeout (AbortController). Default 15 seconds. */
function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer))
}

// Retry up to 5 attempts with exponential backoff before throwing
async function createNewSession(attempt = 1): Promise<SessionData> {
  try {
    const res = await fetchWithTimeout('/api/intake/session', { method: 'POST' })
    if (!res.ok) {
      if (attempt < 5) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(1.5, attempt - 1)))
        return createNewSession(attempt + 1)
      }
      throw new Error('Failed to create session')
    }
    const data: SessionData = await res.json()
    storeSession(data)
    return data
  } catch (err) {
    // Distinguish abort (timeout) from other errors — both retry
    if (attempt < 5) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(1.5, attempt - 1)))
      return createNewSession(attempt + 1)
    }
    throw err
  }
}

/** Validate a stored session still exists on the server. Returns true if valid. */
export async function validateSession(proposalId: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`/api/proposals/${proposalId}/validate`, { method: 'GET' }, 10_000)
    return res.ok
  } catch {
    // Network error or timeout — assume session might still be valid (offline scenario)
    return true
  }
}

export async function getOrCreateSession(forceNew = false): Promise<SessionData> {
  if (!forceNew) {
    const stored = getStoredSession()
    if (stored) return stored
  }

  // Deduplicate: if a creation request is already in-flight, reuse it
  if (inflightPromise) return inflightPromise

  inflightPromise = createNewSession().finally(() => {
    inflightPromise = null
  })
  return inflightPromise
}

/**
 * Hydrate localStorage with a restore response so useIntakeChat can load it.
 * Used for cross-device restore and session switching.
 */
export function hydrateProposalFromRestore(data: {
  proposalId: string
  sessionId: string
  userId?: string
  brief?: string
  email?: string | null
  scope?: unknown[]
  confidenceScore?: number
  messages?: { role: string; content: string; question?: string; quickReplies?: unknown }[]
  metadata?: Record<string, unknown> | null
}): void {
  if (typeof window === 'undefined') return

  storeSession({
    sessionId: data.sessionId,
    proposalId: data.proposalId,
    userId: data.userId ?? '',
  })
  storeIdeaForSession(data.proposalId, data.brief || '')

  const meta = data.metadata && typeof data.metadata === 'object' ? data.metadata : {} as Record<string, unknown>

  // Extract qualifying fields from metadata (property_type, location, size_sqft, etc.)
  // These are stored at the top level of metadata by sync-messages.
  const qualifyingFields: Record<string, unknown> = {}
  const QF_KEYS = ['property_type', 'location', 'size_sqft', 'condition', 'style_preference',
    'ownership', 'budget_aed_stated', 'has_floor_plans', 'wants_project_management',
    'contractor_quote_count', 'full_scope_notes', 'uploaded_files']
  for (const k of QF_KEYS) {
    if (meta[k] !== undefined && meta[k] !== null && meta[k] !== '') {
      qualifyingFields[k] = meta[k]
    }
  }

  localStorage.setItem(
    `cd_proposal_${data.proposalId}`,
    JSON.stringify({
      detectedScope: Array.isArray(data.scope) ? data.scope : [],
      confidenceScore: typeof data.confidenceScore === 'number' ? data.confidenceScore : 0,
      complexityMultiplier: 1.0,
      projectOverview: meta.projectOverview || '',
      scopeSummaries: meta.scopeSummaries || {},
      projectName: meta.projectName || '',
      brief: data.brief || '',
      ...(Object.keys(qualifyingFields).length > 0 ? { qualifyingFields } : {}),
    })
  )

  if (meta.projectName) {
    localStorage.setItem('cd_project_name', String(meta.projectName))
  }

  // Restore phase state so the conversation resumes from the correct phase.
  // Infer phase from available data if not explicitly stored.
  const hasScope = Array.isArray(data.scope) && data.scope.length > 0
  const hasMessages = Array.isArray(data.messages) && data.messages.length > 0
  const confidence = typeof data.confidenceScore === 'number' ? data.confidenceScore : 0

  if (meta.currentPhase) {
    // Explicit phase state from metadata (if sync-messages saved it)
    localStorage.setItem(`cd_phase_${data.proposalId}`, JSON.stringify({
      currentPhase: meta.currentPhase,
      currentScope: meta.currentScope || '',
      scopeQueue: Array.isArray(meta.scopeQueue) ? meta.scopeQueue : [],
      completedScope: Array.isArray(meta.completedScope) ? meta.completedScope : [],
    }))
  } else if (hasScope && confidence > 30) {
    // Infer: if we have scope + decent confidence, likely in deep_dive or wrap_up
    localStorage.setItem(`cd_phase_${data.proposalId}`, JSON.stringify({
      currentPhase: confidence >= 60 ? 'wrap_up' : 'deep_dive',
      currentScope: '',
      scopeQueue: [],
      completedScope: Array.isArray(data.scope) ? data.scope : [],
    }))
  } else if (hasMessages) {
    // Infer: if we have messages but no scope, likely in discovery
    localStorage.setItem(`cd_phase_${data.proposalId}`, JSON.stringify({
      currentPhase: 'discovery',
      currentScope: '',
      scopeQueue: [],
      completedScope: [],
    }))
  }

  // Restore journey mode
  if (meta.journeyMode) {
    localStorage.setItem(`cd_journey_mode_${data.proposalId}`, String(meta.journeyMode))
  } else if (hasMessages) {
    // Default to 'full' if we have a substantial conversation
    localStorage.setItem(`cd_journey_mode_${data.proposalId}`, 'full')
  }

  // Attach last QR state to the final assistant message so the card renders on restore.
  // Guard: only attach if options are populated — skeleton QR ({ style: 'list', options: [] })
  // can get persisted if the user navigated away mid-stream; attaching it would show an
  // eternal skeleton card with no rows.
  const qr = meta.lastQuickReplies as Record<string, unknown> | undefined
  const qrHasOptions = qr && Array.isArray(qr.options) && qr.options.length > 0
  if (qrHasOptions && Array.isArray(data.messages) && data.messages.length > 0) {
    for (let i = data.messages.length - 1; i >= 0; i--) {
      if (data.messages[i].role === 'assistant') {
        data.messages[i].question = (meta.lastQuestion as string) || undefined
        data.messages[i].quickReplies = meta.lastQuickReplies
        break
      }
    }
  }
  // Only write DB messages to localStorage if there are no richer locally-stored
  // messages already. Local messages have quickReplies, isBallpark, etc. which the
  // DB does not store. Overwriting them with flat DB messages causes data loss on
  // same-device restore when the user has a different active session in cd_session.
  const existingMsgs = localStorage.getItem(`cd_msgs_${data.proposalId}`)
  const existingParsed = existingMsgs ? (() => { try { return JSON.parse(existingMsgs) } catch { return null } })() : null
  const existingIsRicher = Array.isArray(existingParsed) && existingParsed.length >= (data.messages?.length ?? 0)
  if (!existingIsRicher && Array.isArray(data.messages) && data.messages.length > 0) {
    localStorage.setItem(`cd_msgs_${data.proposalId}`, JSON.stringify(data.messages))
  }

  if (data.email) {
    localStorage.setItem(`cd_email_verified_${data.proposalId}`, '1')
  }
  localStorage.setItem(
    `cd_synced_count_${data.proposalId}`,
    String(data.messages?.length ?? 0)
  )
}

/** Remove all localStorage keys for a given proposal. */
export function clearProposalData(proposalId: string): void {
  if (typeof window === 'undefined') return
  const keys = [
    `cd_idea_${proposalId}`,
    `cd_msgs_${proposalId}`,
    `cd_proposal_${proposalId}`,
    `cd_email_verified_${proposalId}`,
    `cd_synced_count_${proposalId}`,
    `cd_paused_${proposalId}`,
    `cd_paused_qr_${proposalId}`,
    // Legacy keys (pre-rename)
    `cd_lead_${proposalId}`,
    `cd_phone_verified_${proposalId}`,
  ]
  keys.forEach((k) => localStorage.removeItem(k))
}
