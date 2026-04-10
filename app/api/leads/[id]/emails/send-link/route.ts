import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { resend, FROM_EMAIL } from '@/lib/email/resend'
import { buildConfirmationEmail } from '@/lib/email/templates/confirmation'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params
  const body = await req.json()
  const emails: string[] = body.emails

  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return NextResponse.json({ error: 'No emails selected' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Validate all emails are verified for this lead
  const { data: verified } = await supabase
    .from('lead_emails')
    .select('email')
    .eq('lead_id', leadId)
    .in('email', emails)

  const verifiedEmails = (verified ?? []).map(v => v.email)
  const unverified = emails.filter(e => !verifiedEmails.includes(e))
  if (unverified.length > 0) {
    return NextResponse.json({ error: `Unverified emails: ${unverified.join(', ')}` }, { status: 403 })
  }

  // Fetch lead data for the email
  const { data: lead } = await supabase
    .from('leads')
    .select('slug, metadata')
    .eq('id', leadId)
    .single()

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  const meta = lead.metadata as Record<string, unknown> | null
  const projectName = (meta?.projectName as string) || ''
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  // Generate fresh auth token (30-day expiry)
  const authToken = crypto.randomUUID()
  const tokenExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  await supabase
    .from('leads')
    .update({ email_auth_token: authToken, email_auth_token_expires_at: tokenExpiry })
    .eq('id', leadId)

  const leadUrl = `${appUrl}/?c=${leadId}&t=${authToken}`
  const { subject, html } = buildConfirmationEmail({ projectName, leadUrl })

  // Send to all selected emails
  const results = await Promise.allSettled(
    verifiedEmails.map(email =>
      resend.emails.send({ from: FROM_EMAIL, to: email, subject, html })
    )
  )

  const failed = results.filter(r => r.status === 'rejected').length
  if (failed === verifiedEmails.length) {
    return NextResponse.json({ error: 'Failed to send emails' }, { status: 500 })
  }

  return NextResponse.json({ success: true, sent: verifiedEmails.length - failed })
}
