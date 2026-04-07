import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { UPDATE_PROPOSAL_TOOL } from '@/lib/ai/tools'
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt'

// Extend Vercel serverless function timeout to 60 s (max on Hobby, well within Pro).
// Without this, Vercel's default 10 s timeout kills the function mid-stream and
// the client receives an empty response with the loading spinner stuck on.
export const maxDuration = 60

const anthropic = new Anthropic()

const MAX_MESSAGES = 50

export async function POST(req: NextRequest) {
  const {
    messages,
    paused,
    confidenceScore: clientConfidence,
    currentPhase: clientPhase,
    currentScope: clientScope,
    scopeQueue: clientQueue,
    completedScopes: clientCompleted,
    turnCount: clientTurnCount,
  } = await req.json()
  const isPaused = paused === true
  const currentConfidence = typeof clientConfidence === 'number' ? clientConfidence : 0
  const phase = typeof clientPhase === 'string' ? clientPhase : 'discovery'
  const currentScope = typeof clientScope === 'string' ? clientScope : ''
  const queue = Array.isArray(clientQueue) ? clientQueue : []
  const completed = Array.isArray(clientCompleted) ? clientCompleted : []
  const turns = typeof clientTurnCount === 'number' ? clientTurnCount : 0

  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return new Response(JSON.stringify({ error: 'Invalid messages' }), { status: 400 })
  }

  const stream = anthropic.messages.stream({
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
          `Phase: ${phase}`,
          `Discovery turn: ${phase === 'discovery' ? turns + 1 : 'N/A (already in ' + phase + ')'}`,
          `Current scope: ${currentScope || 'none'}`,
          `Scope queue: ${queue.length > 0 ? queue.join(', ') : 'empty'}`,
          `Completed scopes: ${completed.length > 0 ? completed.join(', ') : 'none'}`,
          `Confidence: ${currentConfidence}%`,
          // Guard: if there are remaining scopes in queue, strongly prevent wrap_up
          ...(queue.filter(m => !completed.includes(m)).length > 0 && phase === 'deep_dive' ? [
            `\n-- There are ${queue.filter(m => !completed.includes(m)).length} scopes still in the queue that have NOT been discussed: ${queue.filter(m => !completed.includes(m)).join(', ')}. You MUST continue deep_dive with the next scope. Do NOT set current_phase to "wrap_up".`,
          ] : []),
          // On turn 1, strongly nudge the AI to skip discovery and go straight to deep_dive
          ...(phase === 'discovery' && turns === 0 ? [
            `\n-- TURN 1 INSTRUCTION: This is the user's first message. You MUST skip discovery and go directly to deep_dive. Set current_phase: "deep_dive", detect scopes, set current_scope to the first one, and set scope_queue. Set question to "" (empty string) -- this is the stage-setting turn. The UI will auto-trigger the first question after showing the scope checklist card.`,
          ] : []),
          // Force transition when discovery has gone too long
          ...(phase === 'discovery' && turns >= 2 ? [
            `\n-- IMPORTANT: You are on discovery turn ${turns + 1}. Discovery MUST end by turn 3. On THIS turn, set current_phase: "deep_dive", set current_scope to the first detected scope, and set scope_queue to the full ordered list. Do NOT list scope names in follow_up_question -- the UI shows a visual checklist card automatically.`,
          ] : []),
          ...(phase === 'discovery' && turns >= 3 ? [
            `\n-- MANDATORY: You have exceeded the maximum discovery turns. You MUST set current_phase to "deep_dive" NOW. Do NOT set current_phase to "discovery".`,
          ] : []),
        ].join('\n'),
      },
      ...(isPaused ? [{
        type: 'text' as const,
        text: `OVERRIDE: The user has paused auto-questions. They want to chat freely. Current proposal confidence: ${currentConfidence}%.

Still call update_proposal with all metadata fields (detected_scope, confidence_score_delta, updated_brief, project_overview, scope_summaries, project_name). Set follow_up_question to your full conversational response. Set question to "" (empty string). Do NOT set suggest_pause.

## Intent Detection & Action Pills (IMPORTANT)

When the user asks something while paused, detect their INTENT. If the intent maps to a clear action, include quick_replies with style: "pills" so the user gets clickable action buttons. Set question to "" still.

Intent patterns:
- WANTS TO SEE PROGRESS / PROPOSAL (e.g. "what have we agreed on?", "show me what we have", "what does the proposal look like?", "how far along are we?", "what's been decided?"): Acknowledge warmly, then include pills: [{ label: "View Proposal", value: "__view_proposal__", icon: "clipboard" }, { label: "Keep going", value: "__continue__", icon: "chat" }]
- WANTS TO RESUME (e.g. "let's continue", "back to questions", "ready to keep going"): Set suggest_resume: true
- PROCESS / META questions (e.g. "how many more questions?", "how long will this take?", "are we almost done?", "what's left?", "how much more do you need from me?"): Answer helpfully with a concrete estimate (e.g. "About 3-5 more questions to get to a solid proposal") based on current confidence. Reference what's been covered and what's still unknown. ALWAYS include pills: [{ label: "Keep going", value: "__continue__", icon: "chat" }, { label: "View Proposal", value: "__view_proposal__", icon: "clipboard" }]
- UNCLEAR INTENT (e.g. vague or ambiguous message): Acknowledge politely, ask a clarifying question, and include 2-3 pills with likely actions

CRITICAL RULE: EVERY response while paused must end with a clear call to action. Either include quick_replies pills or end with an explicit question/invitation. NEVER leave the user in a dead end with no next step. If you answer a question, always follow up with "Want to keep going?" or similar, and include pills.

## How to handle questions while paused

You are a sharp construction/project consultant. Give real, useful answers based on what you know so far. Be honest about what you can and cannot answer yet. ALWAYS end with a call to action and include pills so the user has a clear next step.

PRICING / BUDGET questions (e.g. "how much will this cost?", "what's the budget?", "can you put a price on this?"):
- If confidence < 50%: You don't have enough info yet. Say something like: "I'd love to give you a number, but at ${currentConfidence}% confidence I'd just be guessing. A few more questions about [name 1-2 specific unknowns like 'material specs' or 'site conditions'] would let me put a real range together."
- If confidence >= 50%: Give a rough directional sense ("Based on what we've covered, this looks like a mid-range build") but note it would sharpen with more detail.
- ALWAYS include pills: [{ label: "Keep going", value: "__continue__", icon: "chat" }, { label: "View Proposal", value: "__view_proposal__", icon: "clipboard" }]

TIMELINE questions (e.g. "how long will this take?"):
- If confidence < 50%: "Timeline depends on scope, and we're still early on defining that."
- If confidence >= 50%: Give a rough range ("Typically 8-12 weeks for something like this") with the caveat that it sharpens with more detail.
- ALWAYS include pills: [{ label: "Keep going", value: "__continue__", icon: "chat" }, { label: "View Proposal", value: "__view_proposal__", icon: "clipboard" }]

MATERIALS / SPEC questions (e.g. "should I use marble?", "what grade of concrete?"):
- Give a real opinion based on what you know. Reference their specific project. "For a villa in this climate, porcelain tiles are a durable and cost-effective alternative to natural stone for the ground floor."
- Include pills: [{ label: "Keep going", value: "__continue__", icon: "chat" }]

FEASIBILITY questions (e.g. "is this possible?", "is this too complex?"):
- Be honest. If it's straightforward, say so. If it's ambitious, name why. Reference comparable projects.
- Include pills: [{ label: "Keep going", value: "__continue__", icon: "chat" }, { label: "View Proposal", value: "__view_proposal__", icon: "clipboard" }]

GENERAL PROJECT questions (e.g. "what do you think about X?", "should I add Y?"):
- Give your opinion as a construction/project consultant would. Be direct. Reference what you know about their project.
- Include pills: [{ label: "Keep going", value: "__continue__", icon: "chat" }]

## Resume flow
When you suggest resuming and the user responds affirmatively (e.g. "yes", "sure", "ok", "let's do it", "yeah"), set suggest_resume: true. The client will automatically resume structured Q&A. Do NOT set suggest_resume on the turn where you suggest it, only when the user confirms.

When suggesting to resume, always frame it as an invitation, not a demand. "Want to pick up where we left off?" or "Ready to continue?" Never pressure.`,
      }] : []),
    ],
    tools: [UPDATE_PROPOSAL_TOOL],
    tool_choice: { type: 'any' },
    messages,
  })

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ event, data })}\n\n`)
        )
      }

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

        // Validate quick_replies has at least one option
        const options = quickReplies.options
        if (!Array.isArray(options) || options.length === 0) {
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
      } catch (err) {
        send('error', { message: err instanceof Error ? err.message : 'Unknown error' })
      } finally {
        controller.close()
      }
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
