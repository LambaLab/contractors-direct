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

  // Ownership check: caller's session must belong to a lead with the same email
  const { data: callerLead } = await supabase
    .from('leads')
    .select('email')
    .eq('session_id', sessionId)
    .single()

  const { data: target } = await supabase
    .from('leads')
    .select('email')
    .eq('id', leadId)
    .single()

  if (!callerLead?.email || !target?.email || callerLead.email !== target.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Delete related records then lead (cascade should handle some, but be explicit)
  await supabase.from('chat_messages').delete().eq('lead_id', leadId)
  await supabase.from('otp_codes').delete().eq('lead_id', leadId)
  await supabase.from('lead_slug_history').delete().eq('lead_id', leadId)
  await supabase.from('leads').delete().eq('id', leadId)

  return NextResponse.json({ success: true })
}
