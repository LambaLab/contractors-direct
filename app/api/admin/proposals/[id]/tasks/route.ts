import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'

// GET — fetch all tasks for a lead
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdmin()
  if (!auth.admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { id } = await params

  const { data, error } = await supabase
    .from('project_tasks')
    .select('*')
    .eq('lead_id', id)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — create a new task
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdmin()
  if (!auth.admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { id } = await params
  const body = await req.json()

  const { data, error } = await supabase
    .from('project_tasks')
    .insert({ ...body, lead_id: id } as any)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH — update a task
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdmin()
  if (!auth.admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { id } = await params
  const { taskId, updates } = await req.json()

  const allowedFields = ['title', 'description', 'status', 'sort_order', 'complexity', 'estimated_cost_aed', 'actual_cost_aed']
  const filtered = Object.fromEntries(
    Object.entries(updates).filter(([key]) => allowedFields.includes(key))
  )

  const { data, error } = await supabase
    .from('project_tasks')
    .update(filtered as any)
    .eq('id', taskId)
    .eq('lead_id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE — remove a task
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdmin()
  if (!auth.admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { id } = await params
  const { taskId } = await req.json()

  const { error } = await supabase
    .from('project_tasks')
    .delete()
    .eq('id', taskId)
    .eq('lead_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
