import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { resend, FROM_EMAIL } from '@/lib/email/resend'
import { buildConfirmationEmail } from '@/lib/email/templates/confirmation'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const email = body.email
  const otp = body.otp
  const leadId = body.leadId || body.proposalId  // SaveForLaterModal sends proposalId
  const sessionId = body.sessionId
  const projectName = body.projectName
  if (!email || !otp || !leadId || !sessionId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Look up a valid, unused, unexpired code
  const { data: otpRecord } = await supabase
    .from('otp_codes')
    .select('id, code')
    .eq('email', email)
    .eq('lead_id', leadId)
    .eq('session_id', sessionId)
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

  // Mark code as used (single-use)
  await supabase.from('otp_codes').update({ used: true }).eq('id', otpRecord.id)

  // Link email to lead
  const { error: updateError } = await supabase
    .from('leads')
    .update({ email, saved_at: new Date().toISOString() })
    .eq('id', leadId)
    .eq('session_id', sessionId)

  if (updateError) {
    console.error('Lead update error:', updateError)
    return NextResponse.json({ error: 'Failed to save project. Please contact support.' }, { status: 500 })
  }

  // Generate a one-time auth token for the email link (30-day expiry)
  const authToken = crypto.randomUUID()
  const tokenExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  await supabase
    .from('leads')
    .update({ email_auth_token: authToken, email_auth_token_expires_at: tokenExpiry })
    .eq('id', leadId)

  // Fetch slug for the email URL
  const { data: leadData } = await supabase
    .from('leads')
    .select('slug')
    .eq('id', leadId)
    .single()

  // Build lead URL with auth token so clicking from inbox auto-authenticates
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const slug = leadData?.slug
  const tokenParam = `t=${authToken}`
  const leadUrl = slug
    ? `${appUrl}/lead/${slug}?${tokenParam}`
    : `${appUrl}/?c=${leadId}&${tokenParam}`
  const { subject, html } = buildConfirmationEmail({ projectName: projectName ?? '', leadUrl })

  const { error: emailError } = await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject,
    html,
  })

  if (emailError) {
    // Non-fatal: lead is saved, email just didn't send
    console.error('Resend confirmation error:', emailError)
  }

  return NextResponse.json({ success: true })
}
