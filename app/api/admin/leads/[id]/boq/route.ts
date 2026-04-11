import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/admin/leads/[id]/boq
 * Fetch the latest BOQ draft for a lead.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdmin()
  if (!auth.admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { id } = await params

  // Fetch BOQ + lead scope/timestamps in parallel
  const [boqResult, leadResult] = await Promise.all([
    supabase
      .from('boq_drafts')
      .select('*')
      .eq('lead_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('leads')
      .select('scope, brief, updated_at')
      .eq('id', id)
      .single(),
  ])

  if (boqResult.error) return NextResponse.json({ error: boqResult.error.message }, { status: 500 })

  // Include lead context so client can detect changes
  return NextResponse.json({
    boq: boqResult.data,
    lead: leadResult.data ? {
      scope: leadResult.data.scope,
      brief: leadResult.data.brief,
      updated_at: leadResult.data.updated_at,
    } : null,
  })
}

/**
 * PATCH /api/admin/leads/[id]/boq
 * Update BOQ categories/line items (inline editing).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdmin()
  if (!auth.admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { id } = await params
  const { boqId, categories, grand_total_aed } = await req.json()

  if (!boqId) return NextResponse.json({ error: 'Missing boqId' }, { status: 400 })

  // Check if locked
  const { data: existing } = await supabase
    .from('boq_drafts')
    .select('locked')
    .eq('id', boqId)
    .eq('lead_id', id)
    .single()

  if (!existing) return NextResponse.json({ error: 'BOQ not found' }, { status: 404 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((existing as any).locked) return NextResponse.json({ error: 'BOQ is locked' }, { status: 409 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('boq_drafts')
    .update({
      categories,
      grand_total_aed,
      updated_at: new Date().toISOString(),
    })
    .eq('id', boqId)
    .eq('lead_id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
