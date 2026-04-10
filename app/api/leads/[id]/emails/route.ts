import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params

  if (!leadId) {
    return NextResponse.json({ error: 'Missing lead ID' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Try lead_emails table first (multi-email support)
  const { data: emails, error } = await supabase
    .from('lead_emails')
    .select('id, email, is_primary, verified_at')
    .eq('lead_id', leadId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })

  if (!error && emails && emails.length > 0) {
    return NextResponse.json({ emails })
  }

  // Fallback: read email from leads table directly
  const { data: lead } = await supabase
    .from('leads')
    .select('id, email, saved_at')
    .eq('id', leadId)
    .single()

  if (lead?.email) {
    return NextResponse.json({
      emails: [{
        id: lead.id,
        email: lead.email,
        is_primary: true,
        verified_at: lead.saved_at ?? new Date().toISOString(),
      }],
    })
  }

  return NextResponse.json({ emails: [] })
}
