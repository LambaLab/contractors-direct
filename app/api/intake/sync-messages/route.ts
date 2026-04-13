import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

type MessageInput = { role: 'user' | 'assistant'; content: string }

export async function POST(req: NextRequest) {
  const body = await req.json()
  const leadId = body.leadId || body.proposalId
  const { sessionId, messages, brief, scope, confidenceScore, metadata } = body
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = createServiceClient() as any

  if (!leadId || !sessionId || !Array.isArray(messages)) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Validate ownership — same pattern as send-otp
  const { data: lead } = await supabaseAny
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .eq('session_id', sessionId)
    .single()

  if (!lead) {
    return NextResponse.json({ error: 'Invalid lead or session' }, { status: 404 })
  }

  if (messages.length > 0) {
    const incoming = (messages as MessageInput[]).map((m) => ({
      lead_id: leadId,
      role: m.role,
      content: m.content,
    }))

    // Deduplicate: fetch the last N messages for this lead and filter out
    // any that already exist (matching role + content). This prevents
    // duplicates caused by client retries or stale SYNCED_COUNT.
    const { data: recent } = await supabaseAny
      .from('chat_messages')
      .select('role, content')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(incoming.length + 5)

    const existingSet = new Set(
      (recent ?? []).map((m: { role: string; content: string }) => `${m.role}::${m.content}`)
    )
    const rows = incoming.filter(
      (m) => !existingSet.has(`${m.role}::${m.content}`)
    )

    if (rows.length > 0) {
      const { error } = await supabaseAny.from('chat_messages').insert(rows as Record<string, unknown>[])
      if (error) {
        console.error('sync-messages insert error:', error)
        return NextResponse.json({ error: 'Failed to save messages' }, { status: 500 })
      }
    }
  }

  // Bump saved_at and persist lead metadata so cross-device restore works.
  // Merge metadata with existing values to prevent concurrent syncs from
  // overwriting each other's fields.
  const leadUpdate: Record<string, unknown> = { saved_at: new Date().toISOString() }
  if (typeof brief === 'string' && brief) leadUpdate.brief = brief
  if (Array.isArray(scope)) leadUpdate.scope = scope
  if (typeof confidenceScore === 'number') leadUpdate.confidence_score = confidenceScore

  if (metadata && typeof metadata === 'object') {
    const { data: existing } = await supabaseAny
      .from('leads')
      .select('metadata')
      .eq('id', leadId)
      .single()
    const merged = { ...((existing?.metadata as Record<string, unknown>) ?? {}), ...metadata }
    leadUpdate.metadata = merged
  }

  const { error: updateError } = await supabaseAny
    .from('leads')
    .update(leadUpdate as any)
    .eq('id', leadId)

  if (updateError) {
    console.error('sync-messages saved_at update error:', updateError)
    return NextResponse.json({ error: 'Failed to update saved_at' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
