import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateOtp } from '@/lib/email/generate-otp'
import { resend, FROM_EMAIL } from '@/lib/email/resend'
import { buildOtpEmail } from '@/lib/email/templates/otp'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params
  const body = await req.json()
  const email = body.email

  if (!email || !leadId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Validate lead exists
  const { data: lead } = await supabase
    .from('leads')
    .select('id, session_id')
    .eq('id', leadId)
    .single()

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  // Check if email is already verified on this lead
  const { data: existing } = await supabase
    .from('lead_emails')
    .select('id')
    .eq('lead_id', leadId)
    .eq('email', email)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'This email is already linked to this project' }, { status: 409 })
  }

  // Invalidate any existing unused codes for this lead
  await supabase
    .from('otp_codes')
    .update({ used: true })
    .eq('lead_id', leadId)
    .eq('used', false)

  const code = generateOtp()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  const { error: insertError } = await supabase.from('otp_codes').insert({
    email,
    code,
    lead_id: leadId,
    session_id: lead.session_id,
    expires_at: expiresAt,
  })

  if (insertError) {
    console.error('OTP insert error:', insertError)
    return NextResponse.json({ error: 'Failed to create code' }, { status: 500 })
  }

  const { subject, html } = buildOtpEmail({ code })

  const { error: emailError } = await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject,
    html,
  })

  if (emailError) {
    console.error('Resend OTP error:', emailError)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
