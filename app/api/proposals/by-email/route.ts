import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const leadId = req.nextUrl.searchParams.get('proposalId')
  if (!leadId) {
    return NextResponse.json({ error: 'Missing proposalId' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Get all verified emails for this lead (from lead_emails table)
  const { data: leadEmails } = await supabase
    .from('lead_emails')
    .select('email')
    .eq('lead_id', leadId)

  // Fall back to leads.email if lead_emails has no entries (backward compat)
  let userEmails: string[] = (leadEmails ?? []).map(e => e.email)

  if (userEmails.length === 0) {
    const { data: anchor } = await supabase
      .from('leads')
      .select('email')
      .eq('id', leadId)
      .single()

    if (!anchor?.email) {
      return NextResponse.json({ error: 'Lead not found or no email' }, { status: 404 })
    }
    userEmails = [anchor.email]
  }

  // Find all leads that have any of these emails (via lead_emails)
  const { data: linkedLeadIds } = await supabase
    .from('lead_emails')
    .select('lead_id')
    .in('email', userEmails)

  const leadIds = [...new Set((linkedLeadIds ?? []).map(l => l.lead_id))]

  // Also check leads.email directly for backward compat
  const { data: directLeads } = await supabase
    .from('leads')
    .select('id')
    .in('email', userEmails)

  const allLeadIds = [...new Set([...leadIds, ...(directLeads ?? []).map(l => l.id)])]

  if (allLeadIds.length === 0) {
    return NextResponse.json({ email: userEmails[0], proposals: [] })
  }

  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, confidence_score, saved_at, metadata, slug, brief')
    .in('id', allLeadIds)
    .order('saved_at', { ascending: false, nullsFirst: false })

  if (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  const meaningful = (leads ?? []).filter(p =>
    (p.confidence_score ?? 0) > 0 || (typeof p.brief === 'string' && p.brief.trim().length > 0)
  )

  return NextResponse.json({
    email: userEmails[0],
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
