import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params
  const supabase = createServiceClient()

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id, session_id, user_id, brief, email, scope, confidence_score, metadata, slug')
    .eq('id', leadId)
    .single()

  if (leadError && leadError.code !== 'PGRST116') {
    console.error('[restore] lead fetch error:', leadError)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
  if (!lead) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: dbMessages, error: messagesError } = await supabase
    .from('chat_messages')
    .select('role, content, metadata')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })

  if (messagesError) {
    console.error('[restore] messages fetch error:', messagesError)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  const messages = (dbMessages ?? []).map((m) => {
    const msg: Record<string, unknown> = {
      id: crypto.randomUUID(),
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }
    // Merge rich fields from metadata (question, quickReplies, isBallpark, etc.)
    // so the client can reconstruct interactive elements on restore
    const extra = m.metadata as Record<string, unknown> | null
    if (extra && typeof extra === 'object') {
      Object.assign(msg, extra)
    }
    return msg
  })

  // brief may be null if it was never persisted — fall back to first user message
  const brief = lead.brief
    || messages.find((m) => m.role === 'user')?.content
    || ''

  // Parse metadata blob (projectName, productOverview, scopeSummaries, lastQR)
  const meta = (lead as Record<string, unknown>).metadata as Record<string, unknown> | null

  return NextResponse.json({
    proposalId: lead.id,
    sessionId: lead.session_id,
    userId: lead.user_id ?? '',
    brief,
    email: lead.email ?? null,
    scope: Array.isArray(lead.scope) ? lead.scope : [],
    confidenceScore: typeof lead.confidence_score === 'number' ? lead.confidence_score : 0,
    messages,
    metadata: meta ?? null,
    slug: (lead as Record<string, unknown>).slug ?? null,
  })
}
