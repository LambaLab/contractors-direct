import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { UPDATE_PROPOSAL_TOOL } from '@/lib/ai/tools'
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt'
import { getPricingSummary } from '@/lib/pricing/historical'
import type { HistoricalPricingStat } from '@/lib/pricing/historical'
import { calculateEstimate } from '@/lib/estimator/calculate'
import { intakeToEstimatorInputs, type ProjectNature } from '@/lib/estimator/fromIntake'
import type { FinishLevel } from '@/lib/estimator/types'

// Location cost factor, matches lib/pricing/engine.ts LOCATION_FACTORS.
// Duplicated here because engine's applyLocationFactor works on PriceRange, not scalar.
const LOCATION_FACTORS: Record<string, number> = {
  dubai: 1.0,
  abu_dhabi: 0.95,
  sharjah: 0.85,
  ajman: 0.80,
  ras_al_khaimah: 0.80,
  fujairah: 0.75,
  umm_al_quwain: 0.75,
}

function locationFactor(location: string): number {
  const lower = location.toLowerCase()
  for (const [key, val] of Object.entries(LOCATION_FACTORS)) {
    if (lower.includes(key.replace(/_/g, ' ')) || lower.includes(key.replace(/_/g, ''))) {
      return val
    }
  }
  return 1.0
}

const VALID_NATURES: ProjectNature[] = [
  'refresh',
  'partial_renovation',
  'full_renovation',
  'extension',
  'new_build',
]
const VALID_FINISH: FinishLevel[] = ['basic', 'standard', 'premium', 'luxury']

// Extend Vercel serverless function timeout to 60 s (max on Hobby, well within Pro).
// Without this, Vercel's default 10 s timeout kills the function mid-stream and
// the client receives an empty response with the loading spinner stuck on.
export const maxDuration = 60

const anthropic = new Anthropic()

const MAX_MESSAGES = 50
const MAX_RETRIES = 2

// Classify Anthropic errors into actionable categories for the client.
function classifyError(err: unknown): { code: string; message: string; retryable: boolean } {
  if (err instanceof Anthropic.AuthenticationError) {
    return { code: 'auth_error', message: 'AI service authentication failed. Please contact support.', retryable: false }
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { code: 'rate_limit', message: 'AI service is busy. Retrying...', retryable: true }
  }
  if (err instanceof Anthropic.APIError) {
    // 529 = overloaded, 500/502/503 = transient server errors
    if (err.status === 529 || err.status === 500 || err.status === 502 || err.status === 503) {
      return { code: 'overloaded', message: 'AI service is temporarily overloaded. Retrying...', retryable: true }
    }
    if (err.status === 400) {
      return { code: 'bad_request', message: 'Message could not be processed. Try shortening your message.', retryable: false }
    }
    return { code: 'api_error', message: `AI service error (${err.status}). Please try again.`, retryable: false }
  }
  return { code: 'unknown', message: 'Something went wrong. Please try again.', retryable: false }
}

