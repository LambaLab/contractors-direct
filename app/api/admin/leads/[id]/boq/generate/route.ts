import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { verifyAdmin } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { getHistoricalContext, getPricingSummary } from '@/lib/pricing/historical'
import { flagDeviations } from '@/lib/pricing/deviation'
import type { Json } from '@/lib/supabase/types'

const anthropic = new Anthropic()

/**
 * POST /api/admin/leads/[id]/boq/generate
 * Generate a BOQ draft with streaming - sends categories progressively via SSE.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdmin()
  if (!auth.admin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any
  const { id: leadId } = await params

  let mode = 'full'
  let newScopeIds: string[] = []
  try {
    const body = await _req.json()
    mode = body.mode ?? 'full'
    newScopeIds = body.newScopeIds ?? []
  } catch { /* empty body */ }

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()

  if (leadError || !lead) return new Response(JSON.stringify({ error: 'Lead not found' }), { status: 404 })

  const { data: messages } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })

  const rows = (messages ?? []) as { role: string; content: string }[]
  const chatHistory = rows.map((m) => `${m.role}: ${m.content}`).join('\n\n')

  const allScopeIds = (lead.scope as string[]) ?? []
  const scopeIds = mode === 'merge' && newScopeIds.length > 0 ? newScopeIds : allScopeIds
  const [historicalContext, pricingSummary] = await Promise.all([
    getHistoricalContext(scopeIds),
    getPricingSummary(),
  ])

  const historicalBlock = historicalContext ? `\n\n${historicalContext}` : ''
  const scopeInstruction = mode === 'merge'
    ? `\nIMPORTANT: Only generate categories and line items for these NEW scope items: ${newScopeIds.join(', ')}. Do NOT include items that already exist in the current BOQ.`
    : ''

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: `Based on the following project discovery conversation, generate a complete Bill of Quantities (BOQ) draft for a construction/contracting project.

CONVERSATION:
${chatHistory}

DETECTED SCOPE: ${JSON.stringify(lead.scope)}
PROJECT BRIEF: ${lead.brief}
PROPERTY TYPE: ${lead.property_type ?? 'not specified'}
LOCATION: ${lead.location ?? 'not specified'}
SIZE: ${lead.size_sqft ? `${lead.size_sqft} sqft` : 'not specified'}
CONDITION: ${lead.condition ?? 'not specified'}${historicalBlock}${scopeInstruction}

Generate a structured BOQ with the following:
1. Categories: Group line items into standard construction categories relevant to this project (e.g., Demolition, Flooring, Electrical, Joinery, Painting, HVAC, Plumbing). Use specific category names, not generic ones like "Structural" or "Finishes".
2. Line Items: For each category, list specific work items with:
   - Item description (clear, specific, e.g. "Supply and install porcelain floor tiles 600x600mm" not "Flooring")
   - Unit of measurement (sqm, m, nos, LS, kg, set, etc.)
   - Estimated quantity
   - Unit price in AED
   - Subtotal (quantity x unit price)
   - historical_avg_rate: average historical rate for similar items if available (null if not available)
   - deviation_pct: percentage deviation from historical average (null if no reference)
3. Category subtotals and grand total
4. Assumptions and exclusions

Use realistic AED pricing for the UAE market grounded in the historical pricing reference above. Be specific about materials and specifications where the conversation provides enough detail.

Format as structured JSON using the submit_boq_draft tool.`,
      },
    ],
    tools: [
      {
        name: 'submit_boq_draft',
        description: 'Submit the completed BOQ draft document',
        input_schema: {
          type: 'object' as const,
          properties: {
            summary: { type: 'string', description: 'Executive summary of the BOQ scope and key cost drivers' },
            categories: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  line_items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        description: { type: 'string' },
                        unit: { type: 'string' },
                        quantity: { type: 'number' },
                        unit_price_aed: { type: 'number' },
                        subtotal_aed: { type: 'number' },
                        historical_avg_rate: { type: ['number', 'null'] },
                        deviation_pct: { type: ['number', 'null'] },
                      },
                      required: ['description', 'unit', 'quantity', 'unit_price_aed', 'subtotal_aed'],
                    },
                  },
                  category_subtotal_aed: { type: 'number' },
                },
                required: ['name', 'line_items', 'category_subtotal_aed'],
              },
            },
            grand_total_aed: { type: 'number' },
            assumptions: { type: 'array', items: { type: 'string' } },
            exclusions: { type: 'array', items: { type: 'string' } },
          },
          required: ['summary', 'categories', 'grand_total_aed', 'assumptions', 'exclusions'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'submit_boq_draft' },
  })

  // Stream response as SSE - parse categories progressively from tool JSON
  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event, data })}\n\n`))
      }

      let toolBuffer = ''
      let lastCategoryCount = 0

      // Try to extract complete categories from the buffer
      function tryExtractCategories() {
        // Find the categories array in the JSON
        const catStart = toolBuffer.indexOf('"categories"')
        if (catStart === -1) return

        // Find the opening bracket
        let bracketStart = toolBuffer.indexOf('[', catStart)
        if (bracketStart === -1) return

        // Try to parse individual category objects
        let depth = 0
        let inStr = false
        let strEsc = false
        let objStart = -1
        const extractedCategories: unknown[] = []

        for (let i = bracketStart; i < toolBuffer.length; i++) {
          const ch = toolBuffer[i]
          if (inStr) {
            if (strEsc) { strEsc = false }
            else if (ch === '\\') { strEsc = true }
            else if (ch === '"') { inStr = false }
          } else {
            if (ch === '"') { inStr = true }
            else if (ch === '{') {
              if (depth === 1 && objStart === -1) objStart = i
              depth++
            }
            else if (ch === '[') { depth++ }
            else if (ch === '}' || ch === ']') {
              depth--
              if (depth === 1 && ch === '}' && objStart !== -1) {
                // Complete category object
                const objStr = toolBuffer.slice(objStart, i + 1)
                try {
                  const cat = JSON.parse(objStr)
                  if (cat.name && cat.line_items) {
                    extractedCategories.push(cat)
                  }
                } catch { /* incomplete */ }
                objStart = -1
              }
            }
          }
        }

        // Send any new categories
        if (extractedCategories.length > lastCategoryCount) {
          for (let i = lastCategoryCount; i < extractedCategories.length; i++) {
            send('category', extractedCategories[i])
          }
          lastCategoryCount = extractedCategories.length
        }
      }

      try {
        send('start', { mode })

        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'input_json_delta') {
            toolBuffer += chunk.delta.partial_json
            tryExtractCategories()
          }
        }

        // Parse complete result
        const response = await stream.finalMessage()
        const toolUse = response.content.find(b => b.type === 'tool_use')

        if (!toolUse || toolUse.type !== 'tool_use') {
          send('error', { message: 'Failed to generate BOQ' })
          controller.close()
          return
        }

        const boqData = toolUse.input as {
          summary: string
          categories: Json
          grand_total_aed: number
          assumptions: Json
          exclusions: Json
        }

        // Run deviation flagging
        const deviationFlags = flagDeviations(
          boqData.categories as unknown as Parameters<typeof flagDeviations>[0],
          pricingSummary,
        )

        // Save to DB
        if (mode === 'merge') {
          const { data: existingBoq } = await supabase
            .from('boq_drafts')
            .select('*')
            .eq('lead_id', leadId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (existingBoq) {
            const existingCats = (existingBoq.categories ?? []) as unknown[]
            const newCats = boqData.categories as unknown[]
            const mergedCats = [...existingCats, ...newCats]
            const mergedTotal = (existingBoq.grand_total_aed ?? 0) + boqData.grand_total_aed

            await supabase
              .from('boq_drafts')
              .update({
                categories: mergedCats,
                grand_total_aed: mergedTotal,
                deviation_flags: deviationFlags.length > 0 ? deviationFlags : existingBoq.deviation_flags,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingBoq.id)
          }
        } else {
          await supabase.from('boq_drafts').delete().eq('lead_id', leadId)
          await supabase
            .from('boq_drafts')
            .insert({
              lead_id: leadId,
              categories: boqData.categories,
              grand_total_aed: boqData.grand_total_aed,
              assumptions: boqData.assumptions,
              exclusions: boqData.exclusions,
              deviation_flags: deviationFlags.length > 0 ? deviationFlags : null,
            })
        }

        send('complete', {
          categories: boqData.categories,
          grand_total_aed: boqData.grand_total_aed,
          assumptions: boqData.assumptions,
          exclusions: boqData.exclusions,
        })
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
      'X-Accel-Buffering': 'no',
    },
  })
}
