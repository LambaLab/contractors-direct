import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  const { id: leadId, emailId } = await params

  const supabase = createServiceClient()

  // Check how many emails this lead has
  const { count } = await supabase
    .from('lead_emails')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId)

  if ((count ?? 0) <= 1) {
    return NextResponse.json(
      { error: 'Cannot remove the last email. You need at least one email linked to access this project.' },
      { status: 400 }
    )
  }

  // Check if this is the primary email
  const { data: target } = await supabase
    .from('lead_emails')
    .select('id, email, is_primary')
    .eq('id', emailId)
    .eq('lead_id', leadId)
    .single()

  if (!target) {
    return NextResponse.json({ error: 'Email not found' }, { status: 404 })
  }

  if (target.is_primary) {
    return NextResponse.json(
      { error: 'Cannot remove the primary email. Set another email as primary first.' },
      { status: 400 }
    )
  }

  await supabase.from('lead_emails').delete().eq('id', emailId)

  return NextResponse.json({ success: true })
}

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  const { id: leadId, emailId } = await params

  const supabase = createServiceClient()

  // Get the target email
  const { data: target } = await supabase
    .from('lead_emails')
    .select('id, email')
    .eq('id', emailId)
    .eq('lead_id', leadId)
    .single()

  if (!target) {
    return NextResponse.json({ error: 'Email not found' }, { status: 404 })
  }

  // Unset all primaries for this lead
  await supabase
    .from('lead_emails')
    .update({ is_primary: false })
    .eq('lead_id', leadId)

  // Set new primary
  await supabase
    .from('lead_emails')
    .update({ is_primary: true })
    .eq('id', emailId)

  // Keep leads.email in sync
  await supabase
    .from('leads')
    .update({ email: target.email })
    .eq('id', leadId)

  return NextResponse.json({ success: true })
}
