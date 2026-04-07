import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateOtp } from '@/lib/email/generate-otp'
import { resend, FROM_EMAIL } from '@/lib/email/resend'
import { buildOtpEmail } from '@/lib/email/templates/otp'

export async function POST(req: NextRequest) {
  const { email, leadId, sessionId } = await req.json()
  if (!email || !leadId || !sessionId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Validate lead/session exist
  const { data: lead } = await supabase
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .eq('session_id', sessionId)
    .single()

  if (!lead) {
    return NextResponse.json({ error: 'Invalid lead or session' }, { status: 404 })
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
    session_id: sessionId,
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
