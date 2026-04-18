import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params
  const { sessionId } = await req.json()
  if (!leadId || !sessionId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  const supabase = createServiceClient()

  // Look up the target lead. If it doesn't exist, treat the delete as a no-op
  // success — the client will clear its local state regardless.
  const { data: target } = await supabase
    .from('leads')
    .select('email, session_id')
    .eq('id', leadId)
    .single()

  if (!target) {
    return NextResponse.json({ success: true, note: 'lead not found' })
  }

  // Ownership: either (a) the caller's session is on a lead with the same
  // verified email as the target, or (b) the target was created by this same
  // anonymous session_id (no email yet on either side).
  const { data: callerLead } = await supabase
    .from('leads')
    .select('email')
    .eq('session_id', sessionId)
    .single()

  const sameEmail = !!(callerLead?.email && target.email && callerLead.email === target.email)
  const sameAnonSession = target.session_id === sessionId
  if (!sameEmail && !sameAnonSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Delete related records then lead (cascade should handle some, but be explicit)
  await supabase.from('chat_messages').delete().eq('lead_id', leadId)
  await supabase.from('otp_codes').delete().eq('lead_id', leadId)
  await supabase.from('lead_slug_history').delete().eq('lead_id', leadId)
  await supabase.from('leads').delete().eq('id', leadId)

  return NextResponse.json({ success: true })
}
