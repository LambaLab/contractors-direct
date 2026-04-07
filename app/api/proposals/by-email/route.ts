import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const leadId = req.nextUrl.searchParams.get('proposalId')
  if (!leadId) {
    return NextResponse.json({ error: 'Missing proposalId' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Look up the anchor lead to get its email
  const { data: anchor } = await supabase
    .from('leads')
    .select('email')
    .eq('id', leadId)
    .single()

  if (!anchor?.email) {
    return NextResponse.json({ error: 'Lead not found or no email' }, { status: 404 })
  }

  // Fetch all leads for that email
  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, confidence_score, saved_at, metadata, slug, brief')
    .eq('email', anchor.email)
    .order('saved_at', { ascending: false, nullsFirst: false })

  if (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  const meaningful = (leads ?? []).filter(p =>
    (p.confidence_score ?? 0) > 0 || (typeof p.brief === 'string' && p.brief.trim().length > 0)
  )

  return NextResponse.json({
    email: anchor.email,
    proposals: meaningful.map((p) => {
      const meta = (p.metadata && typeof p.metadata === 'object' && !Array.isArray(p.metadata))
        ? (p.metadata as Record<string, unknown>)
        : null
      return {
        id: p.id,
        projectName: (meta?.projectName as string) || 'Untitled Proposal',
        confidenceScore: p.confidence_score ?? 0,
        savedAt: p.saved_at,
        slug: (p as Record<string, unknown>).slug ?? null,
      }
    }),
  })
}
