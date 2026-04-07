import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { resend, FROM_EMAIL } from '@/lib/email/resend'
import { buildBudgetProposedEmail } from '@/lib/email/templates/budget-proposed'

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth.admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { leadId, amount, clientNotes, internalNotes } = await req.json()

  if (!leadId || !amount || amount <= 0) {
    return NextResponse.json({ error: 'Missing leadId or valid amount' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Create budget proposal
  const { data: budget, error: budgetError } = await supabase
    .from('budget_proposals')
    .insert({
      lead_id: leadId,
      amount,
      client_notes: clientNotes,
      internal_notes: internalNotes,
    })
    .select()
    .single()

  if (budgetError) {
    return NextResponse.json({ error: budgetError.message }, { status: 500 })
  }

  // Update lead status
  await supabase
    .from('leads')
    .update({ status: 'budget_proposed' })
    .eq('id', leadId)

  // Send email notification if email exists
  const { data: lead } = await supabase
    .from('leads')
    .select('email, slug, metadata')
    .eq('id', leadId)
    .single()

  if (lead?.email) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://contractorsdirect.com'
    const slug = lead.slug ?? leadId
    const meta = (lead.metadata ?? {}) as Record<string, unknown>
    const projectName = (meta.projectName as string) ?? 'Your project'
    const budgetUrl = `${appUrl}/proposal/${slug}/budget`

    const { subject, html } = buildBudgetProposedEmail({
      amount,
      projectName,
      clientNotes,
      budgetUrl,
    })

    await resend.emails.send({
      from: FROM_EMAIL,
      to: lead.email,
      subject,
      html,
    })
  }

  return NextResponse.json(budget)
}
