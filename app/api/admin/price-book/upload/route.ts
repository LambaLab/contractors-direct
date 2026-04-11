import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { verifyAdmin } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizeCategoryName, normalizeDescription } from '@/lib/pricing/category-map'

const anthropic = new Anthropic()

/**
 * POST /api/admin/price-book/upload
 * Upload a BOQ PDF, extract line items via Claude, return summary for review.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth.admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const base64 = buffer.toString('base64')

  // Extract via Claude
  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 32000,
    messages: [{
      role: 'user' as const,
      content: [
        {
          type: 'document' as const,
          source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 },
        },
        {
          type: 'text' as const,
          text: `Extract structured BOQ data from this document. Be concise in descriptions (max 60 chars per line item).

Rules:
1. Extract every line item: sr_no, description (short), quantity, unit, unit_rate_aed, total_aed
2. Group into categories as they appear in the document
3. For lump sum items: quantity=1, unit="LS"
4. If no unit rate: set unit_rate_aed to null
5. Mark subtotal rows with is_subtotal: true
6. Extract grand total, project name, location, contractor, type, revision

Use the extract_boq_data tool.`,
        },
      ],
    }],
    tools: [{
      name: 'extract_boq_data',
      description: 'Extract structured BOQ data',
      input_schema: {
        type: 'object' as const,
        properties: {
          project_name: { type: 'string' },
          contractor_name: { type: ['string', 'null'] },
          project_location: { type: ['string', 'null'] },
          project_type: { type: ['string', 'null'] },
          grand_total_aed: { type: 'number' },
          categories: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                category_total_aed: { type: 'number' },
                line_items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      sr_no: { type: 'string' },
                      description: { type: 'string' },
                      quantity: { type: ['number', 'null'] },
                      unit: { type: ['string', 'null'] },
                      unit_rate_aed: { type: ['number', 'null'] },
                      total_aed: { type: 'number' },
                      is_subtotal: { type: 'boolean' },
                    },
                    required: ['description', 'total_aed'],
                  },
                },
              },
              required: ['name', 'line_items'],
            },
          },
        },
        required: ['project_name', 'grand_total_aed', 'categories'],
      },
    }],
    tool_choice: { type: 'tool', name: 'extract_boq_data' },
  })

  const response = await stream.finalMessage()
  const toolUse = response.content.find(b => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    return NextResponse.json({ error: 'Failed to extract BOQ data from PDF' }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extracted = toolUse.input as any

  // Count items
  const categories = extracted.categories ?? []
  const itemCount = categories.reduce(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sum: number, cat: any) => sum + (cat.line_items ?? []).filter((li: any) => !li.is_subtotal).length,
    0
  )

  return NextResponse.json({
    extracted,
    summary: {
      project_name: extracted.project_name,
      contractor_name: extracted.contractor_name,
      project_location: extracted.project_location,
      grand_total_aed: extracted.grand_total_aed,
      category_count: categories.length,
      item_count: itemCount,
    },
  })
}

/**
 * PUT /api/admin/price-book/upload
 * Import previously extracted BOQ data into historical tables.
 */
export async function PUT(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth.admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { extracted, filename } = await req.json() as { extracted: any; filename: string }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any

  const { data: project, error: projError } = await supabase
    .from('historical_projects')
    .insert({
      project_name: extracted.project_name ?? 'Unnamed Project',
      contractor_name: extracted.contractor_name ?? null,
      project_location: extracted.project_location ?? null,
      project_type: extracted.project_type ?? null,
      grand_total_aed: extracted.grand_total_aed ?? 0,
      source_filename: filename,
      is_latest_revision: true,
    })
    .select('id')
    .single()

  if (projError || !project) {
    return NextResponse.json({ error: projError?.message ?? 'Failed to create project' }, { status: 500 })
  }

  let totalItems = 0
  for (const category of (extracted.categories ?? [])) {
    const normalizedName = normalizeCategoryName(category.name) ?? category.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')

    const { data: cat } = await supabase
      .from('historical_categories')
      .insert({
        project_id: project.id,
        name: category.name,
        normalized_name: normalizedName,
        category_total_aed: category.category_total_aed ?? 0,
      })
      .select('id')
      .single()

    if (!cat) continue

    const lineItems = (category.line_items ?? [])
      .filter((item: { description: string; is_subtotal?: boolean }) => item.description && !item.is_subtotal)
      .map((item: { sr_no?: string; description: string; quantity?: number; unit?: string; unit_rate_aed?: number; total_aed: number }) => ({
        category_id: cat.id,
        project_id: project.id,
        sr_no: item.sr_no ?? null,
        description: item.description,
        quantity: item.quantity ?? null,
        unit: item.unit?.toLowerCase() ?? null,
        unit_rate_aed: item.unit_rate_aed ?? null,
        total_aed: item.total_aed,
        is_subtotal: false,
        normalized_description: normalizeDescription(item.description),
        scope_item_id: normalizeCategoryName(category.name),
      }))

    if (lineItems.length > 0) {
      await supabase.from('historical_line_items').insert(lineItems)
      totalItems += lineItems.length
    }
  }

  return NextResponse.json({
    success: true,
    project_id: project.id,
    items_imported: totalItems,
  })
}
