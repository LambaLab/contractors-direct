import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { verifyAdmin } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { getHistoricalContext, getPricingSummary } from '@/lib/pricing/historical'
import { flagDeviations } from '@/lib/pricing/deviation'
import type { Json } from '@/lib/supabase/types'

const anthropic = new Anthropic()

/**
 * POST /api/admin/leads/[id]/boq/generate
 * Generate a BOQ draft for a lead using AI + historical pricing data.
 * Admin-authenticated (no user_id check, no status restriction).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdmin()
  if (!auth.admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any
  const { id: leadId } = await params

  // Check for merge mode (add new scope only)
  let mode = 'full'
  let newScopeIds: string[] = []
  try {
    const body = await _req.json()
    mode = body.mode ?? 'full'
    newScopeIds = body.newScopeIds ?? []
  } catch { /* empty body is fine */ }

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()

  if (leadError || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  // Fetch chat history
  const { data: messages } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })

  const rows = (messages ?? []) as { role: string; content: string }[]
  const chatHistory = rows.map((m) => `${m.role}: ${m.content}`).join('\n\n')

  // Fetch historical pricing context
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

  const response = await stream.finalMessage()

  const toolUse = response.content.find((b) => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    return NextResponse.json({ error: 'Failed to generate BOQ draft' }, { status: 500 })
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

  if (mode === 'merge') {
    // Merge: append new categories to existing BOQ
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

      const { data: updated, error: updateError } = await supabase
        .from('boq_drafts')
        .update({
          categories: mergedCats,
          grand_total_aed: mergedTotal,
          deviation_flags: deviationFlags.length > 0 ? deviationFlags : existingBoq.deviation_flags,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingBoq.id)
        .select()
        .single()

      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
      return NextResponse.json(updated)
    }
  }

  // Full mode: delete existing and create new
  await supabase.from('boq_drafts').delete().eq('lead_id', leadId)

  // Insert new BOQ
  const { data: boq, error: insertError } = await supabase
    .from('boq_drafts')
    .insert({
      lead_id: leadId,
      categories: boqData.categories,
      grand_total_aed: boqData.grand_total_aed,
      assumptions: boqData.assumptions,
      exclusions: boqData.exclusions,
      deviation_flags: deviationFlags.length > 0 ? deviationFlags : null,
    })
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json(boq)
}
