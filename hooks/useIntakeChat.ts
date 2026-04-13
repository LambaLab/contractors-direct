'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { calculatePriceRange, applyComplexityAdjustment, tightenPriceRange, computeQuickBallpark, type PriceRange } from '@/lib/pricing/engine'
import type { HistoricalPricingStat } from '@/lib/pricing/historical'
import { expandWithDependencies } from '@/lib/scope/dependencies'
import type { QuickReplies, UploadedFile } from '@/lib/intake-types'
import { enrichCardOption } from '@/lib/card-images'
import { getStoredSession } from '@/lib/session'
import { createClient } from '@/lib/supabase/client'

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'admin'
  content: string
  displayContent?: string  // For user bubbles: shown text may differ from content sent to the API
  question?: string        // The question for this turn (shown as rows card header)
  capabilityCards?: string[]
  quickReplies?: QuickReplies
  sourceQuickReplies?: QuickReplies  // For user messages created by row selection: the original QR offered
  sourceQuestion?: string            // The question text that was shown when this row was selected
  isPause?: boolean                  // true = this turn is a conversation checkpoint (breather)
  createdAt?: number                 // Date.now() when the message was created
  // Scope divider fields
  isScopeStart?: boolean             // true = scope-start divider
  isScopeComplete?: boolean          // true = scope-complete divider
  scopeId?: string                   // which scope item this divider is for
  scopePosition?: number             // 1-based position in queue
  scopeTotal?: number                // total scope items in queue
  scopeSummary?: string              // completion summary text
  // Checklist card data (for ScopeProgressCard)
  checklistCompleted?: string[]      // IDs of completed scope items at this point
  checklistCurrent?: string          // ID of scope item currently being probed
  checklistQueue?: string[]          // IDs of remaining scope items in order
  hidden?: boolean                   // true = don't render (e.g. auto-continue messages)
  isAutoContinue?: boolean           // true = auto-continue response (suppress bubble text, show only question card)
  isOverview?: boolean               // true = stage-setting card (all scope items shown, none active yet)
  // File upload widget fields
  isFileUploadPrompt?: boolean       // true = render the inline FileUploadWidget instead of a normal bubble
  uploadPurpose?: 'floor_plans' | 'site_photos'  // which prompt triggered the widget
  uploadedFiles?: UploadedFile[]     // files uploaded via this widget (for restore on reload)
  uploadCompleted?: boolean          // true = user tapped "I'm done" or "Share later"; widget collapses
  // Ballpark result card (quick estimate mode)
  isBallpark?: boolean               // true = render BallparkResultCard instead of normal bubble
  ballparkRange?: { min: number; max: number }
  ballparkScopeIds?: string[]
  ballparkPropertyType?: string
  ballparkLocation?: string
  ballparkSizeSqft?: number
  ballparkCondition?: string
  ballparkStylePreference?: string
  isError?: boolean               // true = this message is an error placeholder (excluded from API history)
}

type UpdateProposalInput = {
  detected_scope: string[]
  confidence_score_delta: number
  complexity_multiplier: number
  updated_brief: string
  follow_up_question: string
  question?: string
  project_overview?: string
  capability_cards?: string[]
  quick_replies?: QuickReplies
  scope_summaries?: { [scopeId: string]: string }
  suggest_pause?: boolean
  suggest_resume?: boolean
  project_name?: string
  // Phase tracking
  journey_mode?: 'quick' | 'full' | ''
  current_phase?: 'triage' | 'quick_discovery' | 'discovery' | 'deep_dive' | 'wrap_up'
  current_scope?: string
  scope_complete?: boolean
  scope_queue?: string[]
  // Core Four (existing)
  property_type?: string
  location?: string
  size_sqft?: number
  condition?: string
  style_preference?: string
  // Daniel-script qualifying fields (new)
  ownership?: 'owned' | 'leased' | ''
  budget_aed_stated?: number
  has_floor_plans?: 'yes' | 'no' | 'unknown' | ''
  wants_project_management?: 'yes' | 'no' | ''
  contractor_quote_count?: number
  full_scope_notes?: string
}

type ApiMessage = { role: 'user' | 'assistant'; content: string }

// Normalize QR style: force list style for 3+ options regardless of what the AI
// specified. Also defaults missing/invalid style to 'list'. This is the definitive
// safety net — the AI (Haiku) sometimes sends pills for 3+ options, or omits the
// style field entirely. Both cases should render as the full card with rows.
//
/**
 * Derive scopeContext from question text so the scope grid shows only
 * relevant items. Runs deterministically instead of relying on the AI model.
 */
function deriveScopeContext(question: string): string {
  const q = question.toLowerCase()
  if (q.includes('kitchen')) return 'kitchen'
  if (q.includes('bathroom') || q.includes('ensuite') || q.includes('powder room')) return 'bathroom'
  if (q.includes('bedroom')) return 'bedroom'
  if (q.includes('living') || q.includes('lounge') || q.includes('majlis')) return 'living'
  if (q.includes('outdoor') || q.includes('garden') || q.includes('terrace') || q.includes('balcon') || q.includes('landscap')) return 'outdoor'
  if (q.includes('office') || q.includes('retail') || q.includes('commercial') || q.includes('warehouse')) return 'office'
  if (q.includes('room') || q.includes('addition') || q.includes('extension') || q.includes('new space')) return 'room_addition'
  return '' // full renovation or unclear — show all items
}

// EXCEPTIONS:
// - 'cards' style is preserved even with 3+ options, because cards are an
//   intentional visual treatment for the whitelisted question types. A cards-style
//   QR must also have imageUrl OR icon on every option, otherwise we fall back to list.
// - 'sqft' and 'budget' styles are preserved regardless of options — the picker
//   components generate their own values and don't need option entries at all.
function normalizeQRStyle(qr: QuickReplies | undefined, question?: string): QuickReplies | undefined {
  if (!qr) return qr
  const hasMultipleOptions = Array.isArray(qr.options) && qr.options.length >= 3
  if (qr.style === 'sqft' || qr.style === 'budget' || qr.style === 'scope_grid') {
    // Force options to an empty array if the AI sent any, since the picker /
    // grid component handles its own content.
    // For scope_grid: derive scopeContext from the question text if the AI didn't set it.
    const patched = { ...qr, options: [] }
    if (qr.style === 'scope_grid' && !qr.scopeContext && question) {
      patched.scopeContext = deriveScopeContext(question)
    }
    return patched
  }
  // Location / area: suppress all QR options — free-text only
  if (question) {
    const qLower = question.toLowerCase()
    if (qLower.includes('which area') || qLower.includes('community') || qLower.includes('location') || qLower.includes('where is')) {
      return undefined
    }
  }
  // Condition options should render as pills, not cards — even if the AI
  // returns style:'cards'. Only apply when the question text confirms this
  // is a condition question (not property type which also uses cards).
  if (question) {
    const qLower = question.toLowerCase()
    const isConditionQuestion = qLower.includes('condition') || qLower.includes('state of the space')
    if (isConditionQuestion) {
      return { ...qr, style: 'pills' as const }
    }
  }

  // Preserve 'cards' style. Enrich options with images from the static map
  // so the AI doesn't need to output imageUrl/imageAlt in the tool JSON.
  if (qr.style === 'cards') {
    const enriched = Array.isArray(qr.options)
      ? qr.options.map((o) => {
          const img = enrichCardOption(o)
          return { ...o, ...img }
        })
      : qr.options
    const usable = Array.isArray(enriched) && enriched.every((o) => !!o.imageUrl || !!o.icon)
    if (usable) return { ...qr, options: enriched }
    return { ...qr, style: 'list' as const }
  }
  // Force list for 3+ options regardless of AI's style choice
  if (hasMultipleOptions && qr.style !== 'list') {
    return { ...qr, style: 'list' }
  }
  // Default missing style
  if (!qr.style) {
    return { ...qr, style: hasMultipleOptions ? 'list' : 'pills' }
  }
  return qr
}

// ── Default card option sets for Haiku fallback ──
// When the AI omits quick_replies or sends empty options for a known question
// type, inject these defaults so the UI always shows rich interactive cards.
const DEFAULT_PROPERTY_TYPE_OPTIONS = [
  { label: 'Villa', value: 'villa', icon: '🏠' },
  { label: 'Apartment', value: 'apartment', icon: '🏢' },
  { label: 'Townhouse', value: 'townhouse', icon: '🏘️' },
  { label: 'Penthouse', value: 'penthouse', icon: '🏙️' },
  { label: 'Office', value: 'office', icon: '💼' },
  { label: 'Retail', value: 'retail', icon: '🛍️' },
  { label: 'Warehouse', value: 'warehouse', icon: '🏭' },
]

const DEFAULT_CONDITION_RESIDENTIAL_OPTIONS = [
  { label: 'New', value: 'new', icon: '✨' },
  { label: 'Needs Refresh', value: 'needs_refresh', icon: '🎨' },
  { label: 'Major Renovation', value: 'major_renovation', icon: '🔨' },
  { label: 'Shell', value: 'shell', icon: '🧱' },
]

const DEFAULT_CONDITION_COMMERCIAL_OPTIONS = [
  { label: 'Fitted', value: 'fitted', icon: '✅' },
  { label: 'Semi-Fitted', value: 'semi_fitted', icon: '🔧' },
  { label: 'Shell & Core', value: 'shell_and_core', icon: '🏗️' },
]

const DEFAULT_OWNERSHIP_OPTIONS = [
  { label: 'Owned', value: 'Owned', icon: '🏠' },
  { label: 'Leased', value: 'Leased', icon: '📋' },
]

/**
 * Auto-detect custom QR styles from question text. Haiku often ignores the
 * style:'sqft' / style:'budget' / style:'cards' instructions and sends
 * style:'list' instead (or omits quick_replies entirely). This function
 * examines the question and overrides the style so the correct picker/carousel
 * renders regardless. When the AI omits options for a known card type, default
 * options are injected so the user always sees rich interactive choices.
 */
