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
