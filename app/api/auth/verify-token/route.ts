import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * POST /api/auth/verify-token
 * Validates a one-time email auth token and returns restore data.
 * Used when a user clicks the lead link from their email inbox.
 */
export async function POST(req: NextRequest) {
  const { token, leadId } = await req.json()
  if (!token || !leadId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Look up lead by ID and verify token matches
  const { data: lead, error } = await supabase
    .from('leads')
    .select('id, session_id, user_id, brief, email, scope, confidence_score, metadata, slug, email_auth_token, email_auth_token_expires_at')
    .eq('id', leadId)
    .single()

  if (error || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  // Validate token
  if (!lead.email_auth_token || lead.email_auth_token !== token) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  // Check expiry (30-day tokens)
  if (lead.email_auth_token_expires_at && new Date(lead.email_auth_token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Token expired' }, { status: 401 })
  }

  // Token is valid — fetch messages for full restore
  const { data: dbMessages } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })

  const messages = (dbMessages ?? []).map((m) => ({
    id: crypto.randomUUID(),
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  const brief = lead.brief
    || messages.find((m) => m.role === 'user')?.content
    || ''

  const meta = (lead as Record<string, unknown>).metadata as Record<string, unknown> | null

  return NextResponse.json({
    leadId: lead.id,
    sessionId: lead.session_id,
    userId: lead.user_id ?? '',
    brief,
    email: lead.email ?? null,
    scope: Array.isArray(lead.scope) ? lead.scope : [],
    confidenceScore: typeof lead.confidence_score === 'number' ? lead.confidence_score : 0,
    messages,
    metadata: meta ?? null,
    slug: (lead as Record<string, unknown>).slug ?? null,
    verified: true, // signals auto-authentication
  })
}