function autoDetectQRStyle(qr: QuickReplies | undefined, question: string): QuickReplies | undefined {
  const q = question.toLowerCase()
  // Create a synthetic QR shell when the AI omitted quick_replies entirely,
  // so the detection logic below can still inject the correct style + options.
  const base: QuickReplies = qr ?? { style: 'list' as const, options: [] }
  const hasOptions = Array.isArray(base.options) && base.options.length > 0

  // Sqft picker: question asks about size, square feet, how big
  if (q.includes('square feet') || q.includes('sqft') || (q.includes('how big') && q.includes('space'))) {
    if (base.style !== 'sqft') return { ...base, style: 'sqft' as const, options: [] }
    return base
  }

  // Budget picker: question asks about budget
  if (q.includes('budget') || (q.includes('how much') && (q.includes('mind') || q.includes('spend')))) {
    if (base.style !== 'budget') return { ...base, style: 'budget' as const, options: [] }
    return base
  }

  // Scope grid: question asks about scope areas / what the project covers
  if (q.includes('which areas') || q.includes('full scope') || q.includes('scope you have in mind') || q.includes('project cover')) {
    if (base.style !== 'scope_grid') return { ...base, style: 'scope_grid' as const, options: [], scopeContext: deriveScopeContext(question) }
    // If already scope_grid but missing scopeContext, inject it
    if (!base.scopeContext) return { ...base, scopeContext: deriveScopeContext(question) }
    return base
  }

  // Cards: detect by question text OR by option values matching known card sets.
  // This catches cases where Haiku rephrases the question ("residential or commercial?"
  // instead of "what type of project?").
  const PROPERTY_TYPE_VALUES = new Set(['villa', 'apartment', 'townhouse', 'penthouse', 'office', 'retail', 'warehouse'])
  const CONDITION_VALUES = new Set(['new', 'needs_refresh', 'major_renovation', 'shell', 'fitted', 'semi_fitted', 'shell_and_core'])
  const optionValues = new Set(Array.isArray(base.options) ? base.options.map(o => o.value) : [])

  const hasPropertyTypeOptions = [...optionValues].some(v => PROPERTY_TYPE_VALUES.has(v))
  const hasConditionOptions = [...optionValues].some(v => CONDITION_VALUES.has(v))

  // Property type cards
  if (q.includes('type of project') || q.includes('type of property') || q.includes('what kind of property') || q.includes('residential') || q.includes('commercial') || hasPropertyTypeOptions) {
    const options = hasOptions ? base.options : DEFAULT_PROPERTY_TYPE_OPTIONS
    return { ...base, style: 'cards' as const, options }
  }

  // Condition chips (detect residential vs commercial from question text)
  if (q.includes('current condition') || q.includes('condition of the') || q.includes('state of the space') || hasConditionOptions) {
    if (hasOptions) return { ...base, style: 'pills' as const }
    const isCommercial = q.includes('office') || q.includes('retail') || q.includes('warehouse') || q.includes('commercial') || q.includes('fitted')
    const options = isCommercial ? DEFAULT_CONDITION_COMMERCIAL_OPTIONS : DEFAULT_CONDITION_RESIDENTIAL_OPTIONS
    return { ...base, style: 'pills' as const, options }
  }

  // Location / area: free-text only, no suggested options
  if (q.includes('which area') || q.includes('community') || q.includes('location') || q.includes('where is')) {
    return undefined
  }

  // Ownership pills
  if ((q.includes('owned') && q.includes('leased')) || q.includes('ownership')) {
    if (hasOptions) return { ...base, style: 'pills' as const }
    return { ...base, style: 'pills' as const, options: DEFAULT_OWNERSHIP_OPTIONS }
  }

  // If we created a synthetic shell but no pattern matched, return undefined
  // so callers know no auto-detection was possible.
  if (!qr) return undefined

  // Force list for 3+ options regardless of AI's style choice
  if (hasOptions && base.options.length >= 3 && base.style !== 'list') {
    return { ...base, style: 'list' }
  }
  // Default missing style
  if (!base.style) {
    return { ...base, style: hasOptions && base.options.length >= 3 ? 'list' : 'pills' }
  }
  return base
}

// Merge consecutive same-role messages into one. This is necessary because
// bubble_split creates two assistant messages (reaction + transition_text),
// which are persisted as separate rows in Supabase. The Claude API requires
// strictly alternating user/assistant messages and rejects consecutive same-role.
function mergeConsecutiveMessages(msgs: ApiMessage[]): ApiMessage[] {
  const merged: ApiMessage[] = []
  for (const msg of msgs) {
    const last = merged[merged.length - 1]
    if (last && last.role === msg.role) {
      last.content = last.content + '\n\n' + msg.content
    } else {
      merged.push({ ...msg })
    }
  }
  return merged
}

type Props = {
  proposalId: string
  idea: string
}

const MSGS_KEY = (pid: string) => `cd_msgs_${pid}`
const PROPOSAL_KEY = (pid: string) => `cd_proposal_${pid}`
const EMAIL_VERIFIED_KEY = (pid: string) => `cd_email_verified_${pid}`
const SYNCED_COUNT_KEY   = (pid: string) => `cd_synced_count_${pid}`
const PAUSED_KEY = (pid: string) => `cd_paused_${pid}`
const PAUSED_QR_KEY = (pid: string) => `cd_paused_qr_${pid}`
const PHASE_KEY = (pid: string) => `cd_phase_${pid}`
const JOURNEY_MODE_KEY = (pid: string) => `cd_journey_mode_${pid}`

