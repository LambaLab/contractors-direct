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

  const { data: emails, error } = await supabase
    .from('lead_emails')
    .select('id, email, is_primary, verified_at')
    .eq('lead_id', leadId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Fetch lead emails error:', error)
    return NextResponse.json({ error: 'Failed to fetch emails' }, { status: 500 })
  }

  return NextResponse.json({ emails: emails ?? [] })
}
