import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * Lightweight endpoint to sync lead metadata (confidence, scope, brief)
 * to Supabase without requiring email verification. This ensures leads
 * appear in the admin dashboard as soon as the AI starts analyzing them.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { sessionId, confidenceScore, modules: scope, brief, metadata } = await req.json()

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Validate ownership
  const { data: lead } = await supabase
    .from('leads')
    .select('id')
    .eq('id', id)
    .eq('session_id', sessionId)
    .single()

  if (!lead) {
    return NextResponse.json({ error: 'Invalid lead or session' }, { status: 404 })
  }

  const update: Record<string, unknown> = {}
  if (typeof confidenceScore === 'number') update.confidence_score = confidenceScore
  if (Array.isArray(scope)) update.scope = scope
  if (typeof brief === 'string' && brief) update.brief = brief
  if (metadata && typeof metadata === 'object') {
    update.metadata = metadata
    if (metadata.projectName) update.project_name = metadata.projectName
    if (metadata.projectOverview) update.project_overview = metadata.projectOverview
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ success: true })
  }

  const { error } = await supabase
    .from('leads')
    .update(update as any)
    .eq('id', id)

  if (error) {
    console.error('sync-metadata error:', error)
    return NextResponse.json({ error: 'Failed to sync' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