export function useIntakeChat({ proposalId, idea }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [detectedScope, setDetectedScope] = useState<string[]>([])
  const [confidenceScore, setConfidenceScore] = useState(0)
  const [complexityMultiplier, setComplexityMultiplier] = useState(1.0)
  const [priceRange, setPriceRange] = useState<PriceRange>({ min: 0, max: 0 })
  const [isStreaming, setIsStreaming] = useState(false)
  const [projectOverview, setProjectOverview] = useState('')
  const [scopeSummaries, setScopeSummaries] = useState<{ [scopeId: string]: string }>({})
  const [projectName, setProjectName] = useState('')
  const [isPaused, setIsPaused] = useState(false)
  const [pausedQuestion, setPausedQuestion] = useState<string | null>(null)
  // Journey mode: quick estimate vs full consultation
  const [journeyMode, setJourneyMode] = useState<'' | 'quick' | 'full' | 'upgraded'>('')
  // Phase tracking for conversation flow
  const [currentPhase, setCurrentPhase] = useState<'triage' | 'quick_discovery' | 'discovery' | 'deep_dive' | 'wrap_up'>('triage')
  const [currentScope, setCurrentScope] = useState('')
  const [scopeQueue, setScopeQueue] = useState<string[]>([])
  const [completedScope, setCompletedScope] = useState<string[]>([])
  const prevScopeRef = useRef('')
  const sendMessageRef = useRef<((content: string, displayContent?: string) => void) | null>(null)
  // When true, the paused question's QR card is temporarily revealed (user tapped peek card)
  // This stays true until the user answers, then auto-hides back to paused state
  const [questionRevealed, setQuestionRevealed] = useState(false)
  // Store the stripped QR so we can silently restore it on resume
  const pausedQRRef = useRef<{ question: string; quickReplies: QuickReplies; messageId: string } | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const [isAdminActive, setIsAdminActive] = useState(false)
  const syncInProgressRef = useRef(false)

  const messagesRef = useRef<ChatMessage[]>([])
  const confidenceRef = useRef(0)
  const detectedScopeRef = useRef<string[]>([])
  const complexityRef = useRef(1.0)
  const projectOverviewRef = useRef('')
  const scopeSummariesRef = useRef<{ [scopeId: string]: string }>({})
  const lastPauseTurn = useRef(-999)  // turn index of the last checkpoint (-999 = never)
  const turnCount = useRef(0)         // increments each time a tool_result is processed
  const isPausedRef = useRef(false)
  const journeyModeRef = useRef<'' | 'quick' | 'full' | 'upgraded'>('')
  const currentPhaseRef = useRef<'triage' | 'quick_discovery' | 'discovery' | 'deep_dive' | 'wrap_up'>('triage')
  const currentScopeRef = useRef('')
  const scopeQueueRef = useRef<string[]>([])
  const completedScopeRef = useRef<string[]>([])
  const historicalStatsRef = useRef<HistoricalPricingStat[]>([])
  const streamIdRef = useRef<string>('')  // ID of the currently-active stream; used to prevent
                                          // stale streams from clobbering newer state

  // Picker hints: expose extracted size/budget so pickers can pre-populate.
  // Updated whenever the AI tool_result includes these values.
  const [pickerHints, setPickerHints] = useState<{ size_sqft?: number; budget_aed?: number }>({})

  // Daniel-script qualifying fields: accumulate across the conversation and
  // persist into leads.metadata alongside the existing projectOverview etc.
  const qualifyingFieldsRef = useRef<{
    property_type?: string
    location?: string
    size_sqft?: number
    condition?: string
    style_preference?: string
    ownership?: string
    budget_aed_stated?: number
    has_floor_plans?: string
    wants_project_management?: string
    contractor_quote_count?: number
    full_scope_notes?: string
  }>({})
  // Guard so the file upload widget is only injected once per session.
  const uploadWidgetInjectedRef = useRef(false)

  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { confidenceRef.current = confidenceScore }, [confidenceScore])
  useEffect(() => { detectedScopeRef.current = detectedScope }, [detectedScope])
  useEffect(() => { complexityRef.current = complexityMultiplier }, [complexityMultiplier])
  useEffect(() => { projectOverviewRef.current = projectOverview }, [projectOverview])
  useEffect(() => { scopeSummariesRef.current = scopeSummaries }, [scopeSummaries])
  useEffect(() => { isPausedRef.current = isPaused }, [isPaused])
  useEffect(() => { journeyModeRef.current = journeyMode }, [journeyMode])
  useEffect(() => { currentPhaseRef.current = currentPhase }, [currentPhase])
  useEffect(() => { currentScopeRef.current = currentScope }, [currentScope])
  useEffect(() => { scopeQueueRef.current = scopeQueue }, [scopeQueue])
  useEffect(() => { completedScopeRef.current = completedScope }, [completedScope])

  // Poll for admin chat status (join/leave) and admin messages from DB.
  const adminPollTimestampRef = useRef<string | null>(null)
  const wasAdminActiveRef = useRef(false)
  const joinMsgShownRef = useRef(false)

  useEffect(() => {
    if (!proposalId) return

    async function pollChatStatus() {
      try {
        const afterParam = adminPollTimestampRef.current
          ? `?after=${encodeURIComponent(adminPollTimestampRef.current)}`
          : ''
        const res = await fetch(`/api/intake/chat-status/${proposalId}${afterParam}`)
        if (!res.ok) return
        const data = await res.json() as {
          adminActive: boolean
          messages: { id: string; role: string; content: string; created_at: string }[]
        }

        // Handle admin join/leave transitions (only fire once per transition)
        if (data.adminActive && !wasAdminActiveRef.current) {
          wasAdminActiveRef.current = true
          joinMsgShownRef.current = true
          setIsAdminActive(true)
          setMessages((prev) => [...prev, {
            id: `admin-joined-${Date.now()}`,
            role: 'admin' as const,
            content: '[Admin] has joined the chat',
            createdAt: Date.now(),
          }])
        } else if (!data.adminActive && wasAdminActiveRef.current) {
          wasAdminActiveRef.current = false
          joinMsgShownRef.current = false
          setIsAdminActive(false)
          setMessages((prev) => [...prev, {
            id: `admin-left-${Date.now()}`,
            role: 'admin' as const,
            content: '[Admin] has left the chat. AI assistant resumed.',
            createdAt: Date.now(),
          }])
        }

        // Add any new admin messages (dedup by ID)
        if (data.messages.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id))
            const newMsgs = data.messages.filter((msg) => !existingIds.has(msg.id))
            if (newMsgs.length === 0) return prev
            return [...prev, ...newMsgs.map((msg) => ({
              id: msg.id,
              role: 'admin' as const,
              content: msg.content,
              createdAt: new Date(msg.created_at).getTime(),
            }))]
          })
          const latest = data.messages[data.messages.length - 1]
          if (latest) adminPollTimestampRef.current = latest.created_at
        }
      } catch { /* ignore polling errors */ }
    }

    pollChatStatus()
    const interval = setInterval(pollChatStatus, 2000)

    // Broadcast as bonus for instant poll trigger only (no inline message handling)
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    try {
      channel = supabase.channel(`proposal:${proposalId}`, {
        config: { presence: { key: 'client' } },
      })
      channel
        .on('broadcast', { event: 'admin_status' }, () => pollChatStatus())
        .on('broadcast', { event: 'admin_message' }, () => pollChatStatus())
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel!.track({ user_type: 'client' })
          }
        })
    } catch { /* Realtime not available */ }

    return () => {
      clearInterval(interval)
      if (channel) supabase.removeChannel(channel)
    }
  }, [proposalId])

  // Persist messages to localStorage after every update.
  // Auto-saves messages to localStorage and syncs to Supabase on every completed turn.
  useEffect(() => {
    if (messages.length > 0 && proposalId) {
      // Don't persist the empty welcome bubble — wait for content to arrive
      const hasOnlyEmptyAssistant = messages.length === 1 && messages[0].role === 'assistant' && !messages[0].content
      if (hasOnlyEmptyAssistant) return
      localStorage.setItem(MSGS_KEY(proposalId), JSON.stringify(messages))

      if (!isStreaming && !syncInProgressRef.current) {
        const storedSession = getStoredSession()
        if (storedSession?.sessionId) {
          const syncedCount = parseInt(
            localStorage.getItem(SYNCED_COUNT_KEY(proposalId)) ?? '0',
            10
          )
          const newMessages = messages.slice(syncedCount)
          if (newMessages.length > 0) {
            const newCount = messages.length
            syncInProgressRef.current = true
            // Include lead metadata so Supabase has it for cross-device restore
            let syncBrief: string | undefined
            let syncScope: string[] | undefined
            let syncConfidence: number | undefined
            let syncMetadata: Record<string, unknown> | undefined
            try {
              const p = JSON.parse(localStorage.getItem(PROPOSAL_KEY(proposalId)) ?? '{}')
              if (typeof p.brief === 'string' && p.brief) syncBrief = p.brief
              if (Array.isArray(p.detectedScope)) syncScope = p.detectedScope
              else if (Array.isArray(p.activeScope)) syncScope = p.activeScope
              if (typeof p.confidenceScore === 'number') syncConfidence = p.confidenceScore
              // Rich metadata for full-fidelity restore + Daniel-script qualifying fields
              syncMetadata = {
                ...(typeof p.projectName === 'string' && p.projectName ? { projectName: p.projectName } : {}),
                ...(typeof p.projectOverview === 'string' && p.projectOverview ? { projectOverview: p.projectOverview } : {}),
                ...(p.scopeSummaries && typeof p.scopeSummaries === 'object' ? { scopeSummaries: p.scopeSummaries } : {}),
                ...(p.qualifyingFields && typeof p.qualifyingFields === 'object' ? p.qualifyingFields : {}),
              }
            } catch { /* ignore */ }

            // Capture the last assistant message's QR state for restore.
            // Guard: only save if options are populated — skeleton QR ({ style: 'list', options: [] })
            // from partial_question can still be on the message if the page reloaded mid-stream.
            const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant' && !m.isPause)
            const lastQR = lastAssistant?.quickReplies
            if (lastQR && Array.isArray(lastQR.options) && lastQR.options.length > 0 && syncMetadata) {
              syncMetadata.lastQuestion = lastAssistant.question || undefined
              syncMetadata.lastQuickReplies = lastQR
            }

            fetch('/api/intake/sync-messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                proposalId,
                sessionId: storedSession.sessionId,
                messages: newMessages.filter((m) => m.role !== 'admin' && !m.isError).map((m) => ({ role: m.role, content: m.content })),
                brief: syncBrief,
                scope: syncScope,
                confidenceScore: syncConfidence,
                metadata: syncMetadata,
              }),
            })
              .then((res) => {
                if (res.ok) {
                  localStorage.setItem(SYNCED_COUNT_KEY(proposalId), String(newCount))
                  setLastSyncedAt(Date.now())
                }
              })
              .catch((e) => console.error('Auto-save error:', e))
              .finally(() => { syncInProgressRef.current = false })
          }
        }
      }
    }
  }, [messages, proposalId, isStreaming]) // eslint-disable-line react-hooks/exhaustive-deps

  // NOTE: Proposal state is saved inline (not via a reactive effect) to avoid a
  // mount-order bug: a reactive effect would fire before the restore effect and
  // overwrite the stored data with empty defaults before it could be read back.

  // Auto-send the idea on mount (fires once) — or restore stored messages
  useEffect(() => {
    if (!proposalId) return

    // Check for stored messages first
    const stored = localStorage.getItem(MSGS_KEY(proposalId))
    if (stored) {
      try {
        const parsed: ChatMessage[] = JSON.parse(stored)
        // Strip error placeholder messages so failed turns don't persist across reloads
        const cleaned = parsed.filter(m => !m.isError)
        if (cleaned.length > 0) {
          messagesRef.current = cleaned
          setMessages(cleaned)

          // Also restore proposal state so the panel isn't blank on reload
          const storedProposal = localStorage.getItem(PROPOSAL_KEY(proposalId))
          if (storedProposal) {
            try {
              const p = JSON.parse(storedProposal)
              const scopeItems: string[] = Array.isArray(p.detectedScope) ? p.detectedScope : (Array.isArray(p.activeScope) ? p.activeScope : [])
              const score: number = typeof p.confidenceScore === 'number' ? p.confidenceScore : 0
              const multiplier: number = typeof p.complexityMultiplier === 'number' ? p.complexityMultiplier : 1.0
              detectedScopeRef.current = scopeItems
              confidenceRef.current = score
              complexityRef.current = multiplier
              setDetectedScope(scopeItems)
              setConfidenceScore(score)
              setComplexityMultiplier(multiplier)
              setPriceRange(computePriceRange(scopeItems, multiplier, score))
              if (typeof p.projectOverview === 'string' && p.projectOverview) setProjectOverview(p.projectOverview)
              if (p.scopeSummaries && typeof p.scopeSummaries === 'object') setScopeSummaries(p.scopeSummaries)
              if (typeof p.projectName === 'string' && p.projectName) setProjectName(p.projectName)
            } catch {
              // Ignore — non-critical, proposal panel will just be empty
            }
          }

          // Restore journey mode from localStorage
          const storedJourneyMode = localStorage.getItem(JOURNEY_MODE_KEY(proposalId))
          if (storedJourneyMode) {
            const jm = storedJourneyMode as '' | 'quick' | 'full' | 'upgraded'
            setJourneyMode(jm)
            journeyModeRef.current = jm
          }

          // Restore phase state from localStorage
          const storedPhase = localStorage.getItem(PHASE_KEY(proposalId))
          if (storedPhase) {
            try {
              const ph = JSON.parse(storedPhase)
              if (ph.currentPhase) {
                setCurrentPhase(ph.currentPhase)
                currentPhaseRef.current = ph.currentPhase
              }
              if (typeof ph.currentScope === 'string') {
                setCurrentScope(ph.currentScope)
                currentScopeRef.current = ph.currentScope
                prevScopeRef.current = ph.currentScope
              }
              if (Array.isArray(ph.scopeQueue)) {
                setScopeQueue(ph.scopeQueue)
                scopeQueueRef.current = ph.scopeQueue
              }
              if (Array.isArray(ph.completedScope)) {
                setCompletedScope(ph.completedScope)
                completedScopeRef.current = ph.completedScope
              }
            } catch { /* ignore */ }
          }

          // Restore turnCount and lastPauseTurn from message history so the
          // checkpoint logic doesn't immediately trigger after a page refresh.
          // Each non-pause assistant message roughly corresponds to one tool_result turn.
          let restoredTurnCount = 0
          let restoredLastPauseTurn = -999
          for (const m of parsed) {
            if (m.role === 'assistant' && !m.isPause) restoredTurnCount++
            if (m.isPause) restoredLastPauseTurn = restoredTurnCount
          }
          turnCount.current = restoredTurnCount
          lastPauseTurn.current = restoredLastPauseTurn

          // Rehydrate qualifying fields so the sync-messages metadata stays
          // accurate after page reload.
          try {
            const p = JSON.parse(localStorage.getItem(PROPOSAL_KEY(proposalId)) ?? '{}')
            if (p.qualifyingFields && typeof p.qualifyingFields === 'object') {
              qualifyingFieldsRef.current = p.qualifyingFields
              // Restore picker hints from persisted qualifying fields
              const qf = p.qualifyingFields
              const restored: { size_sqft?: number; budget_aed?: number } = {}
              if (typeof qf.size_sqft === 'number' && qf.size_sqft > 0) restored.size_sqft = qf.size_sqft
              if (typeof qf.budget_aed_stated === 'number' && qf.budget_aed_stated > 0) restored.budget_aed = qf.budget_aed_stated
              if (restored.size_sqft || restored.budget_aed) setPickerHints(restored)
            }
          } catch { /* ignore */ }

          // If the upload widget was previously injected, flip the guard so we
          // don't inject it twice.
          if (parsed.some(m => m.isFileUploadPrompt)) {
            uploadWidgetInjectedRef.current = true
          }

          // Restore paused state
          if (localStorage.getItem(PAUSED_KEY(proposalId)) === 'true') {
            setIsPaused(true)
            isPausedRef.current = true
            // Restore paused question + QR data for the peek card and silent resume
            try {
              const savedQR = localStorage.getItem(PAUSED_QR_KEY(proposalId))
              if (savedQR) {
                const qrData = JSON.parse(savedQR)
                if (qrData.question) setPausedQuestion(qrData.question)
                if (qrData.question && qrData.quickReplies) {
                  pausedQRRef.current = qrData
                }
              }
            } catch { /* ignore */ }
          }

          return // Skip auto-send — conversation already exists
        }
      } catch {
        // Ignore parse errors, fall through to auto-send
      }
    }

    // No stored messages — auto-send the idea or show welcome message
    if (!idea.trim()) {
      // New empty lead — simulate typing then reveal the welcome message
      const welcomeId = crypto.randomUUID()
      const emptyWelcome: ChatMessage = {
        id: welcomeId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
      }
      // Step 1: Show empty bubble with typing indicator
      const t1 = setTimeout(() => {
        messagesRef.current = [emptyWelcome]
        setMessages([emptyWelcome])
        setIsStreaming(true)
      }, 10)
      // Step 2: Fill in the content after a realistic typing delay
      const t2 = setTimeout(() => {
        const welcome: ChatMessage = {
          ...emptyWelcome,
          content: "What would you like to build? Describe your idea in the chat below and I'll help you shape it into a lead.",
        }
        messagesRef.current = [welcome]
        setMessages([welcome])
        setIsStreaming(false)
      }, 1200)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: idea, createdAt: Date.now() }
    messagesRef.current = [userMessage]
    setMessages([userMessage])

    streamAIResponse([{ role: 'user', content: idea }])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function computePriceRange(scopeItems: string[], multiplier: number, score: number): PriceRange {
    // Pass 0 for sizeSqft until we have property details — pricing engine handles flat rates
    const base = calculatePriceRange(scopeItems, 0)
    const adjusted = applyComplexityAdjustment(base, multiplier)
    return tightenPriceRange(adjusted, score)
  }

  // Streams from /api/intake/chat with the given API message history.
  // Adds an empty assistant message first, then fills it in as tokens arrive.
  async function streamAIResponse(apiMessages: ApiMessage[], opts?: { isAutoContinue?: boolean }) {
    const isAutoContinue = opts?.isAutoContinue ?? false
    // Capture a unique ID for this stream invocation so stale streams (still draining
    // after the user submitted a new message) can be identified and their side-effects
    // suppressed without cancelling the HTTP request itself.
    const myStreamId = crypto.randomUUID()
    streamIdRef.current = myStreamId
    setIsStreaming(true)
    const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', isAutoContinue, createdAt: Date.now() }
    // activeBubbleId tracks the ID of the assistant message currently receiving text events.
    // It starts as bubble 1 and is reassigned to bubble 2 when a bubble_split event arrives
    // (i.e. when the AI produces transition_text for a topic pivot). All setMessages guards
    // use this variable so stale streams can never corrupt a different message.
    let activeBubbleId = assistantMessage.id
    let partialResultApplied = false  // tracks if partial_result already built bubbleContent
    setMessages((prev) => [...prev, assistantMessage])

    try {
      const res = await fetch('/api/intake/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          currentScope: detectedScopeRef.current,
          confidenceScore: confidenceRef.current,
          paused: isPausedRef.current,
          journeyMode: journeyModeRef.current,
          currentPhase: currentPhaseRef.current,
          currentScopeItem: currentScopeRef.current,
          scopeQueue: scopeQueueRef.current,
          completedScope: completedScopeRef.current,
          turnCount: turnCount.current,
        }),
      })

      if (!res.ok) {
        // The API returned a non-200 status (400 bad request, 500 server error, etc.)
        // Try to extract an error message from the JSON response body.
        let errorMsg = 'Something went wrong. Please try again.'
        try {
          const errorBody = await res.json()
          if (typeof errorBody?.error === 'string') errorMsg = errorBody.error
        } catch { /* body wasn't JSON, use default */ }
        throw new Error(errorMsg)
      }

      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6)
          if (!raw.trim()) continue

          let parsed: { event: string; data: Record<string, unknown> }
          try {
            parsed = JSON.parse(raw)
          } catch {
            console.warn('Failed to parse SSE line:', raw)
            continue
          }

          const { event, data } = parsed

          if (event === 'pricing_stats') {
            // Historical pricing stats from the server for data-driven ballpark
            if (Array.isArray(data)) {
              historicalStatsRef.current = data as HistoricalPricingStat[]
            }
          } else if (event === 'text') {
            setMessages((prev) => {
              const last = prev[prev.length - 1]
              // Guard: only update the specific assistant message for this stream.
              // If the user submitted before this event arrived, last.id will be a
              // different message and we must not corrupt it.
              if (last?.id !== activeBubbleId) return prev
              return [...prev.slice(0, -1), { ...last, content: last.content + (data.text as string) }]
            })
          } else if (event === 'error') {
            // Route explicitly signalled an error (e.g. Anthropic API failure).
            // Show a visible message immediately instead of leaving an empty bubble.
            const msg = typeof data.message === 'string' ? data.message : ''
            const code = typeof data.code === 'string' ? data.code : ''
            console.error('SSE error from route:', code, msg)
            const displayMsg = msg || 'Something went wrong. Please try again.'
            setMessages((prev) => {
              const last = prev[prev.length - 1]
              if (last?.id !== activeBubbleId) return prev
              return [...prev.slice(0, -1), { ...last, content: displayMsg, isError: true }]
            })
          } else if (event === 'bubble_split') {
            // The AI produced a non-empty transition_text — create a second assistant
            // message bubble and redirect all subsequent text events into it.
            // The stale-stream guard prevents an old stream from injecting a spurious
            // second bubble into a newer stream's conversation.
            if (streamIdRef.current !== myStreamId) continue
            const bubble2: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', createdAt: Date.now() }
            activeBubbleId = bubble2.id
            setMessages((prev) => [...prev, bubble2])
          } else if (event === 'partial_question') {
            // When paused, skip — no QR skeleton should flash
            if (isPausedRef.current) continue
            // question field is complete but quick_replies is still generating.
            // Show the QR card skeleton immediately so the user sees something.
            const questionText = typeof data.question === 'string' ? data.question.trim() : ''
            if (questionText) {
              setMessages((prev) => {
                const last = prev[prev.length - 1]
                if (last?.id !== activeBubbleId) return prev
                return [...prev.slice(0, -1), {
                  ...last,
                  question: questionText,
                  quickReplies: { style: 'list' as const, options: [] },
                }]
              })
            }
          } else if (event === 'partial_result') {
            // When paused, only allow pills-style QR through (for intent-based action buttons)
            if (isPausedRef.current && (data.quick_replies as QuickReplies | undefined)?.style !== 'pills') continue
            // question + quick_replies are now complete in the server's JSON buffer.
            // Show the QR card immediately — the heavy metadata fields (project_overview,
            // scope_summaries) are still generating but aren't needed for interactivity.
            const questionText = typeof data.question === 'string' ? data.question.trim() : ''
            const rawQR = data.quick_replies as QuickReplies | undefined
            // Auto-detect custom styles from question text (Haiku fallback)
            const detectedQR = autoDetectQRStyle(rawQR, questionText) ?? rawQR
            const validQR = detectedQR && (
              detectedQR.style === 'sqft' || detectedQR.style === 'budget' || detectedQR.style === 'scope_grid'
                ? true
                : (Array.isArray(detectedQR.options) && detectedQR.options.length > 0)
            )
              ? detectedQR
              : undefined
            const updatedQR = normalizeQRStyle(validQR, questionText)

            if (updatedQR) {
              const isListQR = updatedQR.style === 'list'
              setMessages((prev) => {
                const last = prev[prev.length - 1]
                if (last?.id !== activeBubbleId) return prev  // user already moved on
                const base = (last.content || '').replace(/"+\s*$/, '')  // strip trailing quotes
                const bubbleContent =
                  !isListQR && questionText
                    ? base ? `${base}\n\n${questionText}` : questionText
                    : base
                return [...prev.slice(0, -1), {
                  ...last,
                  content: bubbleContent,
                  question: isListQR ? (questionText || undefined) : undefined,
                  quickReplies: updatedQR,
                  // suggest_pause is best-effort — may or may not be in the buffer yet.
                  // tool_result will set isPause correctly; partial_result only sets it
                  // when the field was already present to avoid a jarring re-render.
                  isPause: data.suggest_pause === true || undefined,
                }]
              })
              partialResultApplied = true
              // Mark this stream done so the QR card and input become interactive.
              // The Anthropic stream is still open generating metadata fields, but
              // there's nothing left the user needs to wait for.
              if (streamIdRef.current === myStreamId) setIsStreaming(false)
            }
          } else if (event === 'partial_scopes') {
            // detected_scope is complete in the server buffer — update the panel now,
            // before the heavy project_overview / scope_summaries fields finish.
            // tool_result will overwrite these with identical values; no double-counting.
            const rawScope = data.detected_scope
            if (Array.isArray(rawScope)) {
              const earlyScope = expandWithDependencies(rawScope as string[])
              setDetectedScope(earlyScope)
            }
          } else if (event === 'tool_result') {
            const input = data.input as UpdateProposalInput
            // Auto-expand to include required dependencies (e.g. payments -> auth + database)
            // UNION with existing scope — the AI may only send new or currently-relevant
            // scope items each turn, so we must accumulate across the entire conversation.
            const aiScope = Array.isArray(input?.detected_scope) ? input.detected_scope : []
            const merged = Array.from(new Set([...detectedScopeRef.current, ...aiScope]))
            // Mandatory scope items: every project includes these three at minimum.
            // The AI prompt says to always include them, but Haiku sometimes forgets.
            const MANDATORY = ['paint_walls', 'electrical', 'plumbing']
            const withMandatory = merged.length > 0
              ? Array.from(new Set([...merged, ...MANDATORY]))
              : merged  // don't add mandatory if scope is completely empty (turn 1)
            const newScope = expandWithDependencies(withMandatory)
            const newMultiplier = typeof input?.complexity_multiplier === 'number' ? input.complexity_multiplier : 1.0
            const delta = typeof input?.confidence_score_delta === 'number' ? input.confidence_score_delta : 0
            const newScore = Math.max(0, Math.min(85, confidenceRef.current + delta))

            setDetectedScope(newScope)
            setConfidenceScore(newScore)
            setComplexityMultiplier(newMultiplier)
            setPriceRange(computePriceRange(newScope, newMultiplier, newScore))
            if (input?.project_overview && input.project_overview.trim()) {
              setProjectOverview(input.project_overview.trim())
            }
            if (input?.scope_summaries && typeof input.scope_summaries === 'object') {
              setScopeSummaries(prev => ({ ...prev, ...input.scope_summaries }))
            }
            if (input?.project_name && input.project_name.trim()) {
              setProjectName(input.project_name.trim())
            }

            // ── Accumulate Daniel-script qualifying fields ──
            // These build up across the conversation and get persisted into
            // leads.metadata via sync-messages. Only copy fields when the AI
            // provides a non-empty/non-zero value; otherwise keep the previous.
            {
              const q = qualifyingFieldsRef.current
              if (typeof input?.property_type === 'string' && input.property_type) q.property_type = input.property_type
              if (typeof input?.location === 'string' && input.location) q.location = input.location
              if (typeof input?.size_sqft === 'number' && input.size_sqft > 0) q.size_sqft = input.size_sqft
              if (typeof input?.condition === 'string' && input.condition) q.condition = input.condition
              if (typeof input?.style_preference === 'string' && input.style_preference) q.style_preference = input.style_preference
              if (typeof input?.ownership === 'string' && input.ownership) q.ownership = input.ownership
              if (typeof input?.budget_aed_stated === 'number' && input.budget_aed_stated > 0) {
                q.budget_aed_stated = input.budget_aed_stated
              }
              if (typeof input?.has_floor_plans === 'string' && input.has_floor_plans) q.has_floor_plans = input.has_floor_plans
              if (typeof input?.wants_project_management === 'string' && input.wants_project_management) q.wants_project_management = input.wants_project_management
              if (typeof input?.contractor_quote_count === 'number' && input.contractor_quote_count > 0) q.contractor_quote_count = input.contractor_quote_count
              if (typeof input?.full_scope_notes === 'string' && input.full_scope_notes) q.full_scope_notes = input.full_scope_notes

              // Update picker hints so budget/sqft pickers pre-populate
              const newHints: { size_sqft?: number; budget_aed?: number } = {}
              if (q.size_sqft && q.size_sqft > 0) newHints.size_sqft = q.size_sqft
              if (q.budget_aed_stated && q.budget_aed_stated > 0) newHints.budget_aed = q.budget_aed_stated
              if (newHints.size_sqft || newHints.budget_aed) {
                setPickerHints(prev => ({ ...prev, ...newHints }))
              }
            }

            // ── File upload widget injection ──
            // Fire once when the AI first sets has_floor_plans to "yes".
            // The system prompt tells the AI to leave question empty on this turn,
            // but Haiku often ignores this and bundles the next checklist item
            // (e.g. budget picker) into the same turn. We force the upload widget
            // regardless and strip the question/QR from this turn so the user
            // gets a clean upload experience without mixed topics.
            if (
              !uploadWidgetInjectedRef.current &&
              input?.has_floor_plans === 'yes' &&
              !isPausedRef.current
            ) {
              // Force question/QR to empty so the budget/next-item picker
              // doesn't appear alongside the upload widget
              if (input.question) input.question = ''
              if (input.quick_replies) input.quick_replies = undefined
              uploadWidgetInjectedRef.current = true
              const widgetMsg: ChatMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: '',
                isFileUploadPrompt: true,
                uploadPurpose: 'floor_plans',
                uploadedFiles: [],
                createdAt: Date.now(),
              }
              setMessages((prev) => [...prev, widgetMsg])
            }

            // Auto-resume: AI detected user agreed to resume structured Q&A.
            // Unpause immediately so the NEXT user message triggers normal Q&A flow.
            // We also fire a synthetic "Continue" message so the user doesn't have
            // to type anything — the next question appears automatically.
            if (isPausedRef.current && input?.suggest_resume === true) {
              setIsPaused(false)
              isPausedRef.current = false
              if (proposalId) {
                localStorage.removeItem(PAUSED_KEY(proposalId))
                localStorage.removeItem(PAUSED_QR_KEY(proposalId))
              }
              // Defer the resume message so this tool_result's state updates settle first
              setTimeout(() => {
                sendMessage('Continue with intake questions', 'Resumed auto-questions')
              }, 100)
            }

            // Checkpoint (breather) — hybrid client + AI decision.
            // In discovery phase: client triggers at confidence >= 60% as safety net.
            // In deep_dive phase: AI drives checkpoints via suggest_pause on scope_complete turns.
            // In wrap_up phase: AI sets suggest_pause for the final checkpoint.
            turnCount.current++
            const turnsSinceLast = turnCount.current - lastPauseTurn.current
            const aiWantsPause = input?.suggest_pause === true
            const phase = input?.current_phase || currentPhaseRef.current
            const isUpgradeTransition = journeyModeRef.current === 'upgraded' && turnCount.current <= 2
            // In discovery, don't trigger AI pause before turn 4 (Haiku can be trigger-happy
            // with suggest_pause on detailed opening messages)
            const effectiveAiPause = phase === 'discovery' ? aiWantsPause && turnCount.current >= 4 : aiWantsPause
            const clientWantsPause = (phase === 'discovery' && newScore >= 60 && turnCount.current >= 6)
              // Safety net: wrap_up phase should ALWAYS show pills
              || phase === 'wrap_up'
            const isPauseThisTurn = !isUpgradeTransition && (effectiveAiPause || clientWantsPause) && turnsSinceLast >= 4
            if (isPauseThisTurn) lastPauseTurn.current = turnCount.current

            setMessages((prev) => {
              const last = prev[prev.length - 1]
              const userAlreadyResponded = last?.id !== activeBubbleId
              const followUp = typeof input?.follow_up_question === 'string' ? input.follow_up_question : ''
              const questionText = typeof input?.question === 'string' ? input.question.trim() : ''
              // Auto-detect custom styles from question text (Haiku fallback).
              // Then validate and normalize.
              const rawQR = input?.quick_replies
              const detectedQR = autoDetectQRStyle(rawQR ?? undefined, questionText) ?? rawQR
              const validQR = detectedQR && (
                detectedQR.style === 'sqft' || detectedQR.style === 'budget' || detectedQR.style === 'scope_grid'
                  ? true
                  : (Array.isArray(detectedQR.options) && detectedQR.options.length > 0)
              )
                ? detectedQR
                : // Fallback: if Haiku sent NO QR at all but the question matches a
                  // custom picker pattern, create a synthetic QR so the picker renders.
                  questionText && !rawQR
                    ? autoDetectQRStyle({ style: 'list', options: [] }, questionText) ?? undefined
                    : undefined
              const updatedQR = normalizeQRStyle(validQR, questionText)

              if (isPauseThisTurn) {
                // PAUSE TURN: always create the checkpoint, even if the user responded
                // before tool_result arrived (after partial_result set isStreaming=false).
                // Find the original assistant bubble to use as the reaction bubble.
                const bubbleIdx = prev.findIndex(m => m.id === activeBubbleId)
                const bubble = bubbleIdx !== -1 ? prev[bubbleIdx] : null
                const reactionBubble: ChatMessage = bubble
                  ? { ...bubble, content: (bubble.content || followUp).replace(/"+\s*$/, ''), question: undefined, quickReplies: undefined, isPause: undefined }
                  : { id: crypto.randomUUID(), role: 'assistant' as const, content: followUp.replace(/"+\s*$/, ''), createdAt: Date.now() }
                const checkpointContent = aiWantsPause && questionText
                  ? questionText
                  : 'Good progress so far. Your lead is shaping up nicely. Want to take a look at what we\'ve built, keep going to sharpen the details, or save this for later?'
                const checkpointMsg: ChatMessage = {
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content: checkpointContent,
                  isPause: true,
                  createdAt: Date.now(),
                }
                if (bubbleIdx !== -1) {
                  // Replace the original bubble with reaction + checkpoint
                  return [...prev.slice(0, bubbleIdx), reactionBubble, checkpointMsg, ...prev.slice(bubbleIdx + 1)]
                }
                // Bubble not found (shouldn't happen) — just append
                return [...prev, checkpointMsg]
              }

              // Guard: if the user already responded (after a partial_result), don't
              // overwrite the new stream's state.
              if (userAlreadyResponded) return prev

              // Normal turn
              // When paused, strip list QR and question — but allow pills through (intent actions)
              const effectiveQR = isPausedRef.current
                ? (updatedQR?.style === 'pills' ? updatedQR : undefined)
                : updatedQR
              const effectiveQuestion = isPausedRef.current ? undefined : questionText

              // Preserve partial_result's QR if tool_result has no valid QR.
              // The full JSON parse can sometimes lose quick_replies (e.g. model
              // generates an invalid structure, or the options array is empty in the
              // final parse even though partial extraction found valid options).
              let finalQR = effectiveQR ?? (partialResultApplied ? last.quickReplies : undefined)
              const finalQuestion = effectiveQuestion || (partialResultApplied ? last.question : undefined)

              // Fallback: AI provided a question but no quick_replies. Create a minimal
              // list QR so the question shows in the card header with a free-text input,
              // instead of being buried as a paragraph in the bubble.
              if (!finalQR && finalQuestion && !isPausedRef.current) {
                finalQR = { style: 'list' as const, options: [], allowCustom: true } as QuickReplies
              }

              const isListFinal = finalQR?.style === 'list' ||
                (finalQR && Array.isArray(finalQR.options) && finalQR.options.length >= 3)

              // For list QR: question goes in the rows card header (message.question), not in the bubble
              // For no QR or pills QR: question is appended to bubble content so it's visible
              // Skip appending if partial_result already built the content (avoids duplicate question)
              // Strip trailing quotes — the AI sometimes wraps follow_up_question in
              // literal escaped quotes which the streaming parser correctly unescapes
              // but shouldn't be displayed.
              let base = (last.content || followUp).replace(/"+\s*$/, '')
              // Defense: when a list QR is shown, the question lives in the card header.
              // Strip any question sentences (ending with ?) from the bubble to avoid
              // showing a question in both the bubble and the card — even if the AI
              // rephrased the question differently in follow_up_question.
              if (isListFinal && finalQuestion) {
                // Remove sentences ending with ? (handles both exact match and rephrased questions)
                base = base.replace(/[^.!?\n]*\?/g, '').replace(/\n\n\s*$/, '').replace(/\s{2,}/g, ' ').trim()
              }
              const bubbleContent = !isListFinal && finalQuestion && !partialResultApplied
                ? (base ? `${base}\n\n${finalQuestion}` : finalQuestion)
                : base
              // Ensure bubble always has content — empty bubbles get filtered from API
              // messages which can create invalid consecutive same-role messages (400 error).
              // For quick_discovery ballpark turns, generate a summary from qualifying fields
              // instead of showing '...' when the AI omits follow_up_question.
              let fallbackText = '...'
              if (!bubbleContent && !finalQuestion && !followUp && effectivePhase === 'quick_discovery') {
                const qf = qualifyingFieldsRef.current
                const parts = [
                  qf.size_sqft ? `${qf.size_sqft.toLocaleString()} sqft` : '',
                  qf.property_type || '',
                  qf.location ? `in ${qf.location}` : '',
                ].filter(Boolean)
                fallbackText = parts.length > 0
                  ? `Here's what we have so far: ${parts.join(' ')}.`
                  : 'Here is your quick estimate based on what you shared.'
              }
              const safeContent = bubbleContent || finalQuestion || followUp || fallbackText

              return [...prev.slice(0, -1), {
                ...last,
                content: safeContent,
                question: isListFinal ? (finalQuestion || undefined) : undefined,
                quickReplies: finalQR,
                isPause: undefined,
              }]
            })

            // ── Stale-stream guard ──
            // If a newer stream has started (user clicked QR after partial_result),
            // skip ALL remaining side effects (phase tracking, divider insertion,
            // localStorage persistence). The newer stream's tool_result will handle them.
            // Only allow: proposal metadata updates (already done above) and isStreaming reset.
            const isStaleStream = streamIdRef.current !== myStreamId

            // Mark streaming done — guard against resetting a newer stream's flag.
            if (!isStaleStream) setIsStreaming(false)

            if (isStaleStream) {

              // Still persist proposal data (scope, score, overview) since those are
              // cumulative and safe to apply from any stream. But skip everything else.
              if (proposalId) {
                try {
                  const savedOverview = (input?.project_overview && input.project_overview.trim())
                    ? input.project_overview.trim()
                    : projectOverviewRef.current
                  const savedSummaries = (input?.scope_summaries && typeof input.scope_summaries === 'object')
                    ? { ...scopeSummariesRef.current, ...input.scope_summaries }
                    : scopeSummariesRef.current
                  const savedProjectName = (input?.project_name && input.project_name.trim())
                    ? input.project_name.trim()
                    : ''
                  const savedBrief = (input?.updated_brief && input.updated_brief.trim())
                    ? input.updated_brief.trim()
                    : undefined
                  localStorage.setItem(PROPOSAL_KEY(proposalId), JSON.stringify({
                    detectedScope: newScope,
                    confidenceScore: newScore,
                    complexityMultiplier: newMultiplier,
                    projectOverview: savedOverview,
                    scopeSummaries: savedSummaries,
                    projectName: savedProjectName || undefined,
                    brief: savedBrief,
                    qualifyingFields: qualifyingFieldsRef.current,
                  }))
                } catch { /* Ignore QuotaExceededError */ }
              }
              continue  // Skip phase tracking, dividers, and phase persistence
            }

            // When paused and the AI sends a new list QR (which we stripped above),
            // save it for the peek card so the user sees the next question peeking.
            if (isPausedRef.current && !isPauseThisTurn) {
              const qText = typeof input?.question === 'string' ? input.question.trim() : ''
              const rawQRPeek = input?.quick_replies
              const validQRPeek = rawQRPeek && (
                rawQRPeek.style === 'sqft' || rawQRPeek.style === 'budget'
                  ? true
                  : (Array.isArray(rawQRPeek.options) && rawQRPeek.options.length > 0)
              )
                ? rawQRPeek
                : undefined
              const normQR = normalizeQRStyle(validQRPeek, qText)
              if (normQR?.style === 'list' && qText) {
                const qrData = { question: qText, quickReplies: normQR, messageId: activeBubbleId }
                pausedQRRef.current = qrData
                setPausedQuestion(qText)
                if (proposalId) {
                  try { localStorage.setItem(PAUSED_QR_KEY(proposalId), JSON.stringify(qrData)) } catch { /* ignore */ }
                }
              }
            }

            // ── Phase tracking: update state from AI's phase fields ──
            // Client-side enforcement: if AI stays in discovery past turn 7,
            // force transition to deep_dive using detected scope.
            let effectivePhase = input?.current_phase || currentPhaseRef.current
            let effectiveScope = typeof input?.current_scope === 'string' ? input.current_scope : ''
            let effectiveQueue = Array.isArray(input?.scope_queue) ? input.scope_queue : scopeQueueRef.current

            // Priority Question Checklist is 8 items + 1 upload handoff turn, so
            // Phase 1 can legitimately take 9 turns. Only force transition if the
            // AI is still in discovery past turn 10 AND has detected scope items.
            if (effectivePhase === 'discovery' && turnCount.current >= 10 && detectedScopeRef.current.length >= 2) {
              console.log('[Phase] Client forcing transition to deep_dive after', turnCount.current, 'turns')
              effectivePhase = 'deep_dive'
              const items = [...detectedScopeRef.current]
              const coreFirst = ['mobile_app', 'web_app']
              const sorted = [
                ...items.filter(m => coreFirst.includes(m)),
                ...items.filter(m => !coreFirst.includes(m)),
              ]
              effectiveQueue = sorted
              effectiveScope = sorted[0] || ''
            }

            // Handle journey_mode from AI output
            if (input?.journey_mode && input.journey_mode !== journeyModeRef.current) {
              const jm = (input.journey_mode || '') as '' | 'quick' | 'full'
              setJourneyMode(jm)
              journeyModeRef.current = jm
              if (proposalId) localStorage.setItem(JOURNEY_MODE_KEY(proposalId), jm)
            }

            if (effectivePhase) setCurrentPhase(effectivePhase as typeof currentPhase)
            if (effectiveScope) setCurrentScope(effectiveScope)
            if (effectiveQueue.length > 0) setScopeQueue(effectiveQueue)

            // Extract question/followUp for stage-setting detection (used by both
            // scope-start insertion and auto-continue below)
            const stageQuestionText = typeof input?.question === 'string' ? input.question.trim() : ''
            const stageFollowUp = typeof input?.follow_up_question === 'string' ? input.follow_up_question : ''

            // Scope-start divider: insert when AI moves to a new scope item
            const newItem = effectiveScope

            if (newItem && newItem !== prevScopeRef.current && !input?.scope_complete) {
              // Auto-complete the previous scope item when transitioning to a new one.
              // The AI doesn't always send scope_complete: true explicitly, so we
              // infer completion from the scope transition itself.
              const prevItem = prevScopeRef.current
              if (prevItem && !completedScopeRef.current.includes(prevItem)) {
                setCompletedScope(prev => prev.includes(prevItem) ? prev : [...prev, prevItem])
                completedScopeRef.current = [...completedScopeRef.current, prevItem]
              }

              const queueArr = Array.isArray(input?.scope_queue) ? input.scope_queue : effectiveQueue
              const totalItems = queueArr.length + completedScopeRef.current.length
              // Stage-setting turn: first scope transition = overview card (always show checklist
              // on the very first deep-dive entry, regardless of whether AI set question to "")
              const isStageSettingTurn = completedScopeRef.current.length === 0 && prevScopeRef.current === ''
              const scopeStartMsg: ChatMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: '',
                isScopeStart: true,
                isOverview: isStageSettingTurn,
                scopeId: newItem,
                scopePosition: completedScopeRef.current.length + 1,
                scopeTotal: totalItems || undefined,
                createdAt: Date.now(),
                checklistCompleted: [...completedScopeRef.current],
                checklistCurrent: isStageSettingTurn ? '' : newItem,
                checklistQueue: isStageSettingTurn
                  ? [newItem, ...queueArr.filter(id => id !== newItem && !completedScopeRef.current.includes(id))]
                  : queueArr.filter(id => id !== newItem && !completedScopeRef.current.includes(id)),
              }
              setMessages(prev => {
                const bubbleIdx = prev.findIndex(m => m.id === activeBubbleId)
                if (isStageSettingTurn) {
                  // Stage-setting: insert card AFTER the intro bubble
                  if (bubbleIdx >= 0) {
                    return [...prev.slice(0, bubbleIdx + 1), scopeStartMsg, ...prev.slice(bubbleIdx + 1)]
                  }
                  return [...prev, scopeStartMsg]
                }
                // Normal scope transition: insert card BEFORE the bubble
                if (bubbleIdx > 0) {
                  return [...prev.slice(0, bubbleIdx), scopeStartMsg, ...prev.slice(bubbleIdx)]
                }
                return [...prev.slice(0, -1), scopeStartMsg, prev[prev.length - 1]]
              })
              prevScopeRef.current = newItem
            }

            // Scope-complete divider: insert when AI signals a scope item is done
            if (input?.scope_complete === true && newItem) {
              setCompletedScope(prev => prev.includes(newItem) ? prev : [...prev, newItem])
              completedScopeRef.current = completedScopeRef.current.includes(newItem)
                ? [...completedScopeRef.current]
                : [...completedScopeRef.current, newItem]
              const newCompleted = completedScopeRef.current
              const remainingQueue = effectiveQueue.filter(id => id !== newItem && !newCompleted.includes(id))
              const nextItem = remainingQueue[0] || ''

              // Advance currentScope to the next scope item so the AI knows where
              // to continue on the "Keep going" turn. Without this, the system
              // prompt tells the AI current_scope = the completed item, which
              // confuses it into thinking it's done and jumping to wrap_up.
              if (nextItem) {
                setCurrentScope(nextItem)
                currentScopeRef.current = nextItem
                setScopeQueue(remainingQueue)
                scopeQueueRef.current = remainingQueue
              }

              const scopeCompleteMsg: ChatMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: '', // ScopeProgressCard renders its own content
                isScopeComplete: true,
                isPause: true,
                scopeId: newItem,
                scopeSummary: stageFollowUp.replace(/[^.!?\n]*\?/g, '').trim() || '',
                createdAt: Date.now(),
                checklistCompleted: newCompleted,
                checklistCurrent: nextItem,
                checklistQueue: remainingQueue,
              }
              setMessages(prev => [...prev, scopeCompleteMsg])
              prevScopeRef.current = newItem
            }

            // Save proposal state inline so it survives page reload.
            if (proposalId) {
              try {
                const savedOverview = (input?.project_overview && input.project_overview.trim())
                  ? input.project_overview.trim()
                  : projectOverviewRef.current
                const savedSummaries = (input?.scope_summaries && typeof input.scope_summaries === 'object')
                  ? { ...scopeSummariesRef.current, ...input.scope_summaries }
                  : scopeSummariesRef.current
                const savedProjectName = (input?.project_name && input.project_name.trim())
                  ? input.project_name.trim()
                  : ''
                const savedBrief = (input?.updated_brief && input.updated_brief.trim())
                  ? input.updated_brief.trim()
                  : undefined
                localStorage.setItem(PROPOSAL_KEY(proposalId), JSON.stringify({
                  detectedScope: newScope,
                  confidenceScore: newScore,
                  complexityMultiplier: newMultiplier,
                  projectOverview: savedOverview,
                  scopeSummaries: savedSummaries,
                  projectName: savedProjectName || undefined,
                  brief: savedBrief,
                }))
                // Persist phase state for cross-refresh restoration
                // Use refs to avoid stale closure values
                const phaseState = {
                  currentPhase: effectivePhase || 'discovery',
                  currentScope: currentScopeRef.current || effectiveScope,
                  scopeQueue: scopeQueueRef.current.length > 0 ? scopeQueueRef.current : effectiveQueue,
                  completedScope: completedScopeRef.current,
                }
                localStorage.setItem(PHASE_KEY(proposalId), JSON.stringify(phaseState))

                // Auto-sync proposal metadata to Supabase (even without email verification)
                // so the admin dashboard can see the lead as soon as AI starts analyzing it.
                const storedSession = getStoredSession()
                if (storedSession?.sessionId) {
                  fetch(`/api/proposals/${proposalId}/sync-metadata`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      sessionId: storedSession.sessionId,
                      confidenceScore: newScore,
                      modules: newScope,
                      brief: savedBrief,
                      metadata: {
                        ...(savedProjectName ? { projectName: savedProjectName } : {}),
                        ...(savedOverview ? { projectOverview: savedOverview } : {}),
                      },
                    }),
                  }).catch(() => { /* best-effort, ignore errors */ })
                }
              } catch { /* Ignore QuotaExceededError */ }
            }

            // Ballpark card: when quick_discovery phase completes (AI sends empty question),
            // insert a BallparkResultCard with the computed price range.
            if (effectivePhase === 'quick_discovery' && !stageQuestionText && journeyModeRef.current === 'quick' && turnCount.current >= 2) {
              const qf = qualifyingFieldsRef.current
              const ballpark = computeQuickBallpark({
                scopeIds: detectedScopeRef.current,
                sizeSqft: qf.size_sqft || 0,
                condition: qf.condition || 'needs_refresh',
                location: qf.location || '',
                historicalStats: historicalStatsRef.current.length > 0
                  ? historicalStatsRef.current : undefined,
              })
              const ballparkMsg: ChatMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: '',
                isBallpark: true,
                ballparkRange: ballpark,
                ballparkScopeIds: [...detectedScopeRef.current],
                ballparkPropertyType: qf.property_type || '',
                ballparkLocation: qf.location || '',
                ballparkSizeSqft: qf.size_sqft || 0,
                ballparkCondition: qf.condition || '',
                ballparkStylePreference: qf.style_preference || '',
                createdAt: Date.now(),
              }
              setMessages(prev => [...prev, ballparkMsg])
            }

            // Stage-setting auto-continue: if AI transitioned to deep_dive with
            // an empty question (stage-setting turn), auto-trigger the first
            // deep-dive question after a brief delay.
            if (effectivePhase === 'deep_dive' && newItem && !stageQuestionText && !input?.scope_complete) {
              // Build complete message history: original messages + this assistant response + continue
              const assistantContent = stageFollowUp || 'Here is what we will scope out.'
              const autoMessages: ApiMessage[] = [
                ...apiMessages,
                { role: 'assistant', content: assistantContent },
                { role: 'user', content: 'Continue' },
              ]
              setTimeout(() => {
                streamAIResponse(autoMessages, { isAutoContinue: true })
              }, 1500)
            }
          }
        }
      }
    } catch (err) {
      console.error('Chat error:', err)
      const errorMsg = err instanceof Error && err.message !== 'No response body'
        ? err.message
        : 'Something went wrong. Please try again.'
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.role !== 'assistant') return prev
        return [...prev.slice(0, -1), { ...last, content: errorMsg, isError: true }]
      })
    } finally {
      // Guard: if the stream closed without ever producing a tool_result (e.g. Vercel
      // timeout, network drop), replace the empty bubble with a visible error.
      // We check the message ID so a stale stream doesn't clobber a newer one that
      // started after the user submitted while this stream was still draining.
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.id === activeBubbleId && last.role === 'assistant' && !last.content.trim()) {
          return [...prev.slice(0, -1), { ...last, content: 'Something went wrong. Please try again.', isError: true }]
        }
        return prev
      })
      // Safety net — only reset if this is still the active stream; a newer stream
      // may have started (e.g. user submitted after partial_result) in which case
      // we must NOT clobber its isStreaming state.
      if (streamIdRef.current === myStreamId) setIsStreaming(false)
    }
  }

  const sendMessage = useCallback(async (content: string, displayContent?: string, sourceQuickReplies?: QuickReplies, sourceQuestion?: string) => {
    if (isStreaming) return

    // Ensure we always have non-empty content for the API.
    // The AI sometimes generates QR options with empty `value` but valid `label`.
    // When the user clicks such an option, content is "" but displayContent has the label.
    const safeContent = content || displayContent || 'continue'

    // Reserved signals from the file-upload widget are hidden from the chat UI,
    // they still go to the AI as regular user messages but never render as bubbles.
    const isReservedHidden =
      safeContent === '__files_uploaded__' || safeContent === '__files_share_later__'

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: safeContent,
      displayContent: displayContent && displayContent !== safeContent ? displayContent : undefined,
      sourceQuickReplies,
      sourceQuestion,
      hidden: isReservedHidden || undefined,
      createdAt: Date.now(),
    }

    // When admin is active, just add the user message but don't call AI
    if (isAdminActive) {
      setMessages((prev) => [...prev, userMessage])
      return
    }

    const apiMessages = mergeConsecutiveMessages([
      ...messagesRef.current
        // Filter out synthetic messages that shouldn't be in API history:
        // - Scope dividers (empty content, UI-only)
        // - Pause checkpoints (synthetic breather prompts)
        // - Admin messages (not part of AI conversation)
        // - Error messages (failed API responses, not real AI output)
        // - Any message with empty/missing content (Claude API rejects these)
        .filter(m => !m.isScopeStart && !m.isScopeComplete && !m.isPause && !m.isError && m.role !== 'admin' && m.content)
        .map((m): ApiMessage => ({ role: m.role === 'admin' ? 'user' : m.role, content: m.content })),
      { role: 'user', content: safeContent },
    ])

    // If answering a revealed (temporarily shown) paused question, hide it back
    // and clear the saved QR — the question is now answered.
    if (questionRevealed) {
      setQuestionRevealed(false)
      pausedQRRef.current = null
      if (proposalId) localStorage.removeItem(PAUSED_QR_KEY(proposalId))
    }

    setMessages((prev) => {
      // Clear quickReplies and question from last assistant message
      const cleared = prev.map((m, i) =>
        i === prev.length - 1 && m.role === 'assistant' ? { ...m, quickReplies: undefined, question: undefined } : m
      )
      return [...cleared, userMessage]
    })

    await streamAIResponse(apiMessages)
  }, [isStreaming, questionRevealed, proposalId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep ref in sync so the stage-setting auto-continue can call sendMessage
  sendMessageRef.current = sendMessage

  function toggleScope(scopeId: string) {
    const newScope = detectedScope.includes(scopeId)
      ? detectedScope.filter((m) => m !== scopeId)
      : [...detectedScope, scopeId]
    setDetectedScope(newScope)
    setPriceRange(computePriceRange(newScope, complexityMultiplier, confidenceScore))

    // Save inline so scope toggles survive page reload
    if (proposalId) {
      try {
        localStorage.setItem(PROPOSAL_KEY(proposalId), JSON.stringify({
          detectedScope: newScope,
          confidenceScore,
          complexityMultiplier,
          projectOverview,
          scopeSummaries,
        }))
      } catch { /* Ignore */ }
    }
  }

  /**
   * Classify the flow impact of editing a particular user message.
   *
   * "High" impact = subsequent questions/answers are likely to depend on this
   * answer and must be reset when it changes. "Low" impact = subsequent
   * questions stand on their own and can be kept verbatim.
   *
   * The classification is driven by the QR style and values of the original
   * message, since that's the strongest signal about what field was being set.
   */
  function classifyEditImpact(msg: ChatMessage): 'high' | 'low' {
    const qr = msg.sourceQuickReplies
    // Free-text messages (typed location, or the very first idea): assume high
    // impact since we can't introspect what field they set.
    if (!qr) return 'high'

    // Numeric pickers are self-contained values that feed metadata only.
    if (qr.style === 'sqft' || qr.style === 'budget') return 'low'

    // Cards: check the first option to distinguish factual/flow-critical
    // selections (property_type, condition, style, flooring, countertop) from
    // nothing — currently all card questions are flow-critical so we reset.
    if (qr.style === 'cards') {
      const HIGH_IMPACT_VALUES = new Set<string>([
        // property_type
        'villa', 'apartment', 'townhouse', 'penthouse', 'office', 'retail', 'warehouse',
        // condition (residential + commercial)
        'new', 'needs_refresh', 'major_renovation', 'shell',
        'fitted', 'semi_fitted', 'shell_and_core',
        // style_preference
        'Modern', 'Contemporary Arabic', 'Scandinavian', 'Industrial',
        'Classic', 'Maximalist', 'Coastal', 'Minimalist',
        // flooring / countertops
        'marble', 'porcelain', 'engineered_wood', 'vinyl', 'natural_stone',
        'quartz', 'porcelain_slab', 'granite',
      ])
      const firstValue = qr.options?.[0]?.value ?? ''
      return HIGH_IMPACT_VALUES.has(firstValue) ? 'high' : 'low'
    }

    // Pills: binary yes/no, usually factual metadata (ownership, has_floor_plans,
    // wants_project_management). Safe to keep subsequent messages.
    if (qr.style === 'pills') return 'low'

    // List: free-form options with suggestions (location, contractor count).
    // Usually low impact.
    if (qr.style === 'list') return 'low'

    return 'high'
  }

  const editMessage = useCallback(async (messageId: string, newContent: string, displayContent?: string) => {
    if (isStreaming) return

    const msgIndex = messagesRef.current.findIndex((m) => m.id === messageId)
    if (msgIndex === -1) return
    if (msgIndex === 0) return // Don't edit the original idea — use Reset to start over

    const originalMsg = messagesRef.current[msgIndex]
    if (originalMsg.role !== 'user') return

    // Build the replacement user message: same sourceQuickReplies/sourceQuestion
    // so the edit is invisible (the bubble reads like a fresh answer), but with
    // a new id + timestamp so React remounts correctly.
    const replacedMsg: ChatMessage = {
      ...originalMsg,
      id: crypto.randomUUID(),
      content: newContent,
      displayContent:
        displayContent && displayContent !== newContent ? displayContent : undefined,
      createdAt: Date.now(),
    }

    const impact = classifyEditImpact(originalMsg)

    if (impact === 'high') {
      // HIGH IMPACT: reset all messages after the edit point and re-stream.
      // This handles property_type changes, condition changes, scope answers
      // that would otherwise leave the conversation inconsistent.
      const kept = messagesRef.current.slice(0, msgIndex)
      setMessages([...kept, replacedMsg])

      const aiHistory = mergeConsecutiveMessages(
        [...kept, replacedMsg]
          .filter(m => !m.isScopeStart && !m.isScopeComplete && !m.isPause && !m.isError && m.role !== 'admin' && m.content)
          .map((m): ApiMessage => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      )

      await streamAIResponse(aiHistory)
      return
    }

    // LOW IMPACT: replace the message in place and keep all subsequent messages.
    // We don't re-stream — the next outgoing user message will naturally include
    // the edited answer in its history. The existing assistant replies downstream
    // of the edit may still reference the old value literally (e.g. "with your
    // 250k budget..."), but the edit is propagated through metadata sync.
    setMessages((prev) =>
      prev.map((m, i) => (i === msgIndex ? replacedMsg : m))
    )
  }, [isStreaming]) // eslint-disable-line react-hooks/exhaustive-deps

  const pauseQuestions = useCallback(() => {
    setIsPaused(true)
    isPausedRef.current = true
    if (proposalId) localStorage.setItem(PAUSED_KEY(proposalId), 'true')
    // Save the current question + QR before stripping, so we can restore silently on resume
    setMessages((prev) => {
      const idx = [...prev].reverse().findIndex(m => m.role === 'assistant' && !m.isPause)
      if (idx === -1) return prev
      const realIdx = prev.length - 1 - idx
      const msg = prev[realIdx]
      // Save the question text for the peek card + full QR for silent restore
      if (msg.question) setPausedQuestion(msg.question)
      if (msg.quickReplies && msg.question) {
        const qrData = { question: msg.question, quickReplies: msg.quickReplies, messageId: msg.id }
        pausedQRRef.current = qrData
        // Persist to localStorage so peek card + silent restore survive page refresh
        try { localStorage.setItem(PAUSED_QR_KEY(proposalId), JSON.stringify(qrData)) } catch { /* ignore */ }
      }
      if (!msg.quickReplies) return prev
      return [
        ...prev.slice(0, realIdx),
        { ...msg, quickReplies: undefined, question: undefined },
        ...prev.slice(realIdx + 1),
      ]
    })
  }, [proposalId])

  const resumeQuestions = useCallback(() => {
    setIsPaused(false)
    isPausedRef.current = false
    setPausedQuestion(null)
    if (proposalId) {
      localStorage.removeItem(PAUSED_KEY(proposalId))
      localStorage.removeItem(PAUSED_QR_KEY(proposalId))
    }

    const saved = pausedQRRef.current
    if (saved) {
      // Silent restore: put the question + QR back on the original message
      setMessages((prev) => {
        // Find the message to restore onto — try saved ID first, fall back to last assistant
        let targetIdx = prev.findIndex(m => m.id === saved.messageId)
        if (targetIdx === -1) {
          const revIdx = [...prev].reverse().findIndex(m => m.role === 'assistant' && !m.isPause)
          if (revIdx !== -1) targetIdx = prev.length - 1 - revIdx
        }
        if (targetIdx === -1) return prev
        const msg = prev[targetIdx]
        return [
          ...prev.slice(0, targetIdx),
          { ...msg, question: saved.question, quickReplies: saved.quickReplies },
          ...prev.slice(targetIdx + 1),
        ]
      })
      pausedQRRef.current = null
    } else {
      // No saved QR (e.g. restored from localStorage paused state) — ask AI to continue
      sendMessage('Continue with intake questions', 'Continue')
    }
  }, [proposalId, sendMessage])

  // Temporarily reveal the paused question's QR card so the user can answer it
  // without fully resuming auto-questions. After answering, the card hides and
  // the breather checkpoint remains.
  const revealPausedQuestion = useCallback(() => {
    const saved = pausedQRRef.current
    if (!saved) return
    // Restore QR on the original message
    setMessages((prev) => {
      let targetIdx = prev.findIndex(m => m.id === saved.messageId)
      if (targetIdx === -1) {
        const revIdx = [...prev].reverse().findIndex(m => m.role === 'assistant' && !m.isPause)
        if (revIdx !== -1) targetIdx = prev.length - 1 - revIdx
      }
      if (targetIdx === -1) return prev
      const msg = prev[targetIdx]
      return [
        ...prev.slice(0, targetIdx),
        { ...msg, question: saved.question, quickReplies: saved.quickReplies },
        ...prev.slice(targetIdx + 1),
      ]
    })
    setPausedQuestion(null)  // hide peek card
    setQuestionRevealed(true)  // override isPaused QR suppression
  }, [])

  const skipQuestion = useCallback(() => {
    sendMessage('Skip this question and ask the next one', 'Skipped')
  }, [sendMessage])

  // ── File upload widget handlers ──
  // The widget posts files directly to Supabase Storage via signed URLs, then
  // notifies the hook so we can persist file metadata on the correct ChatMessage
  // and fire hidden reserved-signal messages to continue the AI conversation.

  const handleFileUploaded = useCallback((messageId: string, file: UploadedFile) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, uploadedFiles: [...(m.uploadedFiles ?? []), file] }
          : m
      )
    )
    // Accumulate into qualifyingFields.uploaded_files so sync-messages writes it
    // to leads.metadata. Shape matches the server API route.
    const q = qualifyingFieldsRef.current as Record<string, unknown>
    const existing = Array.isArray(q.uploaded_files) ? (q.uploaded_files as UploadedFile[]) : []
    q.uploaded_files = [...existing, file]
  }, [])

  const handleFileUploadDone = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, uploadCompleted: true } : m))
    )
    // Fire the hidden reserved signal so the AI continues to the next checklist item.
    sendMessage('__files_uploaded__', undefined)
  }, [sendMessage])

  const handleFileUploadSkipped = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, uploadCompleted: true } : m))
    )
    ;(qualifyingFieldsRef.current as Record<string, unknown>).floor_plans_share_later = true
    sendMessage('__files_share_later__', undefined)
  }, [sendMessage])

  const reset = useCallback(() => {
    // Clear stored messages and proposal state for this lead
    if (proposalId) {
      localStorage.removeItem(MSGS_KEY(proposalId))
      localStorage.removeItem(PROPOSAL_KEY(proposalId))
      localStorage.removeItem(PAUSED_KEY(proposalId))
      localStorage.removeItem(PAUSED_QR_KEY(proposalId))
      localStorage.removeItem(PHASE_KEY(proposalId))
      localStorage.removeItem(JOURNEY_MODE_KEY(proposalId))
    }
    // Reset refs synchronously
    messagesRef.current = []
    confidenceRef.current = 0
    detectedScopeRef.current = []
    complexityRef.current = 1.0
    lastPauseTurn.current = -999
    turnCount.current = 0
    currentPhaseRef.current = 'triage'
    currentScopeRef.current = ''
    scopeQueueRef.current = []
    completedScopeRef.current = []
    prevScopeRef.current = ''
    qualifyingFieldsRef.current = {}
    uploadWidgetInjectedRef.current = false
    // Reset state — blank slate
    setMessages([])
    setDetectedScope([])
    setConfidenceScore(0)
    setComplexityMultiplier(1.0)
    setPriceRange({ min: 0, max: 0 })
    setIsStreaming(false)
    setProjectOverview('')
    setScopeSummaries({})
    setProjectName('')
    setIsPaused(false)
    isPausedRef.current = false
    setPausedQuestion(null)
    pausedQRRef.current = null
    setJourneyMode('')
    journeyModeRef.current = ''
    setCurrentPhase('triage')
    setCurrentScope('')
    setScopeQueue([])
    setCompletedScope([])
  }, [proposalId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Upgrade from quick estimate to full consultation.
  // Carries over all Core Four + detected scope, sends a synthetic message
  // so the AI picks up with the remaining discovery questions.
  const upgradeToFull = useCallback(() => {
    setJourneyMode('upgraded')
    journeyModeRef.current = 'upgraded'
    if (proposalId) localStorage.setItem(JOURNEY_MODE_KEY(proposalId), 'upgraded')
    // Send synthetic user message to trigger the upgrade flow
    sendMessage("I'd like to refine this estimate with more details", 'Dig deeper')
  }, [proposalId, sendMessage])

  return {
    messages,
    detectedScope,
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
    currentPhase,
    currentScope,
    scopeQueue,
    completedScope,
    journeyMode,
    upgradeToFull,
    isAdminActive,
    handleFileUploaded,
    handleFileUploadDone,
    handleFileUploadSkipped,
    pickerHints,
  }
}
