import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { verifyAdmin } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { SCOPE_CATALOG } from '@/lib/scope/catalog'

const anthropic = new Anthropic()

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdmin()
  if (!auth.admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { id } = await params

  // Check if request wants BOQ-based generation
  let body: { source?: string } = {}
  try { body = await req.json() } catch { /* empty body is fine */ }

  if (body.source === 'boq') {
    return generateFromBoq(supabase, id)
  }

  // Fetch lead data
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('scope, brief, prd, metadata')
    .eq('id', id)
    .single()

  if (leadError || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const scope = (lead.scope ?? []) as string[]
  const scopeNames = scope.map(mid => SCOPE_CATALOG.find(m => m.id === mid)?.name ?? mid)
  const meta = (lead.metadata ?? {}) as Record<string, unknown>
  const productOverview = (meta.productOverview as string) ?? ''

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `You are a senior software project manager breaking down a project into tasks.

PROJECT BRIEF: ${lead.brief ?? 'No brief available'}

PRODUCT OVERVIEW: ${productOverview}

PRD: ${lead.prd ?? 'No PRD available'}

SCOPE (with IDs): ${scope.map((mid, i) => `${mid} (${scopeNames[i]})`).join(', ')}

For each scope item, generate 3-6 specific, actionable subtasks that a development team would need to complete. Each subtask should be a concrete deliverable, not vague.

Examples of GOOD subtasks:
- "Set up Supabase auth with email/password"
- "Build login and signup screens"
- "Implement session persistence"

Examples of BAD subtasks:
- "Handle authentication" (too vague)
- "Do the backend" (not specific)

Return the breakdown as structured JSON.`,
      },
    ],
    tools: [
      {
        name: 'submit_task_breakdown',
        description: 'Submit the task breakdown for all scope items',
        input_schema: {
          type: 'object' as const,
          properties: {
            scope: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  scope_id: { type: 'string', description: 'The scope ID from the catalog (e.g. auth, database, mobile_app)' },
                  scope_name: { type: 'string', description: 'Human-readable scope name' },
                  tasks: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        title: { type: 'string', description: 'Specific task title' },
                        description: { type: 'string', description: 'Brief description of what this task involves' },
                        complexity: { type: 'string', enum: ['S', 'M', 'L'] },
                      },
                      required: ['title', 'description', 'complexity'],
                    },
                  },
                },
                required: ['scope_id', 'scope_name', 'tasks'],
              },
            },
          },
          required: ['scope'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'submit_task_breakdown' },
  })

  const toolUse = response.content.find(b => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    return NextResponse.json({ error: 'AI generation failed' }, { status: 500 })
  }

  const breakdown = toolUse.input as {
    scope: Array<{
      scope_id: string
      scope_name: string
      tasks: Array<{ title: string; description: string; complexity: string }>
    }>
  }

  // Delete existing tasks for this lead (regeneration)
  await supabase.from('project_tasks').delete().eq('lead_id', id)

  // Insert parent scope items and their subtasks
  const allTasks = []
  for (let i = 0; i < breakdown.scope.length; i++) {
    const mod = breakdown.scope[i]

    // Insert parent (scope row)
    const { data: parent } = await supabase
      .from('project_tasks')
      .insert({
        lead_id: id,
        parent_id: null,
        title: mod.scope_name,
        scope_id: mod.scope_id,
        sort_order: i,
        status: 'todo' as const,
      })
      .select()
      .single()

    if (parent) {
      allTasks.push(parent)

      // Insert subtasks
      const subtasks = mod.tasks.map((task, j) => ({
        lead_id: id,
        parent_id: parent.id,
        title: task.title,
        description: task.description,
        complexity: task.complexity,
        sort_order: j,
        status: 'todo' as const,
      }))

      const { data: children } = await supabase
        .from('project_tasks')
        .insert(subtasks)
        .select()

      if (children) allTasks.push(...children)
    }
  }

  return NextResponse.json(allTasks)
}

/**
 * Generate tasks directly from a locked BOQ.
 * Each BOQ category becomes a parent module, each line item becomes a child task.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateFromBoq(supabase: any, leadId: string) {
  // Fetch the latest locked BOQ for this lead
  const { data: boq, error: boqError } = await supabase
    .from('boq_drafts')
    .select('*')
    .eq('lead_id', leadId)
    .eq('locked', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (boqError || !boq) {
    return NextResponse.json({ error: 'No locked BOQ found for this lead' }, { status: 404 })
  }

  const categories = boq.categories as Array<{
    name: string
    line_items: Array<{
      description: string
      unit: string
      quantity: number
      unit_price_aed: number
      subtotal_aed: number
    }>
    category_subtotal_aed: number
  }>

  if (!Array.isArray(categories) || categories.length === 0) {
    return NextResponse.json({ error: 'BOQ has no categories' }, { status: 400 })
  }

  // Delete existing tasks for this lead
  await supabase.from('project_tasks').delete().eq('lead_id', leadId)

  const allTasks = []

  for (let i = 0; i < categories.length; i++) {
    const category = categories[i]

    // Insert parent (BOQ category as module)
    const { data: parent } = await supabase
      .from('project_tasks')
      .insert({
        lead_id: leadId,
        parent_id: null,
        title: category.name,
        sort_order: i,
        status: 'todo',
        estimated_cost_aed: category.category_subtotal_aed ?? null,
      })
      .select()
      .single()

    if (!parent) continue
    allTasks.push(parent)

    // Insert each line item as a child task
    const lineItems = (category.line_items ?? []).filter(item => item.description)
    const children = lineItems.map((item, j) => ({
      lead_id: leadId,
      parent_id: parent.id,
      title: item.description,
      description: `${item.quantity ?? 0} ${item.unit ?? 'unit'} @ AED ${item.unit_price_aed?.toFixed(0) ?? '0'}`,
      sort_order: j,
      status: 'todo',
      estimated_cost_aed: item.subtotal_aed ?? null,
      boq_line_item_ref: `${i}:${j}`, // category_index:item_index
    }))

    if (children.length > 0) {
      const { data: childRows } = await supabase
        .from('project_tasks')
        .insert(children)
        .select()

      if (childRows) allTasks.push(...childRows)
    }
  }

  return NextResponse.json(allTasks)
}
