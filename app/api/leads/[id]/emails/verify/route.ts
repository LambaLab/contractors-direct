import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params
  const body = await req.json()
  const { email, otp } = body

  if (!email || !otp || !leadId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Look up valid, unused, unexpired code
  const { data: otpRecord } = await supabase
    .from('otp_codes')
    .select('id, code')
    .eq('email', email)
    .eq('lead_id', leadId)
    .eq('used', false)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!otpRecord) {
    return NextResponse.json({ error: 'Code expired or not found. Request a new one.' }, { status: 400 })
  }

  if (otpRecord.code !== otp) {
    return NextResponse.json({ error: 'Incorrect code. Please try again.' }, { status: 400 })
  }

  // Mark code as used
  await supabase.from('otp_codes').update({ used: true }).eq('id', otpRecord.id)

  // Insert into lead_emails (non-primary)
  const { error: insertError } = await supabase
    .from('lead_emails')
    .upsert(
      { lead_id: leadId, email, is_primary: false, verified_at: new Date().toISOString() },
      { onConflict: 'lead_id,email' }
    )

  if (insertError) {
    console.error('lead_emails insert error:', insertError)
    return NextResponse.json({ error: 'Failed to add email' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