export async function POST(req: NextRequest) {
  const {
    messages,
    paused,
    journeyMode: clientJourneyMode,
    confidenceScore: clientConfidence,
    currentPhase: clientPhase,
    currentScope: clientScope,
    scopeQueue: clientQueue,
    completedScope: clientCompleted,
    turnCount: clientTurnCount,
    knownFields: clientKnownFields,
  } = await req.json()
  const isPaused = paused === true
  const journeyMode = typeof clientJourneyMode === 'string' ? clientJourneyMode : ''
  const currentConfidence = typeof clientConfidence === 'number' ? clientConfidence : 0
  const phase = typeof clientPhase === 'string' ? clientPhase : 'triage'
  const currentScope = typeof clientScope === 'string' ? clientScope : ''
  const queue = Array.isArray(clientQueue) ? clientQueue : []
  const completed = Array.isArray(clientCompleted) ? clientCompleted : []
  const turns = typeof clientTurnCount === 'number' ? clientTurnCount : 0
  const knownFields = (clientKnownFields && typeof clientKnownFields === 'object') ? clientKnownFields as Record<string, unknown> : {}

  // Build a list of fields that have already been extracted from prior turns.
  // We inject these into the system prompt so the AI explicitly skips any
  // checklist question whose answer is already known, instead of relying on
  // the model to reason from the raw chat history (which is unreliable).
  const knownFieldLines: string[] = []
  const kf = knownFields
  if (typeof kf.property_type === 'string' && kf.property_type) knownFieldLines.push(`- property_type: "${kf.property_type}" (SKIP "what type of project" question)`)
  if (typeof kf.project_nature === 'string' && kf.project_nature) knownFieldLines.push(`- project_nature: "${kf.project_nature}" (SKIP "renovate vs build" question)`)
  if (typeof kf.finish_level === 'string' && kf.finish_level) knownFieldLines.push(`- finish_level: "${kf.finish_level}" (SKIP finish question)`)
  if (typeof kf.location === 'string' && kf.location) knownFieldLines.push(`- location: "${kf.location}" (SKIP location/area question)`)
  if (typeof kf.size_sqft === 'number' && kf.size_sqft > 0) knownFieldLines.push(`- size_sqft: ${kf.size_sqft} (SKIP size question)`)
  if (typeof kf.condition === 'string' && kf.condition) knownFieldLines.push(`- condition: "${kf.condition}" (SKIP condition question)`)
  if (typeof kf.style_preference === 'string' && kf.style_preference) knownFieldLines.push(`- style_preference: "${kf.style_preference}" (SKIP style question)`)
  if (typeof kf.ownership === 'string' && kf.ownership) knownFieldLines.push(`- ownership: "${kf.ownership}" (SKIP ownership question)`)
  if (typeof kf.budget_aed_stated === 'number' && kf.budget_aed_stated > 0) knownFieldLines.push(`- budget_aed_stated: ${kf.budget_aed_stated} (SKIP budget question)`)
  if (typeof kf.has_floor_plans === 'string' && kf.has_floor_plans) knownFieldLines.push(`- has_floor_plans: "${kf.has_floor_plans}" (SKIP floor plans question)`)

  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return new Response(JSON.stringify({ error: 'Invalid messages' }), { status: 400 })
  }

  // Fetch historical pricing summary (cached materialized view, fast query).
  // This is injected into the system prompt so the AI has real market context,
  // and also sent to the client via SSE for data-driven ballpark pricing.
  let pricingContext = ''
  let historicalStats: HistoricalPricingStat[] = []
  try {
    historicalStats = await getPricingSummary()
    if (historicalStats.length > 0) {
      const lines = historicalStats
        .filter(s => s.sample_count >= 2)
        .map(s => `  ${s.scope_item_id}: ${s.rate_p25.toFixed(0)}-${s.rate_p75.toFixed(0)} AED/${s.unit ?? 'unit'} (${s.sample_count} projects)`)
      if (lines.length > 0) {
        pricingContext = [
          '\n## Historical Pricing (internal reference, do NOT quote exact figures to clients)',
          ...lines,
        ].join('\n')
      }
    }
  } catch {
    // Silently continue without historical context if query fails
  }

  const streamParams = {
    model: process.env.INTAKE_MODEL || 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system: [
      {
        type: 'text' as const,
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' as const },
      },
      // Inject current phase state so the AI knows where it is across turns
      // (it can't see its own tool outputs in message history).
      {
        type: 'text' as const,
        text: [
          `\n## Current Conversation State`,
          `Journey mode: ${journeyMode || 'not selected'}`,
          `Phase: ${phase}`,
          `Discovery turn: ${phase === 'discovery' || phase === 'quick_discovery' ? turns + 1 : 'N/A (already in ' + phase + ')'}`,
          `Current scope: ${currentScope || 'none'}`,
          `Scope queue: ${queue.length > 0 ? queue.join(', ') : 'empty'}`,
          `Completed scopes: ${completed.length > 0 ? completed.join(', ') : 'none'}`,
          `Confidence: ${currentConfidence}%`,
          // Already-extracted fields: explicit list of answers we already have.
          // The AI MUST skip any checklist item whose answer is in this list,
          // confirm the value in follow_up_question, and move to the next unanswered item.
          ...(knownFieldLines.length > 0 ? [
            `\n## Already-Extracted Fields (DO NOT RE-ASK)`,
            ...knownFieldLines,
            `\nThese values are already captured from earlier in the conversation. You MUST NOT ask a question or show a picker for any of these fields. In your tool call, set each of these fields to the value shown above so they persist. In follow_up_question, briefly confirm what you already know (e.g. "Got it, a ${typeof kf.size_sqft === 'number' && kf.size_sqft > 0 ? kf.size_sqft + ' sqft ' : ''}${typeof kf.property_type === 'string' ? kf.property_type : 'project'}."), then ask the NEXT unanswered item from the checklist. If every checklist item for the current phase is already answered, set question to "" (empty string) so the client can advance.`,
          ] : []),
          // Remind AI to update project_overview on every qualifying turn
          ...(turns >= 1 && phase !== 'triage' ? [
            `\n-- IMPORTANT: You MUST set project_overview to a non-empty string on this turn. Summarize the project as understood so far (property type, location, size, condition, scope). Do NOT return an empty string for project_overview unless this is the triage turn.`,
          ] : []),
          // Turn 0: skip triage divider, go straight to Quick Discovery
          ...((phase === 'triage' || phase === 'quick_discovery') && turns === 0 ? [
            `\n-- TURN 0 INSTRUCTION: This is the user's first message. Skip the triage journey divider entirely. Default to Quick Discovery. Set current_phase: "quick_discovery", journey_mode: "quick". Extract every field you can from their message (project_nature, property_type, size_sqft, finish_level, location). Set each on the tool call. Acknowledge in 1 short sentence what you understood. Then ask the FIRST unanswered hard key (project_nature, then property_type, then size_sqft, in that order). Do NOT present a "Quick Estimate vs Full Consultation" choice.`,
          ] : []),
          // Quick discovery mode
          ...(phase === 'quick_discovery' ? [
            `\n-- QUICK DISCOVERY MODE: Ask only for the 3 HARD keys if still missing (project_nature, property_type, size_sqft), in that order. Finish_level and location are OPTIONAL in this flow; default to standard / Dubai unless the user mentions them. Never ask about condition. Never show a scope grid; auto-populate detected_scope based on project_nature (new_build: []; full_renovation: ["flooring","paint_walls","false_ceiling","electrical","plumbing"]; partial_renovation: ["paint_walls","electrical","plumbing","flooring"]; refresh: ["paint_walls","electrical","plumbing"]; extension: ["paint_walls","electrical","plumbing"]). Once all 3 hard keys are captured, set question to "" (empty string) so the client can show the ballpark card.`,
          ] : []),
          // Upgrade from quick to full
          ...(journeyMode === 'upgraded' ? [
            `\n-- UPGRADE INSTRUCTION: The user has upgraded from Quick Estimate. Core Four fields are already populated (property_type, location, size_sqft, condition) and detected_scope is set. Set journey_mode: "full". Skip items 1, 2, 4, 6 of the Priority Checklist. Ask items 3 (ownership), 5 (floor plans), 7 (budget), 8 (full scope probing), then transition to deep_dive.`,
          ] : []),
          // Guard: if there are remaining scopes in queue, strongly prevent wrap_up
          ...(queue.filter(m => !completed.includes(m)).length > 0 && phase === 'deep_dive' ? [
            `\n-- There are ${queue.filter(m => !completed.includes(m)).length} scopes still in the queue that have NOT been discussed: ${queue.filter(m => !completed.includes(m)).join(', ')}. You MUST continue deep_dive with the next scope. Do NOT set current_phase to "wrap_up".`,
          ] : []),
          // Turn 1 in full discovery: stay in discovery and walk the Priority Question Checklist.
          ...(phase === 'discovery' && turns === 0 && journeyMode !== 'upgraded' ? [
            `\n-- TURN 1 INSTRUCTION: This is the user's first discovery turn. You are in Phase 1 Discovery. FIRST: Parse the user's opening message and extract ALL field values mentioned (property_type, location, size_sqft, condition, budget_aed_stated, etc.). Set every detected field in your tool call. Confirm what you extracted in follow_up_question (e.g. "3,500 sq ft shell-and-core office in JLT with a 2.5-3M AED budget, great starting point."). Then ask the FIRST unanswered checklist item. Do NOT re-ask fields the user already stated. Do NOT jump to deep_dive yet, deep_dive only happens after item 8 (full scope probing).`,
          ] : []),
          // Force transition when discovery has gone too long
          ...(phase === 'discovery' && turns >= 8 ? [
            `\n-- IMPORTANT: You are on discovery turn ${turns + 1}. Discovery should have ended by turn 9 (the Priority Checklist is 8 items + 1 upload handoff). On THIS turn, set current_phase: "deep_dive", set current_scope to the first detected scope, and set scope_queue to the full ordered list. Do NOT list scope names in follow_up_question, the UI shows a visual checklist card automatically.`,
          ] : []),
          ...(phase === 'discovery' && turns >= 10 ? [
            `\n-- MANDATORY: You have exceeded the maximum discovery turns. You MUST set current_phase to "deep_dive" NOW. Do NOT set current_phase to "discovery".`,
          ] : []),
        ].join('\n') + pricingContext,
      },
      ...(isPaused ? [{
        type: 'text' as const,
        text: `OVERRIDE: The user has paused auto-questions. They want to chat freely. Current proposal confidence: ${currentConfidence}%.

Still call update_proposal with all metadata fields (detected_scope, confidence_score_delta, updated_brief, project_overview, scope_summaries, project_name). Set follow_up_question to your full conversational response. Set question to "" (empty string). Do NOT set suggest_pause.

## Intent Detection & Action Pills (IMPORTANT)

When the user asks something while paused, detect their INTENT. If the intent maps to a clear action, include quick_replies with style: "pills" so the user gets clickable action buttons. Set question to "" still.

Intent patterns:
- WANTS TO SEE PROGRESS / PROPOSAL (e.g. "what have we agreed on?", "show me what we have", "what does the proposal look like?", "how far along are we?", "what's been decided?"): Acknowledge warmly, then include pills: [{ label: "View Proposal", value: "__view_proposal__" }, { label: "Keep going", value: "__continue__" }]
- WANTS TO RESUME (e.g. "let's continue", "back to questions", "ready to keep going"): Set suggest_resume: true
- PROCESS / META questions (e.g. "how many more questions?", "how long will this take?", "are we almost done?", "what's left?", "how much more do you need from me?"): Answer helpfully with a concrete estimate (e.g. "About 3-5 more questions to get to a solid proposal") based on current confidence. Reference what's been covered and what's still unknown. ALWAYS include pills: [{ label: "Keep going", value: "__continue__" }, { label: "View Proposal", value: "__view_proposal__" }]
- UNCLEAR INTENT (e.g. vague or ambiguous message): Acknowledge politely, ask a clarifying question, and include 2-3 pills with likely actions

CRITICAL RULE: EVERY response while paused must end with a clear call to action. Either include quick_replies pills or end with an explicit question/invitation. NEVER leave the user in a dead end with no next step. If you answer a question, always follow up with "Want to keep going?" or similar, and include pills.

## How to handle questions while paused

You are a sharp construction/project consultant. Give real, useful answers based on what you know so far. Be honest about what you can and cannot answer yet. ALWAYS end with a call to action and include pills so the user has a clear next step.

PRICING / BUDGET questions (e.g. "how much will this cost?", "what's the budget?", "can you put a price on this?"):
- If confidence < 50%: You don't have enough info yet. Say something like: "I'd love to give you a number, but at ${currentConfidence}% confidence I'd just be guessing. A few more questions about [name 1-2 specific unknowns like 'material specs' or 'site conditions'] would let me put a real range together."
- If confidence >= 50%: Give a rough directional sense ("Based on what we've covered, this looks like a mid-range build") but note it would sharpen with more detail.
- ALWAYS include pills: [{ label: "Keep going", value: "__continue__" }, { label: "View Proposal", value: "__view_proposal__" }]

TIMELINE questions (e.g. "how long will this take?"):
- If confidence < 50%: "Timeline depends on scope, and we're still early on defining that."
- If confidence >= 50%: Give a rough range ("Typically 8-12 weeks for something like this") with the caveat that it sharpens with more detail.
- ALWAYS include pills: [{ label: "Keep going", value: "__continue__" }, { label: "View Proposal", value: "__view_proposal__" }]

MATERIALS / SPEC questions (e.g. "should I use marble?", "what grade of concrete?"):
- Give a real opinion based on what you know. Reference their specific project. "For a villa in this climate, porcelain tiles are a durable and cost-effective alternative to natural stone for the ground floor."
- Include pills: [{ label: "Keep going", value: "__continue__" }]

FEASIBILITY questions (e.g. "is this possible?", "is this too complex?"):
- Be honest. If it's straightforward, say so. If it's ambitious, name why. Reference comparable projects.
- Include pills: [{ label: "Keep going", value: "__continue__" }, { label: "View Proposal", value: "__view_proposal__" }]

GENERAL PROJECT questions (e.g. "what do you think about X?", "should I add Y?"):
- Give your opinion as a construction/project consultant would. Be direct. Reference what you know about their project.
- Include pills: [{ label: "Keep going", value: "__continue__" }]

## Resume flow
When you suggest resuming and the user responds affirmatively (e.g. "yes", "sure", "ok", "let's do it", "yeah"), set suggest_resume: true. The client will automatically resume structured Q&A. Do NOT set suggest_resume on the turn where you suggest it, only when the user confirms.

When suggesting to resume, always frame it as an invitation, not a demand. "Want to pick up where we left off?" or "Ready to continue?" Never pressure.`,
      }] : []),
    ],
    tools: [UPDATE_PROPOSAL_TOOL],
    tool_choice: { type: 'any' },
    messages,
  } as Parameters<typeof anthropic.messages.stream>[0]

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ event, data })}\n\n`)
        )
      }

      // Send historical pricing stats to the client for data-driven ballpark
      if (historicalStats.length > 0) {
        send('pricing_stats', historicalStats)
      }

      // Retry loop for transient Anthropic API errors (429, 529, 5xx).
      // On the first attempt we stream normally. If a retryable error occurs
      // before any text was sent to the client, we wait briefly and retry.
      let lastError: unknown = null
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          // Exponential backoff: 1s, 2s
          await new Promise(r => setTimeout(r, 1000 * attempt))
          console.warn(`Anthropic API retry attempt ${attempt}/${MAX_RETRIES}`)
        }

        const stream = anthropic.messages.stream(streamParams)

      // Buffer tool input JSON as it streams so we can send tool_result
      // the moment the block ends -- no need to wait for finalMessage().
      let toolInputBuffer = ''
      let currentToolName = ''
      let toolResultSent = false

      // Streaming extraction of follow_up_question from the tool JSON delta.
      // follow_up_question is the first field in the schema so it generates first.
      // As its characters arrive we forward them as text events -- the client sees
      // the reaction text appear in real time instead of waiting for the full JSON.
      let fupState: 'search' | 'stream' | 'done' = 'search'
      let fupCursor = 0   // position in toolInputBuffer up to which we have streamed
      let fupEscaped = false

      function streamFollowUpChars() {
        if (fupState === 'done') return

        if (fupState === 'search') {
          const FIELD = '"follow_up_question"'
          const fi = toolInputBuffer.indexOf(FIELD)
          if (fi === -1) return
          // Advance past the field name, colon, and any whitespace to the opening quote
          let i = fi + FIELD.length
          while (i < toolInputBuffer.length && toolInputBuffer[i] !== '"') i++
          if (i >= toolInputBuffer.length) return  // opening quote not yet in buffer
          fupCursor = i + 1  // position right after the opening quote
          fupState = 'stream'
        }

        // Stream characters of the value until the closing unescaped quote
        while (fupCursor < toolInputBuffer.length) {
          const ch = toolInputBuffer[fupCursor++]
          if (fupEscaped) {
            if      (ch === 'n')  send('text', { text: '\n' })
            else if (ch === '"')  send('text', { text: '"' })
            else if (ch === '\\') send('text', { text: '\\' })
            else if (ch === 't')  send('text', { text: '\t' })
            else if (ch === 'u' && fupCursor + 4 <= toolInputBuffer.length) {
              // \uXXXX unicode escape
              const code = parseInt(toolInputBuffer.slice(fupCursor, fupCursor + 4), 16)
              if (!isNaN(code)) send('text', { text: String.fromCharCode(code) })
              fupCursor += 4
            }
            // else: unknown escape -- skip
            fupEscaped = false
          } else if (ch === '\\') {
            fupEscaped = true
          } else if (ch === '"') {
            fupState = 'done'  // reached end of follow_up_question value
            break
          } else {
            send('text', { text: ch })
          }
        }
      }

      // transition_text streaming -- runs after fupState === 'done'.
      // transition_text is optional (model may produce "" or omit it entirely).
      // When non-empty, we send a bubble_split event first so the client creates a
      // second assistant message, then stream the transition chars as text events
      // into that second bubble.  When empty or absent, txState resolves to 'empty'
      // immediately and everything behaves exactly as before (one bubble).
      //
      // States:
      //   'search' -- scanning buffer for "transition_text" or "question" key
      //   'split'  -- found opening quote; peeking at first char to decide
      //   'stream' -- streaming non-empty value chars as text events (bubble 2)
      //   'done'   -- closing quote reached; transition complete
      //   'empty'  -- model produced "" or skipped the field; no second bubble
      let txState: 'search' | 'split' | 'stream' | 'done' | 'empty' = 'search'
      let txCursor = 0
      let txEscaped = false
      let bubbleSplitSent = false

      // Early question detection: as soon as the question field is complete in the
      // buffer (but before quick_replies), fire a partial_question event so the client
      // can show the QR card skeleton with the question header immediately -- cutting
      // the perceived dead time between reaction text finishing and options appearing.
      let partialQuestionSent = false

      function streamTransitionChars() {
        // Only runs once follow_up_question is fully streamed
        if (fupState !== 'done') return
        if (txState === 'done' || txState === 'empty') return

        if (txState === 'search') {
          const TX_FIELD = '"transition_text"'
          const Q_FIELD  = '"question"'
          const txi = toolInputBuffer.indexOf(TX_FIELD)
          const qi  = toolInputBuffer.indexOf(Q_FIELD)
          if (txi === -1 && qi === -1) return  // neither visible yet
          // If "question" appears before "transition_text" the model skipped it
          if (qi !== -1 && (txi === -1 || qi < txi)) { txState = 'empty'; return }
          // transition_text key found -- advance past key, colon, whitespace to opening quote
          let i = txi + TX_FIELD.length
          while (i < toolInputBuffer.length && toolInputBuffer[i] !== '"') i++
          if (i >= toolInputBuffer.length) return  // opening quote not yet in buffer
          txCursor = i + 1  // position right after opening quote
          txState = 'split'
        }

        if (txState === 'split') {
          if (txCursor >= toolInputBuffer.length) return
          if (toolInputBuffer[txCursor] === '"') { txState = 'empty'; return }  // empty string ""
          // Non-empty value -- fire bubble_split once, then start streaming chars
          if (!bubbleSplitSent) { send('bubble_split', {}); bubbleSplitSent = true }
          txState = 'stream'
        }

        if (txState === 'stream') {
          while (txCursor < toolInputBuffer.length) {
            const ch = toolInputBuffer[txCursor++]
            if (txEscaped) {
              if      (ch === 'n')  send('text', { text: '\n' })
              else if (ch === '"')  send('text', { text: '"' })
              else if (ch === '\\') send('text', { text: '\\' })
              else if (ch === 't')  send('text', { text: '\t' })
              else if (ch === 'u' && txCursor + 4 <= toolInputBuffer.length) {
                const code = parseInt(toolInputBuffer.slice(txCursor, txCursor + 4), 16)
                if (!isNaN(code)) send('text', { text: String.fromCharCode(code) })
                txCursor += 4
              }
              // else: unknown escape -- skip char
              txEscaped = false
            } else if (ch === '\\') {
              txEscaped = true
            } else if (ch === '"') {
              txState = 'done'; break
            } else {
              send('text', { text: ch })
            }
          }
        }
      }

      function tryEmitPartialQuestion() {
        if (isPaused) return  // No QR when paused
        if (partialQuestionSent || partialResultSent) return
        if (fupState !== 'done') return
        if (txState !== 'done' && txState !== 'empty') return

        // On pause turns, don't emit -- the checkpoint message handles the question
        const spMatch = toolInputBuffer.match(/"suggest_pause"\s*:\s*(true|false)/)
        if (spMatch?.[1] === 'true') return
        // If suggest_pause hasn't appeared and question hasn't either, still early
        if (!spMatch && !toolInputBuffer.includes('"question"')) return

        const question = extractStringField('question')
        if (question === null) return

        send('partial_question', { question })
        partialQuestionSent = true
      }

      // Partial-result detection: question and quick_replies come after transition_text
      // in the schema order, so they generate after the transition is done.
      // As soon as both are complete in the buffer (and txState is terminal), send a
      // partial_result event so the client can show the QR card without waiting for
      // the full JSON (which includes the heavy project_overview and scope_summaries).
      let partialResultSent = false

      // Partial-scopes detection: detected_scope comes right after quick_replies
      // in the schema so it generates within ~100ms of the QR card appearing.
      // Fire partial_scopes as soon as the array is complete -- this makes the scope
      // cards appear immediately instead of waiting for project_overview and
      // scope_summaries (which can add 4-6 extra seconds before tool_result fires).
      let partialScopesSent = false

      function tryEmitPartialScopes() {
        // Only fire after the QR card is visible, and only once per turn
        if (partialScopesSent || !partialResultSent) return

        const detectedScope = extractArrayField('detected_scope')
        if (detectedScope === null) return  // array not yet complete in buffer

        send('partial_scopes', { detected_scope: detectedScope })
        partialScopesSent = true
      }

      // Extract a complete JSON string value for the given field name from the buffer.
      // Returns the decoded string, or null if the value is not yet fully present.
      function extractStringField(fieldName: string): string | null {
        const FIELD = `"${fieldName}"`
        const fi = toolInputBuffer.indexOf(FIELD)
        if (fi === -1) return null
        let i = fi + FIELD.length
        // Skip colon and whitespace to opening quote
        while (i < toolInputBuffer.length && toolInputBuffer[i] !== '"') i++
        if (i >= toolInputBuffer.length) return null
        i++ // past opening quote
        let value = ''
        let escaped = false
        while (i < toolInputBuffer.length) {
          const ch = toolInputBuffer[i++]
          if (escaped) {
            if      (ch === 'n')  value += '\n'
            else if (ch === '"')  value += '"'
            else if (ch === '\\') value += '\\'
            else if (ch === 't')  value += '\t'
            else if (ch === 'u' && i + 3 < toolInputBuffer.length) {
              const code = parseInt(toolInputBuffer.slice(i, i + 4), 16)
              if (!isNaN(code)) value += String.fromCharCode(code)
              i += 4
            }
            escaped = false
          } else if (ch === '\\') {
            escaped = true
          } else if (ch === '"') {
            return value  // closing quote found -- value is complete
          } else {
            value += ch
          }
        }
        return null  // closing quote not yet in buffer
      }

      // Extract a complete JSON array value for the given field name from the buffer.
      // Uses bracket depth tracking to find the closing ]. Returns the parsed array,
      // or null if the array is not yet fully present in the buffer.
      function extractArrayField(fieldName: string): unknown[] | null {
        const FIELD = `"${fieldName}"`
        const fi = toolInputBuffer.indexOf(FIELD)
        if (fi === -1) return null
        let i = fi + FIELD.length
        // Skip colon and whitespace to opening bracket
        while (i < toolInputBuffer.length && toolInputBuffer[i] !== '[') i++
        if (i >= toolInputBuffer.length) return null
        const start = i
        let depth = 0
        let inStr = false
        let strEsc = false
        let end = -1
        for (let j = start; j < toolInputBuffer.length; j++) {
          const ch = toolInputBuffer[j]
          if (inStr) {
            if (strEsc)           { strEsc = false }
            else if (ch === '\\') { strEsc = true }
            else if (ch === '"')  { inStr = false }
          } else {
            if      (ch === '"')              { inStr = true }
            else if (ch === '{' || ch === '[') { depth++ }
            else if (ch === '}' || ch === ']') {
              depth--
              if (depth === 0) { end = j; break }
            }
          }
        }
        if (end === -1) return null
        try {
          return JSON.parse(toolInputBuffer.slice(start, end + 1)) as unknown[]
        } catch {
          return null
        }
      }

      // Extract a complete JSON object value for the given field name from the buffer.
      // Uses brace/bracket depth tracking to find the closing }. Returns the parsed
      // object, or null if the object is not yet fully present.
      function extractObjectField(fieldName: string): Record<string, unknown> | null {
        const FIELD = `"${fieldName}"`
        const fi = toolInputBuffer.indexOf(FIELD)
        if (fi === -1) return null
        let i = fi + FIELD.length
        // Skip colon and whitespace to opening brace
        while (i < toolInputBuffer.length && toolInputBuffer[i] !== '{') i++
        if (i >= toolInputBuffer.length) return null
        const start = i
        let depth = 0
        let inStr = false
        let strEsc = false
        let end = -1
        for (let j = start; j < toolInputBuffer.length; j++) {
          const ch = toolInputBuffer[j]
          if (inStr) {
            if (strEsc)       { strEsc = false }
            else if (ch === '\\') { strEsc = true }
            else if (ch === '"')  { inStr = false }
          } else {
            if      (ch === '"')              { inStr = true }
            else if (ch === '{' || ch === '[') { depth++ }
            else if (ch === '}' || ch === ']') {
              depth--
              if (depth === 0) { end = j; break }
            }
          }
        }
        if (end === -1) return null
        try {
          return JSON.parse(toolInputBuffer.slice(start, end + 1)) as Record<string, unknown>
        } catch {
          return null
        }
      }

      function tryEmitPartialResult() {
        // Allow pills-style QR through when paused (for intent-based action buttons)
        if (partialResultSent || fupState !== 'done') return
        // Block until transition_text is resolved -- QR card must not appear while
        // the second bubble is still streaming (it would flash in mid-sentence)
        if (txState !== 'done' && txState !== 'empty') return

        // suggest_pause is optional (not in the required array), so the model sometimes
        // omits it entirely. The field comes before question in the schema, so if question
        // is already in the buffer, suggest_pause was either generated already or skipped.
        // Strategy:
        //   - suggest_pause not found AND question not found -> genuinely early, wait
        //   - suggest_pause not found BUT question found    -> model skipped it, treat as false
        //   - suggest_pause = true                          -> suppress partial_result (pause turn)
        //   - suggest_pause = false                         -> proceed normally
        const suggestPauseMatch = toolInputBuffer.match(/"suggest_pause"\s*:\s*(true|false)/)
        if (suggestPauseMatch === null) {
          // Model hasn't generated suggest_pause yet. If question is also absent we're
          // still early in generation -- wait. If question IS present, the model skipped
          // suggest_pause (it's optional). Treat as false and proceed.
          if (!toolInputBuffer.includes('"question"')) return
          // fall through -- treat suggest_pause as false
        } else if (suggestPauseMatch[1] === 'true') {
          // Pause turn: the checkpoint is created in tool_result on the client.
          // Suppressing partial_result here prevents QRs from being attached to the
          // reaction bubble prematurely and keeps isStreaming=true until the checkpoint
          // message exists and isStreaming is reset by the tool_result handler.
          send('debug', { why: 'suppressed_pause' })
          partialResultSent = true
          return
        }

        const question = extractStringField('question')
        if (question === null) return

        const quickReplies = extractObjectField('quick_replies')
        if (quickReplies === null) return

        // Validate quick_replies has at least one option (except scope_grid/sqft/budget which use empty options)
        const options = quickReplies.options
        const selfRendering = quickReplies.style === 'scope_grid' || quickReplies.style === 'sqft' || quickReplies.style === 'budget'
        if (!selfRendering && (!Array.isArray(options) || options.length === 0)) {
          send('debug', { why: 'invalid_options', opts: JSON.stringify(options ?? null).slice(0, 100) })
          partialResultSent = true  // invalid QR -- don't retry; full tool_result will handle
          return
        }

        send('partial_result', { question, quick_replies: quickReplies, suggest_pause: false })
        partialResultSent = true
      }

      try {
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_start') {
            if (chunk.content_block.type === 'tool_use') {
              currentToolName = chunk.content_block.name
              toolInputBuffer = ''
              // Reset fup extraction state for each new tool block
              fupState = 'search'
              fupCursor = 0
              fupEscaped = false
              partialResultSent = false
              partialScopesSent = false
              // Reset transition_text extraction state
              txState = 'search'
              txCursor = 0
              txEscaped = false
              bubbleSplitSent = false
              partialQuestionSent = false
            }
          } else if (chunk.type === 'content_block_delta') {
            if (chunk.delta.type === 'text_delta') {
              send('text', { text: chunk.delta.text })
            } else if (chunk.delta.type === 'input_json_delta') {
              toolInputBuffer += chunk.delta.partial_json
              // 1. Stream follow_up_question chars as text events (bubble 1)
              streamFollowUpChars()
              // 2. Stream transition_text chars as text events (bubble 2, if present)
              //    Also fires bubble_split event to create the second bubble on the client
              streamTransitionChars()
              // 3. As soon as the question field is complete, fire partial_question so
              //    the client can show the QR card skeleton before options are ready
              tryEmitPartialQuestion()
              // 4. Once question + quick_replies are both complete, fire partial_result
              //    completing so we can show the QR card without waiting for full JSON
              tryEmitPartialResult()
              // 5. Once QR card is shown, watch for detected_scope completing so we
              //    can update the scope panel immediately -- before the heavy
              //    project_overview and scope_summaries fields finish generating
              tryEmitPartialScopes()
            }
          } else if (chunk.type === 'content_block_stop') {
            // Diagnostic: capture state at end of tool block to understand partial_result behaviour
            if (currentToolName && !partialResultSent) {
              const spMatch = toolInputBuffer.match(/"suggest_pause"\s*:\s*(true|false)/)
              send('debug', {
                why: 'no_partial_result_at_stop',
                fup: fupState,
                tx: txState,
                suggestPause: spMatch?.[1] ?? null,
                hasQ: toolInputBuffer.includes('"question"'),
                hasQR: toolInputBuffer.includes('"quick_replies"'),
                bufLen: toolInputBuffer.length,
              })
            }
            // Tool block finished -- parse buffered JSON and send result immediately
            if (currentToolName && toolInputBuffer) {
              try {
                const input = JSON.parse(toolInputBuffer)
                send('tool_result', { name: currentToolName, input })
                toolResultSent = true

                // Compute estimator ballpark if the 3 hard keys are present
                // (merging this turn's tool output with fields already known).
                if (currentToolName === 'update_proposal') {
                  const rawNature = typeof input.project_nature === 'string' && input.project_nature
                    ? input.project_nature
                    : (typeof kf.project_nature === 'string' ? kf.project_nature : '')
                  const rawProperty = typeof input.property_type === 'string' && input.property_type
                    ? input.property_type
                    : (typeof kf.property_type === 'string' ? kf.property_type : '')
                  const rawSize = typeof input.size_sqft === 'number' && input.size_sqft > 0
                    ? input.size_sqft
                    : (typeof kf.size_sqft === 'number' ? kf.size_sqft : 0)
                  const rawFinish = typeof input.finish_level === 'string' && input.finish_level
                    ? input.finish_level
                    : (typeof kf.finish_level === 'string' ? kf.finish_level : '')
                  const rawLocation = typeof input.location === 'string' && input.location
                    ? input.location
                    : (typeof kf.location === 'string' ? kf.location : '')

                  // Project nature: prefer the AI's value, otherwise infer from
                  // the question's free-text reply, otherwise fall back to a safe
                  // default. We deliberately do NOT gate the ballpark on nature
                  // being explicitly set — Haiku often drops it, and the user
                  // expects to see a card as soon as property + size are in.
                  const conversationBlob = messages
                    .filter((m: { role: string }) => m.role === 'user')
                    .map((m: { content: unknown }) => typeof m.content === 'string' ? m.content : '')
                    .join(' ')
                    .toLowerCase()

                  let nature: ProjectNature | null = VALID_NATURES.includes(rawNature as ProjectNature)
                    ? (rawNature as ProjectNature)
                    : null
                  if (!nature) {
                    // Scan the conversation for strong nature signals.
                    if (/new\s*build|build (a|an|the)?\s*(villa|home|house)|ground.up/.test(conversationBlob)) nature = 'new_build'
                    else if (/extension|extend|add (a|an)?\s*(room|floor)/.test(conversationBlob)) nature = 'extension'
                    else if (/full (reno|overhaul|renovation)|gut|complete reno/.test(conversationBlob)) nature = 'full_renovation'
                    else if (/light refresh|just paint|cosmetic|refresh/.test(conversationBlob)) nature = 'refresh'
                    else if (/partial|kitchen reno|bathroom reno|specific rooms/.test(conversationBlob)) nature = 'partial_renovation'
                  }
                  const natureUsed: ProjectNature = nature ?? 'partial_renovation'
                  const assumedNature = !nature
                  const finish = VALID_FINISH.includes(rawFinish as FinishLevel)
                    ? (rawFinish as FinishLevel)
                    : 'standard'

                  // Single-room scope detection. The user might be talking about
                  // ONE room (not a whole property). Without this guard the
                  // calculator counts every room in the property and produces
                  // wildly inflated numbers (e.g. AED 433k for a "kitchen
                  // revamp" because it priced the whole 5-room townhouse).
                  //
                  // Room-action verbs that indicate single-room intent. Broad
                  // on purpose — covers revamp, redo, reno, renovation, refresh,
                  // remodel, upgrade, makeover. The size is NOT a gate: the
                  // user's stated sqft is usually the whole-property size, not
                  // the room they want to touch.
                  const ROOM_VERBS = '(?:revamp|redo|reno|renovate|renovation|refresh|remodel|upgrade|makeover|only|update|fix(?:ing)? up|paint(?:ing)?|repaint|touch[\\s-]?up|spruce[\\s-]?up|freshen[\\s-]?up|do[\\s-]?up|overhaul)'
                  // Modifier slot: lets phrasings like "the master bedroom",
                  // "my guest bath", "the kids room", "the downstairs powder
                  // room" all match without needing a regex per combination.
                  const ROOM_MODIFIER = '(?:master\\s+|guest\\s+|kids?\\s+|main\\s+|spare\\s+|downstairs\\s+|upstairs\\s+|second\\s+|small\\s+|big\\s+|new\\s+)?'
                  let singleRoomKitchen    = new RegExp(`\\b(?:kitchen)\\s+${ROOM_VERBS}\\b|\\bjust\\s+the\\s+kitchen\\b|\\b${ROOM_VERBS}\\s+(?:the\\s+|my\\s+)?${ROOM_MODIFIER}kitchen\\b`).test(conversationBlob)
                  // Powder room is a separate, smaller scope than a full bathroom
                  // (no shower, smaller footprint). Detect first so the bathroom
                  // path doesn't subsume it.
                  let singleRoomPowderRoom = new RegExp(`\\bpowder\\s+room\\s+${ROOM_VERBS}\\b|\\bjust\\s+the\\s+powder\\s+room\\b|\\b${ROOM_VERBS}\\s+(?:the\\s+|my\\s+)?${ROOM_MODIFIER}powder\\s+room\\b`).test(conversationBlob)
                  let singleRoomBathroom   = !singleRoomPowderRoom && new RegExp(`\\b(?:bathroom|guest\\s+bath|master\\s+bath)\\s+${ROOM_VERBS}\\b|\\bjust\\s+the\\s+bathroom\\b|\\b${ROOM_VERBS}\\s+(?:the\\s+|my\\s+)?${ROOM_MODIFIER}(?:bathroom|bath)\\b`).test(conversationBlob)
                  // Maid's room uses maid_room rate (16k), not bedroom (18k) +
                  // wardrobe. Detect first so the bedroom path doesn't catch it.
                  // "maid's quarters", "servant room", "nanny room" included as
                  // synonyms.
                  let singleRoomMaid       = new RegExp(`\\b(?:maid['\u2019]?s?\\s+(?:room|quarters)|servant['\u2019]?s?\\s+room|nanny['\u2019]?s?\\s+room|helper['\u2019]?s?\\s+room)\\s+${ROOM_VERBS}\\b|\\b${ROOM_VERBS}\\s+(?:the\\s+|my\\s+)?(?:maid['\u2019]?s?\\s+(?:room|quarters)|servant['\u2019]?s?\\s+room|nanny['\u2019]?s?\\s+room|helper['\u2019]?s?\\s+room)\\b`).test(conversationBlob)
                  let singleRoomBedroom    = !singleRoomMaid && new RegExp(`\\b(?:bedroom|master\\s+bed|guest\\s+bed|kids?\\s+room)\\s+${ROOM_VERBS}\\b|\\bjust\\s+the\\s+bedroom\\b|\\b${ROOM_VERBS}\\s+(?:the\\s+|my\\s+)?${ROOM_MODIFIER}bedroom\\b`).test(conversationBlob)
                  let singleRoomLiving     = new RegExp(`\\b(?:living\\s+room|lounge|family\\s+room|sitting\\s+room)\\s+${ROOM_VERBS}\\b|\\bjust\\s+the\\s+living\\s+room\\b|\\b${ROOM_VERBS}\\s+(?:the\\s+|my\\s+)?${ROOM_MODIFIER}(?:living\\s+room|lounge|family\\s+room|sitting\\s+room)\\b`).test(conversationBlob)
                  let singleRoomDining     = new RegExp(`\\b(?:dining\\s+room)\\s+${ROOM_VERBS}\\b|\\bjust\\s+the\\s+dining\\s+room\\b|\\b${ROOM_VERBS}\\s+(?:the\\s+|my\\s+)?${ROOM_MODIFIER}dining\\s+room\\b`).test(conversationBlob)
                  const singleRoomGeneric  = /\b(one room|single room|just\s+(the\s+)?room|(the\s+|my\s+)?room\s+(revamp|redo|refresh|reno|renovation|remodel|upgrade|makeover)|redo\s+(the\s+|my\s+)?room)\b/.test(conversationBlob)

                  // Multi-room "just the X and Y" mode. The verb-anchored
                  // regexes above don't fire when room names appear in a list
                  // joined by "and"/"&"/","/"plus" — there's no verb after
                  // each room. So when the user opens with "just the/my", scan
                  // for room mentions and OR them in.
                  //
                  // Important: the `!singleRoomPowderRoom` / `!singleRoomMaid`
                  // guards are NOT applied here — in a list ("just the powder
                  // room and bathroom"), both rooms should fire independently.
                  // The guards exist only on the verb-anchored direct-match
                  // branches above to avoid double-firing on "powder room
                  // remodel" (which also satisfies the bathroom regex).
                  if (/\bjust\s+(?:the|my)\b/.test(conversationBlob)) {
                    if (/\bpowder\s+room\b/.test(conversationBlob)) singleRoomPowderRoom = true
                    if (/\b(?:bathroom|guest\s+bath|master\s+bath)\b/.test(conversationBlob)) singleRoomBathroom = true
                    if (/\bkitchen\b/.test(conversationBlob)) singleRoomKitchen = true
                    if (/\b(?:maid['\u2019]?s?\s+(?:room|quarters)|servant['\u2019]?s?\s+room|nanny['\u2019]?s?\s+room|helper['\u2019]?s?\s+room)\b/.test(conversationBlob)) singleRoomMaid = true
                    if (/\b(?:bedroom|master\s+bed|guest\s+bed|kids?\s+room)\b/.test(conversationBlob)) singleRoomBedroom = true
                    if (/\b(?:living\s+room|lounge|family\s+room|sitting\s+room)\b/.test(conversationBlob)) singleRoomLiving = true
                    if (/\bdining\s+room\b/.test(conversationBlob)) singleRoomDining = true
                  }

                  // Structural change keyword often names the room being opened
                  // up — "open up the kitchen", "open up the living room". When
                  // it does, treat the named room as also-in-scope so single-
                  // room + structural compose instead of one silently dropping
                  // the other. (E.g. "open up the kitchen and renovate the
                  // master bathroom" should price both kitchen + bathroom.)
                  if (/\bopen\s+up\s+(?:the\s+)?kitchen\b/.test(conversationBlob)) singleRoomKitchen = true
                  if (/\bopen\s+up\s+(?:the\s+)?living\b/.test(conversationBlob)) singleRoomLiving = true
                  if (/\bopen\s+up\s+(?:the\s+)?dining\b/.test(conversationBlob)) singleRoomDining = true

                  // Structural-change-only scope (knock down a wall, open up the
                  // kitchen, etc.). No rooms touched, just a single structural
                  // intervention with optional repaint of the affected area.
                  const isStructuralChange = /\b(knock(?:ing)?\s+down\s+(?:a\s+|the\s+)?wall|tear(?:ing)?\s+down\s+(?:a\s+|the\s+)?wall|remove\s+(?:a\s+|the\s+)?wall|open\s+up\s+(?:the\s+)?(?:kitchen|living|dining|space)|open[\s-]plan|create\s+(?:an?\s+)?open[\s-]plan)\b/.test(conversationBlob)

                  // Paint-only signal: any single-room or whole-property scope
                  // where the intent is paint, not a renovation. When true we
                  // strip out the wardrobe / door / project-base costs that
                  // assume someone is rebuilding the room. Covers transitive
                  // forms ("paint the bedroom"), noun-verb pairs ("bedroom
                  // paint"), and "paint just one X" / "touch up X".
                  const ROOM_NOUNS = '(?:bedroom|bathroom|bath|kitchen|living\\s+room|lounge|family\\s+room|sitting\\s+room|dining\\s+room|powder\\s+room|maid[\'\u2019]?s?\\s+room|room|walls?)'
                  const isPaintOnly =
                    /\b(?:just\s+(?:paint|painting|repaint)|paint(?:ing)?\s+(?:only|the\s+walls)|repaint(?:ing)?|fresh\s+coat|whole\s+(?:place|house|apartment|villa)\s+(?:paint|painting|repaint)|just\s+paint|touch[\s-]?up)\b/.test(conversationBlob) ||
                    new RegExp(`\\bpaint(?:ing)?\\s+(?:just\\s+)?(?:the\\s+|my\\s+|one\\s+)?${ROOM_MODIFIER}${ROOM_NOUNS}\\b`).test(conversationBlob) ||
                    new RegExp(`\\b${ROOM_MODIFIER}${ROOM_NOUNS}\\s+paint(?:ing)?\\b`).test(conversationBlob)

                  const matchedRoomCount =
                    Number(singleRoomKitchen) + Number(singleRoomBathroom) + Number(singleRoomPowderRoom) +
                    Number(singleRoomBedroom) + Number(singleRoomMaid) + Number(singleRoomLiving) +
                    Number(singleRoomDining) + Number(singleRoomGeneric)
                  const isSingleRoom = matchedRoomCount > 0

                  // For a single-room or structural scope, downgrade property
                  // type to apartment so the calculator uses the lighter
                  // project base (25k vs villa 70k).
                  const propertyForCalc = (isSingleRoom || isStructuralChange) ? 'apartment' : rawProperty

                  if (rawProperty && rawSize > 0) {
                    const estInputs = intakeToEstimatorInputs({
                      projectNature: natureUsed,
                      propertyType: propertyForCalc,
                      sizeSqft: rawSize,
                      finishLevel: finish,
                    })

                    const emptyRooms = {
                      bedroom: 0,
                      bathroom: 0,
                      kitchen: 0,
                      living_room: 0,
                      dining_room: 0,
                      maid_room: 0,
                      utility_laundry: 0,
                      corridor_entry: 0,
                    }
                    // Typical single-room footprints in sqm. Powder room is
                    // smaller than a full bathroom; maid's room is smaller than
                    // a master bedroom; living/dining a bit larger.
                    const ROOM_AREA_SQM = { kitchen: 25, bathroom: 12, powderRoom: 8, bedroom: 25, maidRoom: 10, living: 35, dining: 20, generic: 25 }

                    // Structural-change-only: zero rooms, keep property area for
                    // repaint scope. Authority fee scaled down (single permit).
                    if (isStructuralChange && !isSingleRoom) {
                      estInputs.rooms = { ...emptyRooms }
                      estInputs.doors = 0
                      estInputs.wardrobes = 0
                      estInputs.authorityFee = 5_000
                      // Keep builtUpAreaSqm as the user's stated property size
                      // so the painting allowance covers the affected area.
                    }

                    // Multi-room or single-room scope: accumulate matched rooms
                    // so "kitchen and bathroom" prices both, not just the first.
                    if (isSingleRoom) {
                      const rooms = { ...emptyRooms }
                      let area = 0
                      let doors = 0
                      let wardrobes = 0

                      if (singleRoomKitchen)    { rooms.kitchen = 1;     area += ROOM_AREA_SQM.kitchen;    doors += 1 }
                      if (singleRoomBathroom)   { rooms.bathroom = 1;    area += ROOM_AREA_SQM.bathroom;   doors += 1 }
                      if (singleRoomPowderRoom) { /* no room rate, project base + small painting */ area += ROOM_AREA_SQM.powderRoom; doors += 1 }
                      if (singleRoomBedroom)    { rooms.bedroom = 1;     area += ROOM_AREA_SQM.bedroom;    doors += 1; wardrobes += 1 }
                      if (singleRoomMaid)       { rooms.maid_room = 1;   area += ROOM_AREA_SQM.maidRoom;   doors += 1 }
                      if (singleRoomLiving)     { rooms.living_room = 1; area += ROOM_AREA_SQM.living;     doors += 1 }
                      if (singleRoomDining)     { rooms.dining_room = 1; area += ROOM_AREA_SQM.dining;     doors += 1 }
                      if (singleRoomGeneric && area === 0) {
                        rooms.bedroom = 1; area = ROOM_AREA_SQM.generic; doors = 1; wardrobes = 1
                      }

                      // Paint-only overrides: when the verb is paint/repaint and
                      // there's no other reno signal, drop wardrobes (no joinery)
                      // and authority (no permit needed for paint). Keep room
                      // rate at half so we capture prep + labor without
                      // pricing a full reno.
                      if (isPaintOnly) {
                        wardrobes = 0
                        // Half the room base rate by zeroing entries; then add a
                        // flat per-room paint allowance via doors=0.
                        estInputs.rooms = { ...emptyRooms }
                        estInputs.doors = 0
                        estInputs.wardrobes = 0
                        estInputs.builtUpAreaSqm = area
                        estInputs.authorityFee = 0
                      } else {
                        estInputs.rooms = rooms
                        estInputs.builtUpAreaSqm = area
                        estInputs.doors = doors
                        estInputs.wardrobes = wardrobes
                        // Single-room scope rarely needs full DM/Trakhees permit.
                        // Scale fee down: 0 for paint-only, 5k for one room with
                        // light utilities, 10k when 2+ rooms touched.
                        estInputs.authorityFee = matchedRoomCount >= 2 ? 10_000 : 5_000
                      }
                    } else if (isPaintOnly) {
                      // Whole-property paint job ("just paint my apartment"):
                      // strip the room stack, keep the property area for the
                      // painting allowance, drop authority + wardrobes + doors.
                      estInputs.rooms = { ...emptyRooms }
                      estInputs.doors = 0
                      estInputs.wardrobes = 0
                      estInputs.authorityFee = 0
                    }
                    const locationUsed = rawLocation || 'Dubai'
                    const factor = locationFactor(locationUsed)

                    // Compute the full breakdown at the selected finish tier...
                    const selectedBreakdown = calculateEstimate(estInputs)

                    // ...and also the final total at each finish tier, so the client
                    // can render the 4-up comparison row without another round trip.
                    const tiers: Record<FinishLevel, number> = {
                      basic: 0,
                      standard: 0,
                      premium: 0,
                      luxury: 0,
                    }
                    for (const tier of VALID_FINISH) {
                      const tierBreakdown = calculateEstimate({ ...estInputs, finishLevel: tier })
                      tiers[tier] = Math.round(tierBreakdown.finalBudgetAed * factor)
                    }

                    send('estimator_ballpark', {
                      inputs: estInputs,
                      breakdown: selectedBreakdown,
                      factor,
                      finalAed: Math.round(selectedBreakdown.finalBudgetAed * factor),
                      perSqmAed:
                        estInputs.builtUpAreaSqm > 0
                          ? Math.round((selectedBreakdown.finalBudgetAed * factor) / estInputs.builtUpAreaSqm)
                          : 0,
                      tiers,
                      finishLevelUsed: finish,
                      locationUsed,
                      natureUsed,
                      assumedFinish: !rawFinish,
                      assumedLocation: !rawLocation,
                      assumedNature,
                    })
                  }
                }
              } catch {
                console.warn('Failed to parse tool JSON on block_stop')
              }
              currentToolName = ''
              toolInputBuffer = ''
            }
          }
        }

        // Fallback: if buffer parse failed for any reason, try finalMessage
        if (!toolResultSent) {
          const finalMessage = await stream.finalMessage()
          const toolBlock = finalMessage.content.find((b) => b.type === 'tool_use')
          if (toolBlock && toolBlock.type === 'tool_use') {
            send('tool_result', { name: toolBlock.name, input: toolBlock.input })
          }
        }

        send('done', {})
        lastError = null
        break // Success -- exit retry loop
      } catch (err) {
        lastError = err
        const classified = classifyError(err)
        console.error(`Anthropic API error (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`, classified.code, err instanceof Error ? err.message : err)

        if (!classified.retryable || attempt >= MAX_RETRIES) {
          send('error', { code: classified.code, message: classified.message })
          break
        }
        // Retryable -- loop will wait and try again
      }
      } // end retry loop

      controller.close()
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      // Tell nginx/Vercel edge layer not to buffer this response --
      // chunks must reach the client as soon as they are enqueued.
      'X-Accel-Buffering': 'no',
    },
  })
}
