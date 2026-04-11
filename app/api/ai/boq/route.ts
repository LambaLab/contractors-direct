import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import type { Database, Json } from '@/lib/supabase/types'
import { getHistoricalContext, getPricingSummary } from '@/lib/pricing/historical'
import { flagDeviations } from '@/lib/pricing/deviation'

type Lead = Database['public']['Tables']['leads']['Row']

const anthropic = new Anthropic()

export async function POST(req: NextRequest) {
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { leadId } = await req.json()
  if (!leadId) return NextResponse.json({ error: 'Missing leadId' }, { status: 400 })

  const supabase = createServiceClient()

  const { data } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .eq('user_id', user.id)
    .single()

  const lead = data as Lead | null
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (lead.status !== 'draft') return NextResponse.json({ error: 'BOQ already generated' }, { status: 409 })

  const { data: messages } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })

  const rows = (messages ?? []) as { role: string; content: string }[]
  const chatHistory = rows.map((m) => `${m.role}: ${m.content}`).join('\n\n')

  // Fetch historical pricing context for the detected scope
  const scopeIds = (lead.scope as string[]) ?? []
  const [historicalContext, pricingSummary] = await Promise.all([
    getHistoricalContext(scopeIds),
    getPricingSummary(),
  ])

  const historicalBlock = historicalContext
    ? `\n\n${historicalContext}`
    : ''

  const response = await anthropic.messages.create({
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
CONDITION: ${lead.condition ?? 'not specified'}${historicalBlock}

Generate a structured BOQ with the following:
1. Categories: Group line items into standard construction categories relevant to this project (e.g., Demolition, Flooring, Electrical, Joinery, Painting, HVAC, Plumbing). Use specific category names, not generic ones like "Structural" or "Finishes".
2. Line Items: For each category, list specific work items with:
   - Item description (clear, specific, e.g. "Supply and install porcelain floor tiles 600x600mm" not "Flooring")
   - Unit of measurement (sqm, m, nos, LS, kg, set, etc.)
   - Estimated quantity
   - Unit price in AED
   - Subtotal (quantity x unit price)
   - historical_avg_rate: average historical rate for similar items if available from the reference data above (null if not available)
   - deviation_pct: percentage deviation from historical average (positive = above, negative = below, null if no reference)
3. Category subtotals and grand total
4. Assumptions and exclusions

Use realistic AED pricing for the UAE market grounded in the historical pricing reference above. Be specific about materials and specifications where the conversation provides enough detail. Where details are missing, use reasonable defaults and note them in assumptions.

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
            summary: {
              type: 'string',
              description: 'Executive summary of the BOQ scope and key cost drivers (markdown)',
            },
            categories: {
              type: 'array',
              description: 'BOQ categories with line items',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'Category name (e.g., Demolition, Flooring, Electrical Works, Joinery, Painting)',
                  },
                  line_items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        description: { type: 'string', description: 'Specific work item description' },
                        unit: { type: 'string', description: 'Unit of measurement (sqm, m, nos, LS, kg, set, etc.)' },
                        quantity: { type: 'number', description: 'Estimated quantity' },
                        unit_price_aed: { type: 'number', description: 'Unit price in AED' },
                        subtotal_aed: { type: 'number', description: 'Line item subtotal (quantity x unit_price_aed)' },
                        historical_avg_rate: { type: ['number', 'null'], description: 'Average historical unit rate for similar items (AED), if available' },
                        deviation_pct: { type: ['number', 'null'], description: 'Percentage deviation from historical average (-100 to +100)' },
                      },
                      required: ['description', 'unit', 'quantity', 'unit_price_aed', 'subtotal_aed'],
                    },
                  },
                  category_subtotal_aed: {
                    type: 'number',
                    description: 'Sum of all line item subtotals in this category',
                  },
                },
                required: ['name', 'line_items', 'category_subtotal_aed'],
              },
            },
            grand_total_aed: {
              type: 'number',
              description: 'Grand total of all category subtotals in AED',
            },
            assumptions: {
              type: 'array',
              description: 'List of assumptions made during estimation',
              items: { type: 'string' },
            },
            exclusions: {
              type: 'array',
              description: 'List of items explicitly excluded from this BOQ',
              items: { type: 'string' },
            },
          },
          required: ['summary', 'categories', 'grand_total_aed', 'assumptions', 'exclusions'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'submit_boq_draft' },
  })

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

  // Run deviation flagging against historical data
  const deviationFlags = flagDeviations(
    boqData.categories as Parameters<typeof flagDeviations>[0],
    pricingSummary,
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertError } = await (supabase as any)
    .from('boq_drafts')
    .insert({
      lead_id: leadId,
      categories: boqData.categories,
      grand_total_aed: boqData.grand_total_aed,
      assumptions: boqData.assumptions,
      exclusions: boqData.exclusions,
      deviation_flags: deviationFlags.length > 0 ? deviationFlags : null,
    })

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, deviationFlags })
}
